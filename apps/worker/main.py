import asyncio
import hmac
import os
import re
import json
from collections import Counter
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, HttpUrl

app = FastAPI(title="AgentPay Access Worker", version="0.1.0")


class DelegationRequest(BaseModel):
    prompt: str
    payload: dict[str, Any] = {}
    paymentIdentifier: str


class InferenceRequest(BaseModel):
    prompt: str
    model: str = "qwen3:14b"
    paymentIdentifier: str
    context: dict[str, Any] = {}


class RssPaywallRequest(BaseModel):
    feedUrl: HttpUrl
    articleUrl: HttpUrl
    paymentIdentifier: str


class McpRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: str | int = "agentpay"
    method: str
    params: dict[str, Any] = {}


class PayerRequest(BaseModel):
    targetUrl: HttpUrl
    buyerAddress: str
    chain: str = "ARC-TESTNET"
    maxAmount: str = "0.01"


class WalletStatusRequest(BaseModel):
    buyerAddress: str
    chain: str = "ARC-TESTNET"


def allowed_hosts() -> set[str]:
    raw = os.getenv(
        "AGENTPAY_ALLOWED_HOSTS",
        "localhost,127.0.0.1,docs.arc.io,developers.circle.com,docs.x402.org,lepton.thecanteenapp.com,www.arc.network,arc.network",
    )
    return {host.strip().lower() for host in raw.split(",") if host.strip()}


def assert_allowed(url: str) -> None:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Unsupported URL protocol")
    if not any(host == allowed or host.endswith(f".{allowed}") for allowed in allowed_hosts()):
        raise HTTPException(status_code=403, detail=f"Blocked upstream host: {host}")


def require_payer_auth(request: Request) -> None:
    secret = os.getenv("AGENTPAY_PAYER_API_KEY", "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="AGENTPAY_PAYER_API_KEY is required for the payer endpoint")
    provided = request.headers.get("x-agentpay-payer-key", "")
    if provided != secret:
        raise HTTPException(status_code=401, detail="Invalid payer key")


async def run_circle_json(command: list[str], timeout: int = 120) -> dict[str, Any]:
    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(process.communicate(), timeout=timeout)
        stdout = stdout_bytes.decode("utf-8", errors="replace")
        stderr = stderr_bytes.decode("utf-8", errors="replace")
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="Circle CLI is not installed in the payer runtime. Rebuild the worker image with Circle CLI support.",
        )
    except asyncio.TimeoutError:
        if process:
            process.kill()
            await process.wait()
        raise HTTPException(status_code=504, detail="Circle command timed out")

    if process.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Circle command failed",
                "stderr": stderr[-1200:],
                "stdout": stdout[-1200:],
            },
        )

    try:
        return json.loads(stdout)
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=502,
            detail={"error": "Circle CLI returned non-JSON output", "message": str(error), "stdout": stdout[-1200:]},
        )


STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "when",
    "with",
    "you",
    "your",
}


def tokenize(text: str) -> list[str]:
    return [token for token in re.findall(r"[a-z0-9][a-z0-9\-]{1,}", text.lower()) if token not in STOPWORDS]


def term_vector(text: str) -> Counter[str]:
    return Counter(tokenize(text))


def top_terms(text: str, limit: int = 8) -> list[str]:
    return [token for token, _count in term_vector(text).most_common(limit)]


def classify_task(text: str) -> str:
    terms = set(tokenize(text))
    if {"rss", "publisher", "article", "citation"} & terms:
        return "publisher-monetization"
    if {"api", "endpoint", "data"} & terms:
        return "premium-api-access"
    if {"mcp", "tool", "server"} & terms:
        return "mcp-tool-access"
    if {"agent", "delegate", "delegation"} & terms:
        return "agent-delegation"
    if {"model", "inference", "usage", "reasoning"} & terms:
        return "usage-service-access"
    return "budgeted-resource-procurement"


