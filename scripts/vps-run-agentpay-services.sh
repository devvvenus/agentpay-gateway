#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-/opt/agentpay-gateway}"
cd "$ROOT_DIR"

mkdir -p "$ROOT_DIR/fixtures/datasette"
python3 - <<'PY'
import sqlite3
from pathlib import Path

db_path = Path("/opt/agentpay-gateway/fixtures/datasette/demo.sqlite")
db_path.parent.mkdir(parents=True, exist_ok=True)
con = sqlite3.connect(db_path)
con.execute("drop table if exists demo_metrics")
con.execute(
    "create table demo_metrics (id integer primary key, metric text not null, value real not null)"
)
con.executemany(
    "insert into demo_metrics(metric, value) values (?, ?)",
    [
        ("adapter_count", 10),
        ("target_budget_usdc", 0.05),
        ("judging_circle_tools_percent", 20),
        ("judging_traction_percent", 30),
    ],
)
con.commit()
con.close()
PY

for name in agentpay-worker agentpay-datasette agentpay-searxng; do
  if docker container inspect "$name" >/dev/null 2>&1; then
    docker rm -f "$name" >/dev/null
  fi
done

docker run -d \
  --name agentpay-worker \
  --restart unless-stopped \
  -p 8010:8000 \
  -e AGENTPAY_ALLOWED_HOSTS=localhost,127.0.0.1,docs.arc.io,developers.circle.com,docs.x402.org,lepton.thecanteenapp.com,www.arc.network,arc.network \
  agentpay-worker:latest >/dev/null

docker run -d \
  --name agentpay-datasette \
  --restart unless-stopped \
  -p 8011:8001 \
  -v "$ROOT_DIR/fixtures/datasette:/data" \
  datasetteproject/datasette:latest \
  datasette -h 0.0.0.0 -p 8001 /data/demo.sqlite --cors >/dev/null

docker run -d \
  --name agentpay-searxng \
  --restart unless-stopped \
  -p 8012:8080 \
  -v "$ROOT_DIR/integrations/searxng/settings.yml:/etc/searxng/settings.yml:ro" \
  searxng/searxng:latest >/dev/null

sleep 8
docker ps | grep 'agentpay-' || true
curl -fsS http://127.0.0.1:8010/health >/dev/null
curl -fsS 'http://127.0.0.1:8011/demo.json?sql=select%20*%20from%20demo_metrics&_shape=array' >/dev/null
curl -fsS 'http://127.0.0.1:8012/search?q=Arc%20x402&format=json' >/dev/null

echo "AgentPay VPS services are running:"
echo "worker=http://49.13.60.236:8010"
echo "datasette=http://49.13.60.236:8011"
echo "searxng=http://49.13.60.236:8012"
