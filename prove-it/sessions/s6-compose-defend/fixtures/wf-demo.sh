#!/usr/bin/env bash
# S6 live demo: the supplied workflow — four verified nodes, a deterministic
# join, and human promotion outside the workflow. Runs in a throwaway copy so
# it is repeatable on stage; nothing in the checkout is mutated.
set -euo pipefail
cd "$(dirname "$0")/../../.."
NODE="node"
RUNNER="sessions/s6-compose-defend/fixtures/runner.ts"
export NODE_NO_WARNINGS=1

T="$(mktemp -d "${TMPDIR:-/tmp}/prove-it-wf.XXXXXX")"
trap 'rm -rf "$T"' EXIT
cp -R control working done fixtures sessions "$T/"
# Self-staging: the inspect node is contracted to start from a failing check,
# so the copy starts red no matter what state the real working/ is in.
cp "$T/control/checks/fixtures/solution-stub.mjs" "$T/working/src/slugify.mjs"
mkdir -p "$T/runs"
export PROVE_IT_ROOT="$T"

echo "════ 1. run the workflow: every node is a verified prove-it run"
$NODE "$RUNNER" run --wf-id demo

echo
echo "════ 2. deterministic fan-in: the join consumes receipts, never summaries"
$NODE "$RUNNER" join --wf-id demo

echo
echo "════ 3. a workflow may not promote its own output"
if PROVE_IT_WORKFLOW=1 bash sessions/s6-compose-defend/fixtures/promote.sh demo \
    --owner "the runner" --rollback "n/a" 2>&1; then
  echo "   → ACCEPTED (BUG)"; exit 1
else
  echo "   → REFUSED (as designed)"
fi

echo
echo "════ 4. the human promotes — with a named owner and a rollback path"
bash sessions/s6-compose-defend/fixtures/promote.sh demo \
  --owner "greg@specstory.com" \
  --rollback "git checkout -- working/ (restore the pre-workflow tree)"
echo
cat "$T/runs/demo/promotion.json"
