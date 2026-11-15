#!/usr/bin/env bash
# Deploy apps/api to the us-east-1 host and restart it (docs/deployment.md).
# Syncs the working tree, including the gitignored research tables in apps/api/data/research.
# Host: SSH alias from TERRATWIN_HOST (default trade-1, ubuntu@100.27.159.94) with passwordless sudo.
set -euo pipefail
HOST="${TERRATWIN_HOST:-trade-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

rsync -az --delete --exclude .venv --exclude __pycache__ --exclude .pytest_cache --exclude .ruff_cache \
  "$ROOT/apps/api/" "$HOST:/srv/terratwin-app/api/"
rsync -az "$ROOT/deploy/" "$HOST:/srv/terratwin-app/deploy/"

ssh "$HOST" 'set -euo pipefail
  cd /srv/terratwin-app
  if ! cmp -s deploy/terratwin-api.service /etc/systemd/system/terratwin-api.service; then
    sudo install -m 0644 deploy/terratwin-api.service /etc/systemd/system/terratwin-api.service
    sudo systemctl daemon-reload
  fi
  if ! cmp -s deploy/nginx/terratwin-api.conf /etc/nginx/sites-available/terratwin-api; then
    sudo install -m 0644 deploy/nginx/terratwin-api.conf /etc/nginx/sites-available/terratwin-api
    sudo ln -sfn /etc/nginx/sites-available/terratwin-api /etc/nginx/sites-enabled/terratwin-api
    sudo nginx -t && sudo systemctl reload nginx
  fi
  sudo systemctl restart terratwin-api
  for _ in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:8710/api/health && exit 0; sleep 1; done
  echo "terratwin-api did not become healthy" >&2; exit 1'

curl -sf -o /dev/null http://100.27.159.94/api/health && echo "API healthy behind nginx"
