#!/usr/bin/env bash
# Session 0 repo-readiness probe. Every row is an actual attempt on THIS
# machine, never an inference from configuration. Honest labels:
#   READY    — required, works
#   BLOCKED  — required, does not work (fix before Session 1)
#   PRESENT / ABSENT — optional for Session 0; ABSENT is stated, never hidden
#   INFO     — a fact you must know, not a pass/fail
# Exit 0 only when every required row is READY.
set -uo pipefail
cd "$(dirname "$0")/../../.."   # prove-it root

blocked=0
ready() { echo "  READY    $1"; }
block() { blocked=$((blocked+1)); echo "  BLOCKED  $1"; }

echo "prove-it Session 0 readiness — every row is an actual attempt"
echo

# 1. node present and new enough to run .ts files with no flag
if command -v node >/dev/null 2>&1; then
  v="$(node --version)"
  if node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)'; then
    ready "node $v (need >= 22.18)"
  else
    block "node $v is too old — need >= 22.18, which runs .ts with no flag (nvm install 22)"
  fi
else
  block "node not found on PATH — install Node 22.18 or newer"
fi

# 2. TypeScript really does run directly (attempted, not assumed)
tsprobe="$(mktemp -d)/probe.ts"
printf 'const ok: number = 1;\nprocess.exit(ok === 1 ? 0 : 1);\n' > "$tsprobe"
if node "$tsprobe" >/dev/null 2>&1; then
  ready "TypeScript runs directly: no flag, no build step"
else
  block "this Node cannot run .ts directly — install 22.18 or newer"
fi
rm -rf "$(dirname "$tsprobe")"

# 3. starter layout intact (the files every S0 command touches)
missing=""
for f in control/dr-gate.ts control/gate.key control/bootstrap-contract.yaml \
         done/contract.yaml working/test/slugify.test.mjs working/src/slugify.mjs \
         scripts/green-check.sh scripts/probe.sh src/loop.ts; do
  [ -e "$f" ] || missing="$missing $f"
done
if [ -z "$missing" ]; then
  ready "starter layout intact (gate, key, contracts, checks, scripts)"
else
  block "starter files missing:$missing — re-install the starter"
fi

# 4. runs/ is writable (the event log must be able to land)
if mkdir -p runs && touch runs/.readiness-probe 2>/dev/null; then
  rm -f runs/.readiness-probe
  ready "runs/ writable — events.jsonl can be appended"
else
  block "cannot write runs/ — fix permissions before any run"
fi

# 5–7. optional rows: honest ABSENT, never a silent fallback
if command -v git >/dev/null 2>&1; then
  echo "  PRESENT  git ($(git --version | cut -d' ' -f3)) — resets and the real-repo transfer use it"
else
  echo "  ABSENT   git — smoke runs still work; you will want it for the real-repo task"
fi
for bin in claude codex; do
  if command -v "$bin" >/dev/null 2>&1; then
    echo "  PRESENT  $bin CLI — a real one-turn provider run is available"
  else
    echo "  ABSENT   $bin CLI — smoke is keyless and enough for the required path;"
    echo "           an optional real-provider turn is available under Go deeper"
  fi
done

# 8. containment: state the truth rather than claim a capability
echo "  INFO     no OS sandbox is wired in the starter; a later task probes"
echo "           what that means (scripts/probe.sh)."

echo
if [ "$blocked" -eq 0 ]; then
  echo "readiness: all required rows READY. Next: bash scripts/green-check.sh"
else
  echo "readiness: $blocked required row(s) BLOCKED — fix those before Session 1."
fi
exit "$blocked"