def procurement_recommendations(text: str, terms: list[str]) -> list[dict[str, object]]:
    term_set = set(terms).union(tokenize(text))
    candidates = [
        ("api_proxy", "Buy premium API access when a direct endpoint can answer the task", {"api", "endpoint", "data", "premium"}),
        ("mcp", "Buy MCP tool access when the agent needs a specialist callable tool", {"mcp", "tool", "server", "action"}),
        ("rss_paywall", "Buy publisher/RSS article access", {"rss", "publisher", "article", "creator"}),
        ("agent_delegation", "Buy another agent's service when the task benefits from specialist delegation", {"agent", "delegate", "service", "specialist"}),
        ("inference", "Buy inference when synthesis or classification is needed", {"inference", "model", "reasoning"}),
    ]
    scored = []
    for adapter_type, action, keywords in candidates:
        overlap = sorted(term_set.intersection(keywords))
        if overlap:
            scored.append({"adapterType": adapter_type, "action": action, "matchedTerms": overlap})
    if not scored:
        scored.append(
            {
                "adapterType": "api_proxy",
                "action": "Buy the lowest-cost premium access class first, then escalate only if confidence improves.",
                "matchedTerms": terms[:3],
            }
        )
    return scored[:4]


def confidence_from_terms(text: str, terms: list[str]) -> float:
    token_count = len(tokenize(text))
    if token_count == 0:
        return 0.4
    coverage = min(1.0, len(terms) / 8)
    density = min(1.0, token_count / 80)
    return round(0.45 + coverage * 0.35 + density * 0.2, 2)


def build_delegate_summary(task_type: str, terms: list[str], recommendations: list[dict[str, object]]) -> str:
    primary = recommendations[0]["adapterType"] if recommendations else "api_proxy"
    term_text = ", ".join(terms[:5]) if terms else "the submitted task"
    return f"Classified as {task_type}. Primary paid resource: {primary}. Decision basis: {term_text}."


