#!/usr/bin/env bash
# Structural check for an M9 hand-off pack: handoff.md + AS-BUILT.md + incident.md.
# Usage (from anywhere): bash sessions/s5-operate-improve/fixtures/checks/handoff-check.sh [--manifest-only] <dir>
# Exit 0 iff every required field/section is present and filled.
#   --manifest-only  validate handoff.md alone (for a generated draft, before
#                    the human-authored AS-BUILT.md and incident.md exist)
# HONEST LABEL: this verifies STRUCTURE only. Whether the map matches the
# system is decided by the fresh-reader test — a human tracing one path.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
MANIFEST_ONLY=0
if [ "${1:-}" = "--manifest-only" ]; then MANIFEST_ONLY=1; shift; fi
DIR="${1:?usage: handoff-check.sh [--manifest-only] <handoff-dir>}"
[ -d "$DIR" ] || DIR="$ROOT/$DIR"
[ -d "$DIR" ] || { echo "handoff-check: no such directory: $1"; exit 1; }

pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  ok   $1"; }
bad() { fail=$((fail+1)); echo "  FAIL $1"; }

# strip <!-- --> comments so template boilerplate never counts as content
body() { perl -0pe 's/<!--.*?-->//gs' "$1"; }
section() { body "$1" | awk -v h="## $2" '$0==h{f=1;next} /^## /{f=0} f' | grep -vE '^[[:space:]]*$|^-[[:space:]]*$'; }

files="handoff.md AS-BUILT.md incident.md"
[ "$MANIFEST_ONLY" -eq 1 ] && files="handoff.md"
for f in $files; do
  [ -f "$DIR/$f" ] && ok "$f exists" || bad "$f missing"
done
[ "$fail" -eq 0 ] || { echo "handoff-check: FAILED ($fail missing files)"; exit 1; }

H="$DIR/handoff.md"
for key in run_id contract_path contract_sha256 provider harness_version candidate_start status receipt trace evidence budget_remaining proof_still_required human_decision decided_by; do
  grep -qE "^[[:space:]]*$key:" "$H" && ok "handoff.md has $key" || bad "handoff.md missing key $key"
done
for key in run_id contract_sha256 status trace proof_still_required human_decision; do
  v="$(grep -E "^[[:space:]]*$key:" "$H" | head -1 | sed -E "s/^[[:space:]]*$key:[[:space:]]*//; s/#.*//; s/[[:space:]]*$//")"
  [ -n "$v" ] && ok "handoff.md $key is filled" || bad "handoff.md $key is empty"
done
TRACE="$(grep -E '^[[:space:]]*trace:' "$H" | head -1 | sed -E 's/^[[:space:]]*trace:[[:space:]]*//; s/#.*//; s/[[:space:]]*$//')"
if [ -n "$TRACE" ] && { [ -e "$ROOT/$TRACE" ] || [ -e "$TRACE" ]; }; then
  ok "trace path exists ($TRACE)"
else
  bad "trace path does not exist: '$TRACE' (the hand-off must index a real trace)"
fi
grep -qE '^## Dead ends' "$H" && ok "handoff.md has a Dead ends section" || bad "handoff.md missing '## Dead ends' section"

if [ "$MANIFEST_ONLY" -eq 1 ]; then
  echo
  if [ "$fail" -eq 0 ]; then
    echo "handoff-check: PASS ($pass checks, manifest only). AS-BUILT.md and"
    echo "incident.md are human work — rerun without --manifest-only when written."
    exit 0
  else
    echo "handoff-check: FAILED ($fail of $((pass+fail)) checks, manifest only)."
    exit 1
  fi
fi

A="$DIR/AS-BUILT.md"
grep -qE '^Stamp: [0-9]{4}-[0-9]{2}-[0-9]{2} .*(commit|tree)' "$A" \
  && ok "AS-BUILT.md is stamped (date + commit/tree)" \
  || bad "AS-BUILT.md missing 'Stamp: YYYY-MM-DD commit <sha>' — an unstamped map is a rumor"
for h in "Entry point" "Critical path" "State ownership" "Interfaces" "Gate and release boundary" "Recheck commands"; do
  grep -qE "^## $h" "$A" && ok "AS-BUILT.md has '$h'" || bad "AS-BUILT.md missing '## $h'"
done
if body "$A" | awk '/^```/{f=!f;next} f' | grep -qE '[^[:space:]]'; then
  ok "AS-BUILT.md has at least one non-empty recheck command block"
else
  bad "AS-BUILT.md recheck commands are empty — claims need rerunnable checks"
fi

I="$DIR/incident.md"
for h in "Observed failure" "Impact" "Timeline / event slice" "Boundary that was not visible" "Hypotheses tested" "Rejected hypothesis" "Cause or current uncertainty" "Corrective action" "Regression case"; do
  grep -qE "^## $h" "$I" && ok "incident.md has '$h'" || bad "incident.md missing '## $h'"
done
if [ -n "$(section "$I" 'Rejected hypothesis')" ]; then
  ok "incident.md rejected hypothesis has content"
else
  bad "incident.md 'Rejected hypothesis' is empty — keep the dead end; it is the most valuable line"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "handoff-check: PASS ($pass checks). Structure only — semantic accuracy"
  echo "requires the fresh-reader test (a human traces one path and reruns one check)."
  exit 0
else
  echo "handoff-check: FAILED ($fail of $((pass+fail)) checks)."
  exit 1
fi
