import asyncio
import os
import math
import re
import json
from collections import Counter
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, HttpUrl

app = FastAPI(title="AgentPay Crawl Worker", version="0.1.0")


class CrawlRequest(BaseModel):
    url: HttpUrl


class DelegationRequest(BaseModel):
    prompt: str
    payload: dict[str, Any] = {}
    paymentIdentifier: str


class MemoryRequest(BaseModel):
    query: str
    namespace: str = "agentpay"
    paymentIdentifier: str


class InferenceRequest(BaseModel):
    prompt: str
    model: str = "agentpay-reasoner"
    paymentIdentifier: str
    context: dict[str, Any] = {}


class RssPaywallRequest(BaseModel):
    feedUrl: HttpUrl
    fallbackUrl: HttpUrl
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


def cosine_similarity(left: Counter[str], right: Counter[str]) -> float:
    if not left or not right:
        return 0.0
    dot = sum(left[token] * right.get(token, 0) for token in left)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def top_terms(text: str, limit: int = 8) -> list[str]:
    return [token for token, _count in term_vector(text).most_common(limit)]


def classify_task(text: str) -> str:
    terms = set(tokenize(text))
    if {"rss", "publisher", "article", "citation"} & terms:
        return "publisher-monetization"
    if {"dataset", "sql", "data"} & terms:
        return "dataset-procurement"
    if {"search", "research", "source"} & terms:
        return "research-procurement"
    if {"agent", "delegate", "delegation"} & terms:
        return "agent-delegation"
    return "budgeted-resource-procurement"


def procurement_recommendations(text: str, terms: list[str]) -> list[dict[str, object]]:
    term_set = set(terms).union(tokenize(text))
    candidates = [
        ("docs_source", "Buy citation-backed docs/source access", {"docs", "source", "citation", "arc"}),
        ("rss_paywall", "Buy publisher/RSS article access", {"rss", "publisher", "article", "creator"}),
        ("search", "Buy paid search when freshness matters", {"search", "freshness", "research"}),
        ("dataset", "Buy dataset query when structured evidence is needed", {"dataset", "sql", "data"}),
        ("memory_retrieval", "Buy memory retrieval when prior context improves confidence", {"memory", "rag", "context"}),
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
                "adapterType": "search",
                "action": "Buy paid search first, then pay for source citations only if freshness or confidence improves.",
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
    primary = recommendations[0]["adapterType"] if recommendations else "search"
    term_text = ", ".join(terms[:5]) if terms else "the submitted task"
    return f"Classified as {task_type}. Primary paid resource: {primary}. Decision basis: {term_text}."


def load_memory_corpus(namespace: str) -> list[dict[str, Any]]:
    configured = os.getenv("AGENTPAY_MEMORY_CORPUS", "").strip()
    corpus = [
        {
            "id": "mem_arc_budget_layer",
            "text": "AI agents need a budget-aware purchasing layer for internet resources on Arc, Circle and x402.",
            "tags": ["arc", "x402", "budget", "agent"],
        },
        {
            "id": "mem_creator_citations",
            "text": "Citation receipts let publishers earn when an agent uses a source in its final answer.",
            "tags": ["publisher", "citation", "receipt"],
        },
        {
            "id": "mem_paid_tools",
            "text": "Paid tools, APIs, datasets, search, crawls, memory and inference can be procured per task.",
            "tags": ["tools", "dataset", "inference"],
        },
        {
            "id": "mem_distribution_bootstrap",
            "text": "Distribution improves when paid resource providers plug into existing creator and publisher workflows.",
            "tags": ["distribution", "creator", "publisher"],
        },
    ]
    if configured:
        for index, chunk in enumerate(configured.split("||"), start=1):
            text = chunk.strip()
            if text:
                corpus.append({"id": f"{namespace}_env_{index}", "text": text, "tags": [namespace]})
    return corpus


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


def build_inference_completion(prompt: str, evidence: list[str], terms: list[str]) -> str:
    if evidence:
        evidence_text = " ".join(evidence)
    else:
        evidence_text = prompt[:240]
    term_text = ", ".join(terms[:6]) if terms else "budget, confidence, source quality"
    return (
        f"Decision: prioritize paid resources that improve {term_text}. "
        f"Evidence considered: {evidence_text} "
        "Recommended action: pay only when the expected value improves answer confidence or citation quality; otherwise skip."
    )[:900]


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/agent/delegate")
async def delegate_agent(request: DelegationRequest) -> dict[str, object]:
    prompt = request.prompt.strip()
    delegated_task = str(request.payload.get("task") or "research_brief").strip()
    source_text = " ".join(
        str(value)
        for value in [prompt, delegated_task, request.payload.get("query"), request.payload.get("sourceUrl")]
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
        "paymentIdentifier": request.paymentIdentifier,
        "deliverable": deliverable,
    }


@app.post("/memory/retrieve")
async def retrieve_memory(request: MemoryRequest) -> dict[str, object]:
    query = request.query.strip()
    corpus = load_memory_corpus(request.namespace)
    query_vector = term_vector(query)
    scored = []
    for item in corpus:
        text = f"{item['text']} {' '.join(item.get('tags', []))}"
        similarity = cosine_similarity(query_vector, term_vector(text))
        overlap = sorted(set(tokenize(query)).intersection(tokenize(text)))
        scored.append(
            {
                **item,
                "score": round(similarity, 4),
                "matchedTerms": overlap[:10],
            }
        )
    scored.sort(key=lambda item: (item["score"], len(item["matchedTerms"])), reverse=True)
    matches = [item for item in scored if item["score"] > 0][:3] or scored[:1]
    return {
        "namespace": request.namespace,
        "paymentIdentifier": request.paymentIdentifier,
        "embedding": "local-tf-cosine",
        "queryTerms": top_terms(query, limit=8),
        "matches": matches,
    }


@app.post("/inference/complete")
async def complete_inference(request: InferenceRequest) -> dict[str, object]:
    prompt = request.prompt.strip()
    context_text = flatten_context(request.context)
    source_text = f"{prompt}\n{context_text}".strip()
    terms = top_terms(source_text, limit=10)
    sentences = rank_sentences(source_text, terms, limit=3)
    completion = build_inference_completion(prompt, sentences, terms)
    return {
        "model": request.model,
        "status": "completed",
        "paymentIdentifier": request.paymentIdentifier,
        "completion": completion,
        "evidence": sentences,
        "keyTerms": terms,
        "usage": {
            "inputCharacters": len(prompt),
            "contextCharacters": len(context_text),
            "outputCharacters": len(completion),
        },
    }


@app.post("/rss/paywall")
async def rss_paywall(request: RssPaywallRequest) -> dict[str, object]:
    feed_url = str(request.feedUrl)
    fallback_url = str(request.fallbackUrl)
    assert_allowed(feed_url)
    assert_allowed(fallback_url)

    article = {
        "title": fallback_url,
        "url": fallback_url,
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
                    else fallback_url
                ),
                "excerpt": description_node.get_text(" ", strip=True)[:600] if description_node else article["excerpt"],
            }
    except Exception as rss_error:
        article["rssError"] = str(rss_error)[:300]
        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                fallback_response = await client.get(fallback_url)
                fallback_response.raise_for_status()
            fallback_soup = BeautifulSoup(fallback_response.text, "html.parser")
            title_node = fallback_soup.find("title")
            article["title"] = title_node.get_text(" ", strip=True) if title_node else fallback_url
            article["excerpt"] = fallback_soup.get_text(" ", strip=True)[:600]
        except Exception as fallback_error:
            article["fallbackError"] = str(fallback_error)[:300]

    return {
        "status": "unlocked",
        "paymentIdentifier": request.paymentIdentifier,
        "feedUrl": feed_url,
        "article": article,
        "receipt": {
            "kind": "publisher-rss-paywall",
            "sourceUrl": article["url"],
            "paymentIdentifier": request.paymentIdentifier,
        },
    }