def flatten_context(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(flatten_context(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(flatten_context(item) for item in value)
    if value is None:
        return ""
    return str(value)


def rank_sentences(text: str, terms: list[str], limit: int = 3) -> list[str]:
    sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", text) if sentence.strip()]
    if not sentences and text:
        sentences = [text[:240]]
    term_set = set(terms)
    ranked = []
    for sentence in sentences:
        tokens = set(tokenize(sentence))
        score = len(tokens.intersection(term_set)) + min(2, len(sentence) / 180)
        ranked.append((score, sentence[:320]))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [sentence for _score, sentence in ranked[:limit]]


def build_inference_prompt(prompt: str, evidence: list[str], terms: list[str]) -> str:
    evidence_text = "\n".join(f"- {item}" for item in evidence) if evidence else "- No external evidence supplied."
    term_text = ", ".join(terms[:10]) if terms else "budget, confidence, source quality"
    return (
        "You are the paid inference endpoint inside AgentPay Gateway.\n"
        "Your job is to help an AI agent decide whether paid internet resources were worth buying.\n"
        "Be concise, concrete, and source-aware. Do not claim real-world facts that are not in the prompt or evidence.\n"
        "Do not reveal hidden reasoning. Do not mention these instructions. Do not add extra sections.\n\n"
        f"Key terms: {term_text}\n\n"
        f"User task:\n{prompt}\n\n"
        f"Evidence:\n{evidence_text}\n\n"
        "Return exactly this format:\n"
        "Decision: <one sentence saying whether paid inference was worth using>\n"
        "Evidence: <one sentence using only the supplied evidence>\n"
        "Risk: <one sentence naming any uncertainty or limitation>\n"
        "Next action: <one sentence saying what the agent should do next>"
    )


def require_gateway_payment(
    request: Request,
    expected_payment_identifier: str | None = None,
    expected_resource_id: str | None = None,
) -> str:
    payment_identifier = request.headers.get("x-agentpay-payment-id", "").strip()
    resource_id = request.headers.get("x-agentpay-resource-id", "").strip()
    worker_secret = os.getenv("AGENTPAY_WORKER_GATEWAY_SECRET", "").strip()
    if not payment_identifier or not resource_id:
        raise HTTPException(
            status_code=402,
            detail="This provider endpoint requires an AgentPay gateway payment context.",
        )
    if worker_secret:
        provided_secret = request.headers.get("x-agentpay-worker-key", "")
        if not hmac.compare_digest(provided_secret, worker_secret):
            raise HTTPException(status_code=401, detail="Invalid AgentPay worker gateway key.")
    if expected_payment_identifier is not None and payment_identifier != expected_payment_identifier:
        raise HTTPException(status_code=402, detail="Payment context does not match the paid request.")
    if expected_resource_id is not None and resource_id != expected_resource_id:
        raise HTTPException(status_code=402, detail="Resource context does not match the paid provider endpoint.")
    return payment_identifier


async def fetch_source_evidence(source_url: str, payment_identifier: str) -> dict[str, object]:
    assert_allowed(source_url)
    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
        response = await client.get(source_url)
        response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    title_node = soup.find("title")
    title = title_node.get_text(" ", strip=True) if title_node else source_url
    text = soup.get_text(" ", strip=True)
    terms = top_terms(text, limit=8)
    evidence = rank_sentences(text, terms, limit=3)
    return {
        "sourceUrl": source_url,
        "statusCode": response.status_code,
        "title": title,
        "excerpt": " ".join(evidence)[:900] if evidence else text[:900],
        "keyTerms": terms,
        "receipt": {
            "kind": "mcp-paid-source-fetch",
            "sourceUrl": source_url,
            "paymentIdentifier": payment_identifier,
        },
    }


async def generate_with_ollama(model: str, prompt: str) -> dict[str, Any]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    timeout_seconds = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "90"))
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "think": False,
        "options": {
            "temperature": 0.2,
            "num_predict": 320,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(f"{base_url}/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()
            completion = str(data.get("response") or "").strip()
            if not completion:
                raise HTTPException(status_code=502, detail="Ollama returned an empty completion")
            return {
                "provider": "ollama",
                "baseUrl": base_url,
                "completion": completion[:2000],
                "raw": {
                    "totalDuration": data.get("total_duration"),
                    "loadDuration": data.get("load_duration"),
                    "promptEvalCount": data.get("prompt_eval_count"),
                    "evalCount": data.get("eval_count"),
                    "doneReason": data.get("done_reason"),
                },
            }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Ollama inference provider is unavailable",
                "message": str(error)[:500],
                "baseUrl": base_url,
                "model": model,
            },
        )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/premium-api/x402-summary")
async def premium_api_summary(request: Request, sourceUrl: str = "https://docs.x402.org/") -> dict[str, object]:
    payment_identifier = require_gateway_payment(request, expected_resource_id="res_api_proxy")
    evidence = await fetch_source_evidence(sourceUrl, payment_identifier)
    return {
        "provider": "x402-docs-premium-api",
        "status": "fulfilled",
        "endpoint": "/premium-api/x402-summary",
        "accessModel": "pay-per-request",
        "source": evidence,
        "fields": {
            "sourceUrl": "string",
            "title": "string",
            "excerpt": "string",
            "keyTerms": "string[]",
        },
    }


@app.post("/agent/delegate")
async def delegate_agent(request: Request, delegation_request: DelegationRequest) -> dict[str, object]:
    require_gateway_payment(request, delegation_request.paymentIdentifier, "res_agent_delegation")
    prompt = delegation_request.prompt.strip()
    delegated_task = str(delegation_request.payload.get("task") or "research_brief").strip()
    source_text = " ".join(
        str(value)
        for value in [prompt, delegated_task, delegation_request.payload.get("query"), delegation_request.payload.get("sourceUrl")]
        if value
    )
    terms = top_terms(source_text, limit=8)
    task_type = classify_task(source_text)
    recommendations = procurement_recommendations(source_text, terms)
    confidence = confidence_from_terms(source_text, terms)
    deliverable = {
        "taskType": task_type,
        "summary": build_delegate_summary(task_type, terms, recommendations),
        "recommendations": recommendations,
        "evidenceTerms": terms,
        "confidence": confidence,
        "inputLength": len(prompt),
    }
    return {
        "agent": "creator-market-research-agent",
        "status": "completed",
        "delegatedTask": delegated_task,
        "paymentIdentifier": delegation_request.paymentIdentifier,
        "deliverable": deliverable,
    }


@app.post("/inference/complete")
async def complete_inference(request: Request, inference_request: InferenceRequest) -> dict[str, object]:
    require_gateway_payment(request, inference_request.paymentIdentifier, "res_inference_endpoint")
    prompt = inference_request.prompt.strip()
    context_text = flatten_context(inference_request.context)
    source_text = f"{prompt}\n{context_text}".strip()
    terms = top_terms(source_text, limit=10)
    sentences = rank_sentences(source_text, terms, limit=3)
    inference_prompt = build_inference_prompt(prompt, sentences, terms)
    generated = await generate_with_ollama(inference_request.model, inference_prompt)
    completion = str(generated.get("completion"))
    return {
        "model": inference_request.model,
        "provider": generated.get("provider"),
        "status": "completed",
        "paymentIdentifier": inference_request.paymentIdentifier,
        "completion": completion,
        "evidence": sentences,
        "keyTerms": terms,
        "usage": {
            "inputCharacters": len(prompt),
            "contextCharacters": len(context_text),
            "outputCharacters": len(completion),
        },
        "metadata": {
            "ollama": generated.get("raw"),
        },
    }


@app.post("/rss/paywall")
async def rss_paywall(request: Request, paywall_request: RssPaywallRequest) -> dict[str, object]:
    require_gateway_payment(request, paywall_request.paymentIdentifier, "res_rss_paywall")
    feed_url = str(paywall_request.feedUrl)
    article_url = str(paywall_request.articleUrl)
    assert_allowed(feed_url)
    assert_allowed(article_url)

    article = {
        "title": article_url,
        "url": article_url,
        "excerpt": "",
    }
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            response = await client.get(feed_url)
            response.raise_for_status()
        soup = BeautifulSoup(response.text, "xml")
        item = soup.find("item") or soup.find("entry")
        if item:
            title_node = item.find("title")
            link_node = item.find("link")
            description_node = item.find("description") or item.find("summary")
            article = {
                "title": title_node.get_text(" ", strip=True) if title_node else article["title"],
                "url": (
                    link_node.get("href")
                    if link_node and link_node.has_attr("href")
                    else link_node.get_text(" ", strip=True)
                    if link_node
                    else article_url
                ),
                "excerpt": description_node.get_text(" ", strip=True)[:600] if description_node else article["excerpt"],
            }
    except Exception as rss_error:
        article["rssError"] = str(rss_error)[:300]
        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                article_response = await client.get(article_url)
                article_response.raise_for_status()
            article_soup = BeautifulSoup(article_response.text, "html.parser")
            title_node = article_soup.find("title")
            article["title"] = title_node.get_text(" ", strip=True) if title_node else article_url
            article["excerpt"] = article_soup.get_text(" ", strip=True)[:600]
        except Exception as article_error:
            article["articleFetchError"] = str(article_error)[:300]

    return {
        "status": "unlocked",
        "paymentIdentifier": paywall_request.paymentIdentifier,
        "feedUrl": feed_url,
        "article": article,
        "receipt": {
            "kind": "publisher-rss-paywall",
            "sourceUrl": article["url"],
            "paymentIdentifier": paywall_request.paymentIdentifier,
        },
    }


@app.post("/mcp")
async def mcp(raw_request: Request, request: McpRequest) -> dict[str, object]:
    tools = [
        {
            "name": "paid_source_fetch",
            "description": "Fetch a paid source and return a citation receipt.",
            "inputSchema": {
                "type": "object",
                "properties": {"sourceUrl": {"type": "string"}},
            },
        },
        {
            "name": "paid_access_status",
            "description": "Return paid access status for an AgentPay protected resource.",
            "inputSchema": {
                "type": "object",
                "properties": {"resourceId": {"type": "string"}},
            },
        },
    ]

    if request.method == "tools/list":
        result: object = {"tools": tools}
    elif request.method == "tools/call":
        require_gateway_payment(raw_request, str(request.id), "res_mcp_tools")
        tool_name = request.params.get("name", "unknown")
        arguments = request.params.get("arguments") if isinstance(request.params.get("arguments"), dict) else {}
        if tool_name == "paid_source_fetch":
            source_url = str(arguments.get("sourceUrl") or "https://docs.x402.org/")
            evidence = await fetch_source_evidence(source_url, str(request.id))
            result = {
                "content": [
                    {
                        "type": "text",
                        "text": f"{evidence['title']}: {evidence['excerpt']}",
                    }
                ],
                "structuredContent": evidence,
                "isError": False,
            }
        elif tool_name == "paid_access_status":
            result = {
                "content": [
                    {
                        "type": "text",
                        "text": f"Paid MCP access fulfilled for payment {request.id}.",
                    }
                ],
                "structuredContent": {
                    "status": "fulfilled",
                    "paymentIdentifier": str(request.id),
                    "resourceId": arguments.get("resourceId"),
                },
                "isError": False,
            }
        else:
            result = {
                "content": [{"type": "text", "text": f"Unsupported paid MCP tool: {tool_name}"}],
                "isError": True,
            }
    else:
        raise HTTPException(status_code=404, detail=f"Unsupported MCP method: {request.method}")

    return {
        "jsonrpc": request.jsonrpc,
        "id": request.id,
        "result": result,
    }


@app.post("/payer/pay-resource")
async def pay_resource(request: Request, payer_request: PayerRequest) -> dict[str, object]:
    require_payer_auth(request)
    target_url = str(payer_request.targetUrl)
    assert_allowed(target_url)

    command = [
        "circle",
        "services",
        "pay",
        target_url,
        "--address",
        payer_request.buyerAddress,
        "--chain",
        payer_request.chain,
        "--max-amount",
        payer_request.maxAmount,
        "--output",
        "json",
    ]
    parsed = await run_circle_json(command)

    data = parsed.get("data") if isinstance(parsed, dict) else None
    response = data.get("response") if isinstance(data, dict) else None
    payment = response.get("payment") if isinstance(response, dict) else None
    result = response.get("result") if isinstance(response, dict) else None
    if not payment or not result:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Circle payment completed without AgentPay payment/result payload",
                "circleResponseKeys": list(parsed.keys()) if isinstance(parsed, dict) else [],
            },
        )

    return {
        "payment": payment,
        "result": result,
        "verification": data.get("payment") if isinstance(data, dict) else None,
    }


