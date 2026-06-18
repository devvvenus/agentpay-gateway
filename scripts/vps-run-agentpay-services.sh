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

if docker container inspect agentpay-worker >/dev/null 2>&1; then
  docker rm -f agentpay-worker >/dev/null
fi

docker run -d \
  --name agentpay-worker \
  --restart unless-stopped \
  -p 8010:8000 \
  --env-file "$ROOT_DIR/.env.vps" \
  -e CIRCLE_ACCEPT_TERMS=1 \
  -e AGENTPAY_ALLOWED_HOSTS=localhost,127.0.0.1,docs.arc.io,developers.circle.com,docs.x402.org,lepton.thecanteenapp.com,www.arc.network,arc.network,agentpay-gateway.vercel.app \
  -v "$ROOT_DIR/circle-home:/root" \
  agentpay-worker:latest >/dev/null

sleep 8
docker ps | grep 'agentpay-worker' || true
curl -fsS http://127.0.0.1:8010/health >/dev/null

echo "AgentPay VPS services are running:"
echo "worker=http://49.13.60.236:8010"
