#!/usr/bin/env bash
# S6 presentation fixture: the four nodes' status claims, as a summary-only
# reviewer receives them. Explicitly synthetic — each line is derived from the
# node's own entry in the workflow ledger; no receipt, event log, or check
# output is read, which is the point the compare makes.
set -euo pipefail
CODE="$(cd "$(dirname "$0")/../../.." && pwd)"
ROOT="${PROVE_IT_ROOT:-$CODE}"
WF="${1:?usage: node-summaries.sh <wf-id>}"
LEDGER="$ROOT/runs/$WF/workflow.json" node - <<'EOF'
const led = JSON.parse(require('node:fs').readFileSync(process.env.LEDGER, 'utf8'));
const nodes = Object.entries(led.nodes);
for (const [id, st] of nodes) {
  const run = st.accepted_run ?? st.runs.at(-1) ?? '(no run)';
  console.log(`summary ${id.padEnd(9)} │ "${id} complete — all checks green" (run ${run}; synthetic claim, no receipt read)`);
}
console.log(`${nodes.length}/${nodes.length} summaries read complete — none names a broken seam`);
EOF
