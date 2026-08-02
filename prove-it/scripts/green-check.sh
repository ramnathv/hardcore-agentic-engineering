#!/usr/bin/env bash
# Session 0 smoke test of the whole harness. Installs nothing, needs no keys,
# touches nothing in your checkout: everything runs in a throwaway copy.
# Verifies: failing check fires, smoke run goes red→green, dr-gate issues a
# receipt, forged receipt refused, stale receipt refused, M2 bootstrap accepted.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
NODE="node"
export NODE_NO_WARNINGS=1

pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ✅ $1"; }
bad()  { fail=$((fail+1)); echo "  ❌ $1"; }

echo "prove-it green check"
echo "node: $(node --version)  (need >= 22.18 — .ts runs with no flag)"

TMPBASE="${TMPDIR:-/tmp}"; TMPBASE="${TMPBASE%/}"
T="$(mktemp -d "$TMPBASE/prove-it-green.XXXXXX")"
trap 'rm -rf "$T"' EXIT
cp -R control working done fixtures "$T/"
mkdir -p "$T/runs"
export PROVE_IT_ROOT="$T"
echo "throwaway copy: $T"
echo

# Self-staging: the copy starts from the pristine red stub and the v1 check, so
# this script tells the truth no matter what state your own working/ is in.
# Your checkout is never touched.
cp "$T/control/checks/fixtures/solution-stub.mjs" "$T/working/src/slugify.mjs"
cp "$T/control/checks/slugify.test.v1.mjs" "$T/working/test/slugify.test.mjs"
node "$T/control/checks/rehash.mjs" check-v1 >/dev/null

# 1. the failing check fires on the pristine stub
if (cd "$T" && node --test working/test/slugify.test.mjs >/dev/null 2>&1); then
  bad "failing check: stub unexpectedly passed"
else
  ok "failing check fires (stub is red — honest starting state)"
fi

RID="green-$$"

# 2. keyless smoke run: red → green in scripted turns
if $NODE src/loop.ts run --provider smoke --run-id "$RID" >/dev/null; then
  ok "smoke run completed its turns (run=$RID, events in runs/$RID/events.jsonl)"
else
  bad "smoke run failed"; exit 1
fi

# 3. the check now passes
if (cd "$T" && node --test working/test/slugify.test.mjs >/dev/null 2>&1); then
  ok "named check passes after the smoke run"
else
  bad "check still red after smoke run"; exit 1
fi

# 4. dr-gate issues a bound receipt
if $NODE control/dr-gate.ts check "$RID" | sed 's/^/     /'; then
  ok "dr-gate ACCEPTED — receipt at control/receipts/$RID.json (in the throwaway copy)"
else
  bad "dr-gate refused a green candidate"; exit 1
fi

# 5. completion requires the verified receipt
if $NODE src/loop.ts complete "$RID" >/dev/null; then
  ok "run transitioned to completed via verified receipt"
else
  bad "complete failed despite valid receipt"; exit 1
fi

# 6. a forged receipt (not issued by the gate) is refused
node -e '
  const fs = require("fs"); const p = process.env.PROVE_IT_ROOT + "/control/receipts/'"$RID"'.json";
  const r = JSON.parse(fs.readFileSync(p, "utf8")); fs.writeFileSync(p + ".real", JSON.stringify(r));
  r.sig = "deadbeef".repeat(8); fs.writeFileSync(p, JSON.stringify(r));
'
if OUT="$($NODE control/dr-gate.ts verify "$RID" 2>&1)"; then
  bad "forged receipt was accepted"; exit 1
else
  echo "$OUT" | grep -q "not issued by this gate" && ok "forged receipt refused: $OUT" || { bad "wrong refusal: $OUT"; exit 1; }
fi
mv "$T/control/receipts/$RID.json.real" "$T/control/receipts/$RID.json"

# 7. old receipt + changed working tree is refused as stale
echo "// drift" >> "$T/working/src/slugify.mjs"
if OUT="$($NODE control/dr-gate.ts verify "$RID" 2>&1)"; then
  bad "stale receipt was accepted"; exit 1
else
  echo "$OUT" | grep -q "receipt stale: candidate tree mismatch" && ok "stale receipt refused: candidate tree mismatch" || { bad "wrong refusal: $OUT"; exit 1; }
fi
# undo the drift (restore the exact bytes the receipt was issued against)
cp "$T/control/checks/fixtures/solution-correct.mjs" "$T/working/src/slugify.mjs"

# 8. M2 shape: the instructor-owned bootstrap contract accepts this configuration
BID="boot-$$"
$NODE src/loop.ts open --run-id "$BID" --contract control/bootstrap-contract.yaml >/dev/null
if $NODE control/dr-gate.ts check "$BID" >/dev/null 2>&1; then
  ok "the shipped contract file parses and the gate accepts it (run=$BID)"
else
  bad "bootstrap acceptance failed"; exit 1
fi

echo
echo "green check: $pass passed, $fail failed."
echo "Containment was NOT tested here — run scripts/probe.sh for the honest report."
[ "$fail" -eq 0 ]
