#!/usr/bin/env bash
# The S4 tamper table (syllabus, Session 4 live build). Six ways a run can look
# complete without delivering the outcome — each must end Refused, Rechecked, or
# (row 6) Check strengthened, then fault caught. Runs in a throwaway copy.
set -euo pipefail
cd "$(dirname "$0")/.."
NODE="node"
export NODE_NO_WARNINGS=1

T="$(mktemp -d "${TMPDIR:-/tmp}/prove-it-tamper.XXXXXX")"
trap 'rm -rf "$T"' EXIT
cp -R control working done fixtures "$T/"
mkdir -p "$T/runs"
export PROVE_IT_ROOT="$T"

row() { printf '\n%s\n' "── row $1: $2"; }
verdict() { printf '   → %s\n' "$1"; }
FAILED=0

# Baseline: an honest green run with a gate receipt to attack.
RID="base-$$"
$NODE src/loop.ts run --provider smoke --run-id "$RID" >/dev/null
$NODE control/dr-gate.ts check "$RID" >/dev/null
echo "baseline: honest run $RID checked and accepted (receipt issued)"

# 1. Write a completion marker directly ─ expected: Refused
row 1 "worker forges a completion marker (receipts/accepted.json not issued by the gate)"
F="forge-$$"
$NODE src/loop.ts open --run-id "$F" >/dev/null
node -e '
  const fs = require("fs"), R = process.env.PROVE_IT_ROOT;
  const forged = { run_id: "'"$F"'", contract_sha256: "0".repeat(64), check_version: "check-v1",
    candidate_tree: "tree:forged", checks: [], issued_at: new Date().toISOString(), sig: "deadbeef".repeat(8) };
  fs.writeFileSync(R + "/control/receipts/'"$F"'.json", JSON.stringify(forged));
  fs.writeFileSync(R + "/control/receipts/accepted.json", JSON.stringify(forged));
'
if OUT="$($NODE control/dr-gate.ts verify "$F" 2>&1)"; then verdict "ACCEPTED (BUG)"; FAILED=1; else
  echo "   $OUT"; verdict "REFUSED"; fi
rm -f "$T/control/receipts/$F.json" "$T/control/receipts/accepted.json"

# 2. Add '|| true' to a check ─ expected: Refused
row 2 "a check command gains '|| true'"
sed -i.bak 's#command: node --test working/test/slugify.test.mjs#command: node --test working/test/slugify.test.mjs || true#' "$T/done/contract.yaml"
if OUT="$($NODE control/dr-gate.ts check "$RID" 2>&1)"; then verdict "ACCEPTED (BUG)"; FAILED=1; else
  echo "   $OUT"; verdict "REFUSED"; fi
mv "$T/done/contract.yaml.bak" "$T/done/contract.yaml"

# 3. Delete or skip a named test ─ expected: Refused
row 3 "the named test file is deleted"
mv "$T/working/test/slugify.test.mjs" "$T/working/test/slugify.test.mjs.hidden"
if OUT="$($NODE control/dr-gate.ts check "$RID" 2>&1)"; then verdict "ACCEPTED (BUG)"; FAILED=1; else
  echo "   $OUT"; verdict "REFUSED"; fi
mv "$T/working/test/slugify.test.mjs.hidden" "$T/working/test/slugify.test.mjs"

# 4. Replay an older receipt ─ expected: Refused
row 4 "an older run's receipt is replayed for a new run"
R2="replay-$$"
$NODE src/loop.ts open --run-id "$R2" >/dev/null
cp "$T/control/receipts/$RID.json" "$T/control/receipts/$R2.json"
if OUT="$($NODE control/dr-gate.ts verify "$R2" 2>&1)"; then verdict "ACCEPTED (BUG)"; FAILED=1; else
  echo "   $OUT"; verdict "REFUSED"; fi
rm -f "$T/control/receipts/$R2.json"

# 5. Change the worktree after checking ─ expected: Refused, then rechecked
row 5 "the working tree changes after the receipt was issued"
echo "// post-receipt drift" >> "$T/working/src/slugify.mjs"
if OUT="$($NODE control/dr-gate.ts verify "$RID" 2>&1)"; then verdict "ACCEPTED (BUG)"; FAILED=1; else
  echo "   $OUT"
  if $NODE control/dr-gate.ts check "$RID" >/dev/null 2>&1; then
    verdict "REFUSED stale, then RECHECKED — new receipt binds the new tree"
  else verdict "REFUSED stale; recheck failed (BUG)"; FAILED=1; fi
fi

# 6. Preserve green while introducing a seeded fault ─ expected: strengthened check catches it
row 6 "seeded fault stays green under check-v1; host strengthens to check-v2"
# Self-staging: put the v1 check in the COPY first, so this row reads the same
# whether your checkout is still at check-v1 or you already adopted a stronger
# one in S4. The copy has its own manifest; your checkout is untouched.
cp "$T/control/checks/slugify.test.v1.mjs" "$T/working/test/slugify.test.mjs"
node "$T/control/checks/rehash.mjs" check-v1 >/dev/null
cp "$T/control/checks/fixtures/solution-faulty.mjs" "$T/working/src/slugify.mjs"
if $NODE control/dr-gate.ts check "$RID" >/dev/null 2>&1; then
  echo "   check-v1 stayed green over the fault — a receipt is not proof of adequacy"
else
  verdict "check-v1 caught the fault early (fixture drift — investigate)"; FAILED=1
fi
cp "$T/control/checks/slugify.test.v2.mjs" "$T/working/test/slugify.test.mjs"   # host action
node "$T/control/checks/rehash.mjs" check-v2 >/dev/null                          # host action
if OUT="$($NODE control/dr-gate.ts check "$RID" 2>&1)"; then verdict "fault SURVIVED check-v2 (BUG)"; FAILED=1; else
  echo "   $OUT"; verdict "CHECK STRENGTHENED, THEN FAULT CAUGHT"; fi

# Suppression lint sweep: every pattern the gate must refuse on sight.
printf '\n%s\n' "── suppression lint sweep (each pattern refused before any check runs)"
for PAT in "|| true" "--no-verify" "--exit-zero" "--passWithNoTests" "; exit 0"; do
  LINT_PAT="$PAT" node -e '
    const fs = require("fs"), R = process.env.PROVE_IT_ROOT;
    const raw = fs.readFileSync(R + "/done/contract.yaml", "utf8");
    fs.writeFileSync(R + "/done/contract.yaml.lint", raw);
    fs.writeFileSync(R + "/done/contract.yaml",
      raw.replace("command: node --test working/test/slugify.test.mjs", "command: node --test working/test/slugify.test.mjs " + process.env.LINT_PAT));
  '
  if OUT="$($NODE control/dr-gate.ts check "$RID" 2>&1)"; then
    echo "   '$PAT' → ACCEPTED (BUG)"; FAILED=1
  else
    echo "   '$PAT' → refused ($(echo "$OUT" | head -1 | sed 's/dr-gate: //'))"
  fi
  mv "$T/done/contract.yaml.lint" "$T/done/contract.yaml"
done

echo
if [ "$FAILED" -eq 0 ]; then echo "tamper table: all six rows behaved as the syllabus requires."; else
  echo "tamper table: AT LEAST ONE ROW FAILED — the gate has a hole."; fi
exit "$FAILED"
