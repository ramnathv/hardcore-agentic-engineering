#!/usr/bin/env bash
# The live-runtime QA matrix. Everything the brief's Phase 7 gate asks for that
# a machine can answer, run in one go, reported one line per item.
#
#   bash scripts/live-qa.sh mock      the keyless battery only (no provider)
#   bash scripts/live-qa.sh claude    one Claude rehearsal per scenario
#   bash scripts/live-qa.sh repeat    S1 and S3, three consecutive times
#   bash scripts/live-qa.sh codex     S1 and S3 through Codex
#   bash scripts/live-qa.sh all       everything above, in that order
#
# Rehearsal evidence goes to a temp artifact root and is deleted. Nothing here
# touches the checkout, and nothing here pushes.
set -uo pipefail
cd "$(dirname "$0")/.."
export NODE_NO_WARNINGS=1

WHICH="${1:-all}"
OUT="${TMPDIR:-/tmp}/prove-it-live-qa"
rm -rf "$OUT"; mkdir -p "$OUT"
RESULTS="$OUT/results.txt"
: > "$RESULTS"

pass=0; fail=0
record() { # record <ok|no> <label>
  if [ "$1" = "ok" ]; then pass=$((pass+1)); echo "PASS  $2" | tee -a "$RESULTS"
  else fail=$((fail+1)); echo "FAIL  $2" | tee -a "$RESULTS"; fi
}

# Every rehearsal starts from nothing left over by the last one.
scrub() {
  pkill -f "claude -p" 2>/dev/null
  pkill -f "codex exec" 2>/dev/null
  rm -rf "${TMPDIR:-/tmp}/prove-it-live" "${TMPDIR:-/tmp}/prove-it-gate" 2>/dev/null
}

rehearse() { # rehearse <scenario> <label>   (PROVE_IT_LIVE_PROVIDER selects the agent)
  local sc="$1" label="$2"; shift 2
  scrub
  local dir="$OUT/$label"; mkdir -p "$dir"
  if node live/runner.ts "$sc" --seq --ci --artifact "$dir" > "$dir/out.log" 2>&1; then
    # Exit zero is necessary and not sufficient: every frame must have resolved.
    if grep -q "UNEXPECTED" "$dir/frames.txt" 2>/dev/null; then
      record no "$label — a frame did not resolve"
    elif [ -n "${EXPECT_PROVIDER:-}" ] && ! grep -qi "$EXPECT_PROVIDER" "$dir/out.log"; then
      # A provider rehearsal that never started that provider is a false pass.
      # codex-s1 passed this way once, running Claude the whole time.
      record no "$label — no sign of $EXPECT_PROVIDER in the run"
    else
      record ok "$label"
    fi
  else
    record no "$label — runner exited nonzero"
  fi
  scrub
}

echo "live QA matrix — $(date '+%H:%M:%S')" | tee -a "$RESULTS"
echo "node $(node --version)" | tee -a "$RESULTS"
echo | tee -a "$RESULTS"

if [ "$WHICH" = "mock" ] || [ "$WHICH" = "all" ]; then
  echo "── the keyless battery (what a student runs) ──" | tee -a "$RESULTS"
  bash scripts/green-check.sh >/dev/null 2>&1 && record ok "green-check 8/8" || record no "green-check"
  npm test >/dev/null 2>&1 && record ok "npm test 19/19" || record no "npm test"
  bash scripts/compare-check.sh >/dev/null 2>&1 && record ok "compare-check s1..s6 in --mock" || record no "compare-check"
  bash scripts/tamper-table.sh >/dev/null 2>&1 && record ok "tamper table 6/6" || record no "tamper table"
  npm run test:live >/dev/null 2>&1 && record ok "live runtime tests" || record no "live runtime tests"
  echo | tee -a "$RESULTS"
fi

if [ "$WHICH" = "claude" ] || [ "$WHICH" = "all" ]; then
  echo "── one Claude rehearsal per scenario ──" | tee -a "$RESULTS"
  for sc in s1 s2 s3 s4 s5 s6; do rehearse "$sc" "claude-$sc"; done
  echo | tee -a "$RESULTS"
fi

if [ "$WHICH" = "repeat" ] || [ "$WHICH" = "all" ]; then
  echo "── S1 and S3, three consecutive Claude rehearsals ──" | tee -a "$RESULTS"
  for n in 1 2 3; do
    rehearse s1 "claude-s1-run$n"
    rehearse s3 "claude-s3-run$n"
  done
  echo | tee -a "$RESULTS"
fi

if [ "$WHICH" = "codex" ] || [ "$WHICH" = "all" ]; then
  echo "── S1 and S3 through Codex ──" | tee -a "$RESULTS"
  # Codex is not contained (see live/providers/CONFINEMENT.md). It runs here to
  # prove the runtime is provider-neutral, not to certify the lane.
  if command -v codex >/dev/null 2>&1; then
    PROVE_IT_LIVE_PROVIDER=codex-cli EXPECT_PROVIDER=codex rehearse s1 "codex-s1"
    PROVE_IT_LIVE_PROVIDER=codex-cli EXPECT_PROVIDER=codex rehearse s3 "codex-s3"
  else
    record no "codex is not on PATH — rehearsal not attempted"
  fi
  echo | tee -a "$RESULTS"
fi

echo "live QA: $pass passed, $fail failed — $(date '+%H:%M:%S')" | tee -a "$RESULTS"
echo "logs: $OUT" | tee -a "$RESULTS"
[ "$fail" -eq 0 ]
