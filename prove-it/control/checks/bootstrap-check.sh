#!/usr/bin/env bash
# Instructor-owned acceptance fixture for M1/M2. Inspect it; do not edit it.
# Passes only when: the operator contract exists with every schema key, some run
# manifest pins that contract's current sha256, and the gate issued a receipt
# for that same run (the receipt itself is judged by `dr-gate verify`).
set -euo pipefail
R="${PROVE_IT_ROOT:-$(pwd)}"

sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

[ -f "$R/done/contract.yaml" ] || { echo "REFUSE: no operator contract at done/contract.yaml"; exit 1; }
for k in outcome checks runtime_observation must_change must_not_change budgets stop_and_ask release_owner; do
  grep -q "^$k:" "$R/done/contract.yaml" || { echo "REFUSE: contract missing key: $k"; exit 1; }
done

WANT="$(sha "$R/done/contract.yaml")"
# A run counts only if it BOTH pins the current sha AND earned a receipt; keep
# scanning past sha-matching runs without one (e.g. an S0 leftover) instead of
# refusing on the first match.
MATCH=""
SHA_ONLY=""
for m in "$R"/runs/*/run.json; do
  [ -e "$m" ] || break
  grep -q "$WANT" "$m" || continue
  rid="$(basename "$(dirname "$m")")"
  SHA_ONLY="$rid"
  [ -f "$R/control/receipts/$rid.json" ] && MATCH="$m" && break
done
if [ -z "$MATCH" ]; then
  [ -n "$SHA_ONLY" ] && { echo "REFUSE: no gate receipt for run $SHA_ONLY"; exit 1; }
  echo "REFUSE: no run manifest pins the current contract sha $WANT"; exit 1
fi

RID="$(basename "$(dirname "$MATCH")")"

echo "bootstrap acceptance: contract complete, run $RID pins sha $WANT, receipt present"
