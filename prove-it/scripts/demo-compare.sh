#!/usr/bin/env bash
# Thin launcher for the live compare runner. The session id is the only
# argument that changes:
#   bash scripts/demo-compare.sh s2            tmux, two panes, real by default
#   bash scripts/demo-compare.sh s2 --mock     keyless rehearsal / student mode
#   bash scripts/demo-compare.sh s2 --seq      sequential lanes, no tmux needed
set -euo pipefail
test -f src/loop.ts || {
  echo "demo-compare: run this from a prove-it root (src/loop.ts not found here)."
  exit 1
}
[ $# -ge 1 ] || {
  echo "usage: bash scripts/demo-compare.sh <scenarioId> [--mock] [--seq]"
  exit 1
}
NODE_NO_WARNINGS=1 exec node live/runner.ts "$@"
