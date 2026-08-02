#!/usr/bin/env bash
# The S6 attack drill: five ways a composed run can fake completeness — each
# must end REFUSED (rows 1, 1b, 2, 3, at the join) or BOUNDED (row 4, at the
# gate-to-retry boundary). Each row runs in its own throwaway copy.
set -euo pipefail
cd "$(dirname "$0")/../../.."
BASE="$(pwd)"
NODE="node"
RUNNER="sessions/s6-compose-defend/fixtures/runner.ts"
export NODE_NO_WARNINGS=1
FAILED=0
TDIRS=()
trap 'rm -rf "${TDIRS[@]}"' EXIT

fresh() {
  T="$(mktemp -d "${TMPDIR:-/tmp}/prove-it-join.XXXXXX")"
  TDIRS+=("$T")
  cp -R control working done fixtures sessions "$T/"
  mkdir -p "$T/runs"
  export PROVE_IT_ROOT="$T"
}
row() { printf '\n%s\n' "── row $1: $2"; }
verdict() { printf '   → %s\n' "$1"; }
expect_refused() { # $1=grep pattern  $2=verdict on success
  if OUT="$($NODE "$RUNNER" join --wf-id demo 2>&1)"; then
    verdict "JOIN PASSED (BUG)"; FAILED=1
  else
    echo "$OUT" | grep -i "REFUSED" | sed 's/^/   /'
    if echo "$OUT" | grep -qi "$1"; then verdict "$2"; else verdict "refused for the WRONG reason (BUG)"; FAILED=1; fi
  fi
}

# 1. Old receipt — a receipt from a different run is passed at the join
row 1 "a node passes an OLD receipt (another run's) in place of its own"
fresh
$NODE "$RUNNER" run --wf-id demo >/dev/null 2>&1
cp "$T/control/receipts/demo-inspect.json" "$T/control/receipts/demo-verify.json"
expect_refused "old receipt" "REFUSED — old receipt named, node named"

# 1b. Stale receipt — the tree changed after the receipts were issued
row 1b "the working tree changes after the receipts were issued (stale candidate)"
fresh
$NODE "$RUNNER" run --wf-id demo >/dev/null 2>&1
echo "// post-receipt drift" >> "$T/working/src/slugify.mjs"
expect_refused "stale" "REFUSED — the gate's candidate-tree binding reaches the join"

# 2. Summary instead of evidence
row 2 "the review node returns a confident summary instead of requesting the gate"
fresh
$NODE "$RUNNER" run --wf-id demo --attack summary >/dev/null 2>&1
expect_refused "summary is not evidence" "REFUSED — summary named as non-evidence"

# 3. Shared-budget violation via a nested retry layer
row 3 "a child retry layer grants itself fresh attempts; parent+children overspend the shared budget"
fresh
$NODE "$RUNNER" run --wf-id demo --attack overspend >/dev/null 2>&1
expect_refused "budget invariant" "REFUSED — invariant recomputed from event logs, not the ledger"

# 4. Hostile check output at the gate-to-retry boundary
row 4 "check output is attacker-controlled; only the bounded gate result may reach a retry"
fresh
$NODE src/loop.ts open --run-id hostile \
  --contract sessions/s6-compose-defend/fixtures/contracts/hostile-check.yaml >/dev/null
if $NODE control/dr-gate.ts check hostile >/dev/null 2>&1; then
  verdict "gate ACCEPTED a failing hostile check (BUG)"; FAILED=1
else
  $NODE "$RUNNER" retry-brief hostile | sed 's/^/   /'
  if grep -q "SYSTEM OVERRIDE" "$T/runs/hostile/retry-brief.json"; then
    verdict "hostile text LEAKED into the retry brief (BUG)"; FAILED=1
  elif ! grep -q "SYSTEM OVERRIDE" "$T/runs/hostile/check-output.txt"; then
    verdict "artifact did not retain the output (BUG)"; FAILED=1
  else
    verdict "BOUNDED — hostile bytes quarantined in the artifact, none in the brief"
  fi
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "join attacks: all rows behaved as the syllabus requires."
else
  echo "join attacks: AT LEAST ONE ROW FAILED — the join or the boundary has a hole."
fi
exit "$FAILED"
