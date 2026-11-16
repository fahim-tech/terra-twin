#!/usr/bin/env bash
# Deploy the committed apps/web (HEAD) as the production of a *separate* Vercel project, "terratwin-dev"
# (docs/deployment.md, "Judging freeze"). The judged project "terratwin" (https://terratwin-five.vercel.app)
# is never touched by this script: the dev project has its own stable URL, printed at the end, and its own
# deployment history. Same export-outside-git approach as deploy-web.sh. Needs `vercel login`.
#
# The dev build talks to the same production API through apps/web/vercel.json; API changes cannot be
# shown here without changing the judged app (see docs/deployment.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${TERRATWIN_DEV_PROJECT:-terratwin-dev}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -C "$ROOT" archive HEAD apps/web | tar -x -C "$TMP"
mv "$TMP/apps/web" "$TMP/$PROJECT"
cd "$TMP/$PROJECT"
# Create the project on first use (the command fails harmlessly when it already exists).
vercel project add "$PROJECT" >/dev/null 2>&1 || true
vercel link --yes --project "$PROJECT"
vercel deploy --prod --yes