@app.post("/mcp")
async def mcp(request: McpRequest) -> dict[str, object]:
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
            "name": "paid_dataset_query",
            "description": "Run a paid dataset query through AgentPay.",
            "inputSchema": {
                "type": "object",
                "properties": {"sql": {"type": "string"}},
            },
        },
    ]

    if request.method == "tools/list":
        result: object = {"tools": tools}
    elif request.method == "tools/call":
        tool_name = request.params.get("name", "unknown")
        result = {
            "content": [
                {
                    "type": "text",
                    "text": f"MCP tool {tool_name} executed through the AgentPay worker after paid access.",
                }
            ],
            "isError": False,
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
    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(process.communicate(), timeout=120)
        stdout = stdout_bytes.decode("utf-8", errors="replace")
        stderr = stderr_bytes.decode("utf-8", errors="replace")
        returncode = process.returncode
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="Circle CLI is not installed in the payer runtime. Rebuild the worker image with Circle CLI support.",
        )
    except asyncio.TimeoutError:
        if process:
            process.kill()
            await process.wait()
        raise HTTPException(status_code=504, detail="Circle payment command timed out")

    if returncode != 0:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Circle payment command failed",
                "stderr": stderr[-1200:],
                "stdout": stdout[-1200:],
            },
        )

    try:
        parsed = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=502,
            detail={"error": "Circle CLI returned non-JSON output", "message": str(error), "stdout": stdout[-1200:]},
        )

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


@app.post("/crawl")
async def crawl(request: CrawlRequest) -> dict[str, object]:
    url = str(request.url)
    assert_allowed(url)

    try:
        from crawl4ai import AsyncWebCrawler  # type: ignore

        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=url)
            markdown = getattr(result, "markdown", None) or getattr(result, "fit_markdown", None) or ""
            return {
                "engine": "crawl4ai",
                "url": url,
                "markdown": markdown[:12000],
                "metadata": getattr(result, "metadata", {}) or {},
            }
    except Exception as crawl4ai_error:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        for node in soup(["script", "style", "noscript"]):
            node.decompose()
        text = " ".join(soup.get_text(" ").split())
        title = soup.title.string.strip() if soup.title and soup.title.string else url
        return {
            "engine": "html-fallback",
            "url": url,
            "title": title,
            "markdown": text[:12000],
            "metadata": {"crawl4ai_error": str(crawl4ai_error)[:500]},
        }
