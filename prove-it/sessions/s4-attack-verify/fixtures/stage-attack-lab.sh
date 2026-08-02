#!/usr/bin/env bash
# S4/M7 attack-lab stager. Builds a throwaway copy of the harness containing
# exactly what the pair labs need to attack:
#   run "friday" — an honest run, checked and ACCEPTED; its receipt is the target
#   run "monday" — freshly opened, no receipt; the replay target
# Your checkout is untouched. The copy is NOT auto-deleted: the lab needs it to
# survive between attacks. Delete it yourself when the session ends.
#
# Usage (from the prove-it root):
#   bash sessions/s4-attack-verify/fixtures/stage-attack-lab.sh
#   eval "$(bash sessions/s4-attack-verify/fixtures/stage-attack-lab.sh --exports)"
set -euo pipefail
cd "$(dirname "$0")/../../.."
NODE="node"
export NODE_NO_WARNINGS=1

TMPBASE="${TMPDIR:-/tmp}"; TMPBASE="${TMPBASE%/}"
TMPBASE="$(cd "$TMPBASE" && pwd -P)"
if [ "${1:-}" = "--cleanup" ]; then
  TARGET="${2:?--cleanup needs the S4_LAB path}"
  RESOLVED="$(cd "$TARGET" 2>/dev/null && pwd -P)" || {
    echo "stage-attack-lab: cleanup target does not exist" >&2
    exit 1
  }
  case "$RESOLVED" in
    "$TMPBASE"/prove-it-s4-lab.*) ;;
    *) echo "stage-attack-lab: refusing cleanup outside the S4 temp path" >&2; exit 1 ;;
  esac
  [ -f "$RESOLVED/.prove-it-s4-lab" ] || {
    echo "stage-attack-lab: refusing cleanup without the ownership marker" >&2
    exit 1
  }
  rm -rf -- "$RESOLVED"
  echo "attack lab removed: $RESOLVED"
  exit 0
fi
if [ $# -gt 0 ] && [ "$1" != "--exports" ]; then
  echo "stage-attack-lab: use --exports or --cleanup <S4_LAB>" >&2
  exit 2
fi
T="$(mktemp -d "$TMPBASE/prove-it-s4-lab.XXXXXX")"
printf 'owned by stage-attack-lab.sh\n' >"$T/.prove-it-s4-lab"
cp -R control working done fixtures "$T/"
mkdir -p "$T/runs"
export PROVE_IT_ROOT="$T"

$NODE src/loop.ts run --provider smoke --run-id friday >/dev/null
$NODE control/dr-gate.ts check friday >/dev/null
$NODE control/dr-gate.ts verify friday >/dev/null
$NODE src/loop.ts open --run-id monday >/dev/null

if [ "${1:-}" = "--exports" ]; then
  printf 'export S4_LAB=%q\n' "$T"
  printf 'export PROVE_IT_ROOT=%q\n' "$T"
  printf 'printf "attack lab ready: %%s\\n" "$S4_LAB"\n'
  exit 0
fi

echo "attack lab staged: $T"
echo
echo "  export PROVE_IT_ROOT=$T"
echo
echo "targets:"
echo "  friday — honest receipt at \$PROVE_IT_ROOT/control/receipts/friday.json (verifies clean today)"
echo "  monday — open run, no receipt (contract sha pinned at open)"
echo
echo "the three attacks this fixture supports:"
echo "  replay   cp \$PROVE_IT_ROOT/control/receipts/friday.json \$PROVE_IT_ROOT/control/receipts/monday.json"
echo "           then: dr-gate verify monday   → expect: receipt run mismatch: replay of run 'friday'"
echo "  stale    edit anything under \$PROVE_IT_ROOT/working/ after the receipt"
echo "           then: dr-gate verify friday   → expect: receipt stale: candidate tree mismatch"
echo "  forgery  write \$PROVE_IT_ROOT/control/receipts/monday.json by hand"
echo "           then: dr-gate verify monday   → expect: receipt not issued by this gate"
