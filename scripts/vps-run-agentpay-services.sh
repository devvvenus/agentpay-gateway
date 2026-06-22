#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-/opt/agentpay-gateway}"
cd "$ROOT_DIR"

if [[ ! -f "$ROOT_DIR/.env.vps" ]]; then
  python3 - <<'PY' > "$ROOT_DIR/.env.vps"
import secrets

print(f"AGENTPAY_PAYER_API_KEY={secrets.token_urlsafe(48)}")
PY
  chmod 600 "$ROOT_DIR/.env.vps"
fi

mkdir -p "$ROOT_DIR/circle-home"
chmod 700 "$ROOT_DIR/circle-home"

env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ROOT_DIR/.env.vps" | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

DOCKER_NETWORK="$(env_value AGENTPAY_DOCKER_NETWORK)"
DOCKER_NETWORK="${DOCKER_NETWORK:-agentpay-network}"
RUN_OLLAMA="$(env_value AGENTPAY_RUN_OLLAMA)"
INFERENCE_MODEL="$(env_value AGENTPAY_INFERENCE_MODEL)"
INFERENCE_MODEL="${INFERENCE_MODEL:-qwen3:4b}"
OLLAMA_BASE_URL="$(env_value OLLAMA_BASE_URL)"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
OLLAMA_TIMEOUT_SECONDS="$(env_value OLLAMA_TIMEOUT_SECONDS)"
OLLAMA_TIMEOUT_SECONDS="${OLLAMA_TIMEOUT_SECONDS:-180}"
PAYER_REQUEST_TIMEOUT_SECONDS="$(env_value AGENTPAY_PAYER_REQUEST_TIMEOUT_SECONDS)"
PAYER_REQUEST_TIMEOUT_SECONDS="${PAYER_REQUEST_TIMEOUT_SECONDS:-120}"

if ! docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1; then
  docker network create "$DOCKER_NETWORK" >/dev/null
fi

if [[ "$RUN_OLLAMA" == "1" ]]; then
  OLLAMA_BASE_URL="${OLLAMA_BASE_URL/http:\/\/127.0.0.1:11434/http:\/\/agentpay-ollama:11434}"
  mkdir -p "$ROOT_DIR/ollama"

  if docker container inspect agentpay-ollama >/dev/null 2>&1; then
    docker rm -f agentpay-ollama >/dev/null
  fi

  docker run -d \
    --name agentpay-ollama \
    --restart unless-stopped \
    --network "$DOCKER_NETWORK" \
    -p 127.0.0.1:11434:11434 \
    -v "$ROOT_DIR/ollama:/root/.ollama" \
    ollama/ollama:latest >/dev/null

  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null; then
      break
    fi
    sleep 2
  done

  curl -fsS http://127.0.0.1:11434/api/tags >/dev/null
  docker exec agentpay-ollama ollama pull "$INFERENCE_MODEL" >/dev/null
fi

if docker container inspect agentpay-worker >/dev/null 2>&1; then
  docker rm -f agentpay-worker >/dev/null
fi

docker run -d \
  --name agentpay-worker \
  --restart unless-stopped \
  --network "$DOCKER_NETWORK" \
  -p 8010:8000 \
  --env-file "$ROOT_DIR/.env.vps" \
  -e CIRCLE_ACCEPT_TERMS=1 \
  -e AGENTPAY_INFERENCE_MODEL="$INFERENCE_MODEL" \
  -e OLLAMA_BASE_URL="$OLLAMA_BASE_URL" \
  -e OLLAMA_TIMEOUT_SECONDS="$OLLAMA_TIMEOUT_SECONDS" \
  -e AGENTPAY_PAYER_REQUEST_TIMEOUT_SECONDS="$PAYER_REQUEST_TIMEOUT_SECONDS" \
  -e AGENTPAY_ALLOWED_HOSTS=localhost,127.0.0.1,docs.arc.io,developers.circle.com,docs.x402.org,lepton.thecanteenapp.com,www.arc.network,arc.network,agentpay-gateway.vercel.app,agentpay-gateway-beige.vercel.app \
  -v "$ROOT_DIR/circle-home:/root" \
  agentpay-worker:latest >/dev/null

sleep 8
docker ps | grep 'agentpay-worker' || true
curl -fsS http://127.0.0.1:8010/health >/dev/null

echo "AgentPay VPS services are running:"
echo "worker=http://49.13.60.236:8010"
