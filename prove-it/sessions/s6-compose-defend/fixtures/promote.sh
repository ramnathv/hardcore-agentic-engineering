#!/usr/bin/env bash
# Human-owned promotion — deliberately OUTSIDE the workflow runner (M12).
# Requires: a fresh passing join, a named owner, and a rollback path recorded
# BEFORE the irreversible step. "Human approved" without a name and a rollback
# is an incomplete promotion record.
set -euo pipefail
CODE="$(cd "$(dirname "$0")/../../.." && pwd)"
ROOT="${PROVE_IT_ROOT:-$CODE}"

# The runner exports PROVE_IT_WORKFLOW=1 to everything it spawns. If that flag
# is set here, a workflow is trying to promote its own output.
if [ "${PROVE_IT_WORKFLOW:-0}" = "1" ]; then
  echo "promote: REFUSED — promotion is a human decision outside the workflow." >&2
  echo "         A runner (or any process it spawned) may not promote its own output." >&2
  exit 1
fi

WF="${1:?usage: promote.sh <wf-id> --owner NAME --rollback \"PATH\"}"
shift
OWNER=""; ROLLBACK=""
while [ $# -gt 0 ]; do case "$1" in
  --owner) OWNER="$2"; shift 2 ;;
  --rollback) ROLLBACK="$2"; shift 2 ;;
  *) echo "promote: unknown argument '$1'" >&2; exit 2 ;;
esac; done
[ -n "$OWNER" ] || { echo "promote: REFUSED — no named owner. 'Human approved' needs a human name." >&2; exit 1; }
[ -n "$ROLLBACK" ] || { echo "promote: REFUSED — no rollback path. Name it before the irreversible step, not after." >&2; exit 1; }

echo "promote: re-running the join — promotion consumes fresh evidence, not a cached verdict."
PROVE_IT_ROOT="$ROOT" node \
  "$CODE/sessions/s6-compose-defend/fixtures/runner.ts" join --wf-id "$WF"

R="$ROOT" WF="$WF" OWNER="$OWNER" ROLLBACK="$ROLLBACK" node -e '
  const fs = require("fs");
  const p = process.env;
  const path = p.R + "/runs/" + p.WF + "/promotion.json";
  fs.writeFileSync(path, JSON.stringify({
    wf_id: p.WF, decision: "promote", owner: p.OWNER, rollback: p.ROLLBACK,
    decided_at: new Date().toISOString(), join_result: "runs/" + p.WF + "/join-result.json",
  }, null, 2) + "\n");
  console.log("promote: recorded at runs/" + p.WF + "/promotion.json");
  console.log("  owner=" + p.OWNER);
  console.log("  rollback=" + p.ROLLBACK);
'
