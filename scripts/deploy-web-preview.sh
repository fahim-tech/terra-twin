#!/usr/bin/env bash
# Deploy the committed apps/web (HEAD) to a Vercel *preview* URL of project "terratwin" (docs/deployment.md).
# Production (https://terratwin-five.vercel.app) is not touched: the preview gets its own
# https://terratwin-<hash>-….vercel.app address, printed at the end. Same export-outside-git approach as
# deploy-web.sh. Needs `vercel login` on this machine.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -C "$ROOT" archive HEAD apps/web | tar -x -C "$TMP"
mv "$TMP/apps/web" "$TMP/terratwin"
cd "$TMP/terratwin"
vercel link --yes --project terratwin
vercel deploy --yes
