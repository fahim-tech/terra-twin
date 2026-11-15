#!/usr/bin/env bash
# Deploy the committed apps/web (HEAD) to Vercel production, project "terratwin" (docs/deployment.md).
# The export happens outside git, so Vercel builds exactly what is committed and no Git integration is
# created. Needs `vercel login` on this machine.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -C "$ROOT" archive HEAD apps/web | tar -x -C "$TMP"
mv "$TMP/apps/web" "$TMP/terratwin"
cd "$TMP/terratwin"
vercel link --yes --project terratwin
vercel deploy --prod --yes
