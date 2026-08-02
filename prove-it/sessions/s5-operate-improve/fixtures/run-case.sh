#!/usr/bin/env bash
# Run one eval case end to end and judge it the way its own yaml says.
#   bash sessions/s5-operate-improve/fixtures/run-case.sh 03-crash-boundary
# A wrapper over the rerun commands Replay steps 8 to 10 of the session page
# spell out one at a time — nothing happens in here that the walkthrough does
# not show you. Wired cases, the two whose reruns the session uses:
#   01-honest-pass     run → gate check → complete; green end to end
#   03-crash-boundary  crash between dispatch and record, then a bare resume;
#                      the harness must refuse to guess
# Each invocation takes a fresh run id (c03, then c03b; c01, then c01b), so
# the first 03 run is your baseline and the second is your target after a
# change. Exit 0 case PASS · 1 case FAIL · 2 usage.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
export PROVE_IT_ROOT="$ROOT"
cd "$ROOT"

ID="${1:-}"; ID="${ID##*/}"; ID="${ID%.yaml}"
CASE="fixtures/eval/cases/$ID.yaml"
if [ -z "$ID" ] || [ ! -f "$CASE" ]; then
  echo "usage: run-case.sh <case-id>   (a case file under fixtures/eval/cases/)"
  exit 2
fi

if bash sessions/s5-operate-improve/fixtures/checks/eval-case-check.sh "$CASE" >/dev/null 2>&1; then
  echo "shape: ok (eval-case-check on $CASE)"
else
  echo "run-case: $CASE fails eval-case-check — fix the case before running it"
  exit 2
fi

field() { grep -E "^$1:" "$CASE" | head -1 | sed -E "s/^$1:[[:space:]]*//"; }
echo "case $ID — $(field situation)"
echo "  expects:    $(field expected_outcome)"
echo "  trajectory: $(field trajectory_constraint)"

pick() {
  for c in "$1" "${1}b"; do
    if [ ! -e "runs/$c" ]; then echo "$c"; return 0; fi
  done
  echo "run-case: runs/$1 and runs/${1}b both exist — this wrapper never overwrites a run; delete one or start a fresh copy" >&2
  return 1
}

pass() { echo; echo "case $ID: PASS — $1"; exit 0; }
fail() { echo; echo "case $ID: FAIL — $1"; exit 1; }

case "$ID" in
  01-honest-pass)
    RID="$(pick c01)" || exit 2
    echo "\$ node src/loop.ts run --provider smoke --run-id $RID"
    node src/loop.ts run --provider smoke --run-id "$RID" \
      || fail "the smoke run itself failed (run $RID)"
    echo "\$ node control/dr-gate.ts check $RID"
    node control/dr-gate.ts check "$RID" \
      || fail "dr-gate refused the evidence (run $RID)"
    echo "\$ node src/loop.ts complete $RID"
    node src/loop.ts complete "$RID" \
      || fail "complete was refused (run $RID)"
    stopped="$(grep -n '"type":"run.stopped"' "runs/$RID/events.jsonl" | head -1 | cut -d: -f1)"
    ended="$(grep -n '"type":"run.completed"' "runs/$RID/events.jsonl" | head -1 | cut -d: -f1)"
    if [ -z "$stopped" ] || [ -z "$ended" ] || [ "$stopped" -ge "$ended" ]; then
      fail "trajectory violated: no run.stopped(model_claimed_done) before run.completed (run $RID)"
    fi
    pass "gate accepted, receipt verified, run completed; the worker's \"done\" preceded the gate's (run $RID)"
    ;;
  03-crash-boundary)
    RID="$(pick c03)" || exit 2
    echo "\$ PROVE_IT_CRASH_AT_TOOL=3 node src/loop.ts run --provider smoke --run-id $RID"
    PROVE_IT_CRASH_AT_TOOL=3 node src/loop.ts run --provider smoke --run-id "$RID"
    echo "\$ node src/loop.ts resume $RID"
    out="$(node src/loop.ts resume "$RID" 2>&1)"; rc=$?
    echo "$out"
    phantom="$(grep '"type":"tool.result","actor":"operator"' "runs/$RID/events.jsonl" | head -1)"
    if [ -n "$phantom" ]; then
      n="$(echo "$phantom" | sed -E 's/^\{"id":([0-9]+).*/\1/')"
      echo
      echo "  the append-only trace now holds:"
      echo "  $phantom"
      fail "phantom reconciliation: event $n says actor=operator, and no operator decided (run $RID)"
    fi
    if [ "$rc" -ne 0 ] && echo "$out" | grep -q "PENDING action"; then
      pass "resume refused to guess and demanded --reconcile or cancel; no reconciliation without an operator (run $RID)"
    fi
    fail "resume neither refused nor recorded a reconciliation — expected the PENDING refusal (run $RID)"
    ;;
  *)
    echo "run-case wires the two cases whose reruns the session uses: 01-honest-pass and 03-crash-boundary."
    echo "case $ID names its own rerun in $CASE — run it by hand, one command at a time."
    exit 2
    ;;
esac
