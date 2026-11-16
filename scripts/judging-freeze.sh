#!/usr/bin/env bash
# Sourced by the production deploy scripts. Refuses a production deploy while the NASA Space Apps 2026
# submission is being judged, so the links on the submitted Project page keep showing the judged version
# (tag spaceapps-2026-submitted, commit f66e90e). Global Winners are announced on 26 January 2027.
#
# Override, only to keep the submitted version running (an outage fix that changes no behaviour):
#   TERRATWIN_ALLOW_PROD_DEPLOY=1 scripts/deploy-web.sh
# Preview deployments are never blocked: scripts/deploy-web-preview.sh.
JUDGING_FREEZE_UNTIL="2027-01-27"
if [[ "${TERRATWIN_ALLOW_PROD_DEPLOY:-0}" != "1" ]] && [[ "$(date -u +%F)" < "$JUDGING_FREEZE_UNTIL" ]]; then
  cat >&2 <<EOF
Production deploy refused: NASA Space Apps 2026 judging freeze until $JUDGING_FREEZE_UNTIL.
The submitted links must keep serving tag spaceapps-2026-submitted.
  - For new work use a preview deployment:  scripts/deploy-web-preview.sh
  - To fix an outage without changing behaviour:  TERRATWIN_ALLOW_PROD_DEPLOY=1 $0
EOF
  exit 2
fi
