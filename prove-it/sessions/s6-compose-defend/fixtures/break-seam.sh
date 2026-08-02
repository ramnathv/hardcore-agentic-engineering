#!/usr/bin/env bash
# S6 live-compare seam mechanic: break exactly one join seam in a throwaway
# copy, or put everything back. Each seam reuses an attack mechanic this
# fixtures directory already teaches — join-attacks.sh row 1 (old receipt),
# row 1b (post-receipt drift), the resume-time overspend attack in runner.ts,
# and the forged tool.result write from the student page's exercise 3b.
# Restore undoes only what break touched, so promote.sh can re-run a clean
# join afterwards.
#
#   break-seam.sh <wf-id> <seam>   seams: write-set-overlap |
#                                  swapped-receipt-identity | stale-candidate |
#                                  blown-shared-budget
#   break-seam.sh <wf-id> restore
set -euo pipefail
CODE="$(cd "$(dirname "$0")/../../.." && pwd)"
ROOT="${PROVE_IT_ROOT:-$CODE}"
WF="${1:?usage: break-seam.sh <wf-id> <seam>|restore}"
SEAM="${2:?usage: break-seam.sh <wf-id> <seam>|restore}"
BAK="$ROOT/runs/$WF/seam-backup"

backup() { # $1 = path relative to ROOT
  mkdir -p "$BAK"
  printf '%s\n' "$1" >> "$BAK/manifest.txt"
  cp "$ROOT/$1" "$BAK/$(printf '%s' "$1" | tr '/' '_')"
}

case "$SEAM" in
  restore)
    [ -f "$BAK/manifest.txt" ] || { echo "break-seam: nothing to restore"; exit 0; }
    while IFS= read -r rel; do
      cp "$BAK/$(printf '%s' "$rel" | tr '/' '_')" "$ROOT/$rel"
    done < "$BAK/manifest.txt"
    rm -rf "$BAK"
    echo "break-seam: seam restored — the copy is honest again"
    ;;
  write-set-overlap)
    backup "runs/$WF-review/events.jsonl"
    printf '%s\n' "{\"id\":99,\"run\":\"$WF-review\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"type\":\"tool.result\",\"actor\":\"worker\",\"data\":{\"tool\":\"write\",\"changed\":[\"working/src/slugify.mjs\"]}}" \
      >> "$ROOT/runs/$WF-review/events.jsonl"
    echo "break-seam: forged a tool.result in the review run — it now claims a write into implement's territory (working/src/slugify.mjs)"
    ;;
  swapped-receipt-identity)
    backup "control/receipts/$WF-verify.json"
    cp "$ROOT/control/receipts/$WF-inspect.json" "$ROOT/control/receipts/$WF-verify.json"
    echo "break-seam: the verify node now presents another run's receipt as its own"
    ;;
  stale-candidate)
    backup "working/src/slugify.mjs"
    echo "// post-receipt drift" >> "$ROOT/working/src/slugify.mjs"
    echo "break-seam: the working tree changed after the receipts were issued"
    ;;
  blown-shared-budget)
    backup "runs/$WF/workflow.json"
    node "$CODE/sessions/s6-compose-defend/fixtures/runner.ts" run --wf-id "$WF" --attack overspend
    echo "break-seam: a child retry layer overspent the shared budget — the spending is real, the ledger restore will disown it"
    ;;
  *)
    echo "break-seam: unknown seam '$SEAM' (wired: write-set-overlap swapped-receipt-identity stale-candidate blown-shared-budget)" >&2
    exit 2
    ;;
esac
