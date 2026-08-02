#!/usr/bin/env bash
# Materialize the core steering-event fixture as a viewable run.
# The events file is the course's canonical S2 sequence (plan proposed →
# rejected with a fact → rebriefed → approved → interrupt → resume). It lives
# in core at fixtures/events/steering.jsonl; this script only gives it the
# run.json shell that `loop view` requires. Idempotent; safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/../../.."          # prove-it root
R="${PROVE_IT_ROOT:-$(pwd)}"
mkdir -p "$R/runs/fx-steering"
printf '{ "run_id": "fx-steering", "contract_path": "done/contract.yaml", "provider": "none" }\n' \
  > "$R/runs/fx-steering/run.json"
cp fixtures/events/steering.jsonl "$R/runs/fx-steering/events.jsonl"
echo "runs/fx-steering ready. Walk the log, then project it:"
echo "  cat $R/runs/fx-steering/events.jsonl"
echo "  node src/loop.ts view fx-steering"
