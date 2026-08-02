#!/usr/bin/env bash
# Structural check for the M10 before/after table (one harness change).
# Usage: bash .../before-after-check.sh <before-after.md>
# Fails while template placeholders (<...>) or unfilled cells (?) remain.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
F="${1:?usage: before-after-check.sh <before-after.md>}"
[ -f "$F" ] || F="$ROOT/$1"
[ -f "$F" ] || { echo "before-after-check: no such file: $1"; exit 1; }

pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  ok   $1"; }
bad() { fail=$((fail+1)); echo "  FAIL $1"; }

n="$(grep -cE '^Change:' "$F")"
[ "$n" -eq 1 ] && ok "exactly one Change line" || bad "need exactly ONE 'Change:' line (found $n) — one change at a time or attribution is guesswork"
grep -E '^Change:' "$F" | grep -qv '<' && ok "Change line is filled" || bad "Change line still holds a <placeholder>"
grep -qE '^Hypothesis: [^<]' "$F" && ok "hypothesis stated" || bad "missing filled 'Hypothesis:' line (state it BEFORE rerunning)"
grep -qE '^Target case: [^<]' "$F" && ok "target case named" || bad "missing filled 'Target case:' line"
grep -qE '^Holdout: [^<]' "$F" && ok "holdout named" || bad "missing filled 'Holdout:' line — no holdout means tuning to the target"

grep -E '^\|' "$F" | head -1 | grep -q 'Baseline' && grep -E '^\|' "$F" | head -1 | grep -q 'After' \
  && ok "table has Baseline and After columns" || bad "table header must have Baseline and After columns"
rows="$(grep -cE '^\|' "$F")"
[ "$rows" -ge 4 ] && ok "table has >= 2 data rows (target + holdout)" || bad "table needs >= 2 data rows (target + at least one holdout)"
if grep -E '^\|' "$F" | grep -qE '\|[[:space:]]*\?[[:space:]]*\|'; then
  bad "table still has '?' cells — run the reruns and record results"
else
  ok "no unfilled '?' cells"
fi

awk '/^```/{f=!f;next} f' "$F" | grep -qE '[^[:space:]]' \
  && ok "rerun commands recorded" || bad "rerun command block is empty — results must be reproducible"
grep -qE '^Decision: (promote|reject|revise)' "$F" \
  && ok "decision recorded (promote/reject/revise)" || bad "missing 'Decision: promote|reject|revise'"
if grep -qE '^Decided by: (PENDING|TBD)' "$F"; then
  bad "Decided by is PENDING — correct for a draft, but this table is not done until a person signs it"
elif grep -qE '^Decided by: [^<[:space:]]' "$F"; then
  ok "a person owns the decision"
else
  bad "missing 'Decided by: <name>' — the system proposes, a human promotes"
fi
grep -qE '^Kept evidence: [^<]' "$F" \
  && ok "kept evidence paths recorded" || bad "missing 'Kept evidence:' — preserve BOTH baseline and after traces"

echo
if [ "$fail" -eq 0 ]; then
  echo "before-after-check: PASS ($pass checks). Structure only — whether the"
  echo "holdout is truly unaffected is a judgement this script cannot make."
  exit 0
else
  echo "before-after-check: FAILED ($fail of $((pass+fail)) checks)."
  exit 1
fi