@app.post("/payer/wallet-status")
async def wallet_status(request: Request, status_request: WalletStatusRequest) -> dict[str, object]:
    require_payer_auth(request)
    address = status_request.buyerAddress
    chain = status_request.chain
    wallet = await run_circle_json(
        [
            "circle",
            "wallet",
            "balance",
            "--address",
            address,
            "--chain",
            chain,
            "--output",
            "json",
        ],
        timeout=30,
    )
    gateway = await run_circle_json(
        [
            "circle",
            "gateway",
            "balance",
            "--address",
            address,
            "--chain",
            chain,
            "--all",
            "--output",
            "json",
        ],
        timeout=30,
    )
    checked_at = datetime.now(UTC).isoformat()
    wallet_data = wallet.get("data") if isinstance(wallet, dict) else {}
    wallet_balances = wallet_data.get("balances", []) if isinstance(wallet_data, dict) else []
    usdc = next(
        (
            item
            for item in wallet_balances
            if isinstance(item, dict)
            and isinstance(item.get("token"), dict)
            and item["token"].get("symbol") == "USDC"
            and item["token"].get("isNative") is False
        ),
        wallet_balances[0] if wallet_balances else {},
    )
    token = usdc.get("token") if isinstance(usdc, dict) and isinstance(usdc.get("token"), dict) else {}
    gateway_data = gateway.get("data") if isinstance(gateway, dict) else {}
    gateway_balances = gateway_data.get("balances", []) if isinstance(gateway_data, dict) else []
    arc_gateway = next(
        (item for item in gateway_balances if isinstance(item, dict) and item.get("network") == "Arc Testnet"),
        {},
    )

    return {
        "walletBalance": {
            "ok": True,
            "checkedAt": checked_at,
            "amount": str(usdc.get("amount", "0")) if isinstance(usdc, dict) else "0",
            "token": token.get("symbol", "USDC") if isinstance(token, dict) else "USDC",
            "tokenAddress": token.get("tokenAddress") if isinstance(token, dict) else None,
        },
        "gatewayBalance": {
            "ok": True,
            "checkedAt": checked_at,
            "amount": str(arc_gateway.get("balance", gateway_data.get("total", "0")))
            if isinstance(arc_gateway, dict)
            else "0",
            "total": str(gateway_data.get("total", "0")) if isinstance(gateway_data, dict) else "0",
            "token": gateway_data.get("token", "USDC") if isinstance(gateway_data, dict) else "USDC",
            "backingEOA": gateway_data.get("backingEOA") if isinstance(gateway_data, dict) else None,
        },
    }
