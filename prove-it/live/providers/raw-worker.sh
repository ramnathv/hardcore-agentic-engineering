#!/usr/bin/env bash
# One raw agent, whichever provider the rehearsal selected.
#
#   bash live/providers/raw-worker.sh '<the brief>'
#
# "Raw" is the point, not an oversight. S5's cold reader is an agent with no
# harness around it — no tool boundary, no durable log, no gate — because a
# fresh pair of eyes on a trace is the lesson condition, so this deliberately
# does NOT route through live/runtime/cli.ts. (S1 and S2 once used this for
# their left lanes; both now fork one harness-run worker instead, so the
# completion rule is the only thing their lanes disagree about.)
#
# PROVE_IT_LIVE_PROVIDER picks the agent. The two CLIs disagree about almost
# every flag, which is why this file exists: a scenario should name a brief, not
# a vendor.
set -uo pipefail
BRIEF="${1:?usage: raw-worker.sh '<brief>'}"

case "${PROVE_IT_LIVE_PROVIDER:-claude-cli}" in
  codex-cli)
    exec codex exec --json --skip-git-repo-check --yolo "$BRIEF"
    ;;
  claude-cli|*)
    exec claude --dangerously-skip-permissions --output-format stream-json --verbose -p "$BRIEF"
    ;;
esac
