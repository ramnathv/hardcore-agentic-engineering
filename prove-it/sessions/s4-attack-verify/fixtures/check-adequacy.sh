#!/usr/bin/env bash
# S4/M8 adequacy checker — proves a strengthened check EARNS the version bump.
# A check upgrade counts only if all three states hold:
#   1. the CURRENT check stays green over the seeded fault  (fault is invisible today)
#   2. the STRENGTHENED check goes red over the seeded fault (fault is caught)
#   3. the STRENGTHENED check stays green over the known-correct solution (no false alarm)
# Runs node:test directly in a throwaway copy; the gate is not involved, so this
# is safe to run as often as you like. Exit 0 only if all three hold.
#
# Usage (from the prove-it root):
#   bash sessions/s4-attack-verify/fixtures/check-adequacy.sh <fault.mjs> <strengthened-test.mjs>
# Example (the supplied v2 fault against the supplied v3 check):
#   bash sessions/s4-attack-verify/fixtures/check-adequacy.sh \
#     sessions/s4-attack-verify/fixtures/solution-faulty-v2.mjs \
#     sessions/s4-attack-verify/fixtures/slugify.test.v3.mjs
set -euo pipefail
cd "$(dirname "$0")/../../.."

FAULT="${1:?usage: check-adequacy.sh <fault.mjs> <strengthened-test.mjs>}"
STRONG="${2:?usage: check-adequacy.sh <fault.mjs> <strengthened-test.mjs>}"
[ -f "$FAULT" ]  || { echo "no such fault file: $FAULT" >&2; exit 2; }
[ -f "$STRONG" ] || { echo "no such test file: $STRONG" >&2; exit 2; }
export NODE_NO_WARNINGS=1

T="$(mktemp -d "${TMPDIR:-/tmp}/prove-it-adequacy.XXXXXX")"
trap 'rm -rf "$T"' EXIT
cp -R working "$T/working"
cp -R control "$T/control"

FAILED=0
state() { printf '%s %s\n' "$1" "$2"; }

# 1. current check green over the fault — the fault must be invisible today,
#    otherwise there is nothing to strengthen against.
cp "$FAULT" "$T/working/src/slugify.mjs"
if (cd "$T" && node --test working/test/slugify.test.mjs >/dev/null 2>&1); then
  state "✅" "state 1: current check stays GREEN over the fault (fault is invisible — worth strengthening)"
else
  state "❌" "state 1: current check already catches this fault — seed a fault your checks actually miss"
  FAILED=1
fi

# 2. strengthened check red over the fault — the new case must detect it.
cp "$STRONG" "$T/working/test/slugify.test.mjs"
if (cd "$T" && node --test working/test/slugify.test.mjs >/dev/null 2>&1); then
  state "❌" "state 2: strengthened check stays green over the fault — it does not catch the wrong result"
  FAILED=1
else
  state "✅" "state 2: strengthened check goes RED over the fault (caught)"
fi

# 3. strengthened check green over the known-correct solution — no false alarm.
cp "$T/control/checks/fixtures/solution-correct.mjs" "$T/working/src/slugify.mjs"
if (cd "$T" && node --test working/test/slugify.test.mjs >/dev/null 2>&1); then
  state "✅" "state 3: strengthened check stays GREEN over the correct solution (no false alarm)"
else
  state "❌" "state 3: strengthened check fails the correct solution — it tests the wrong property"
  FAILED=1
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "adequacy: all three states hold. The strengthened check earns a version bump:"
  echo "  cp $STRONG working/test/slugify.test.mjs"
  echo "  node control/checks/rehash.mjs <new-version>     # host action — never the worker's"
  echo "  (old receipts go stale on check_version; that is the point)"
else
  echo "adequacy: NOT proven. A check earns trust by catching a relevant wrong result."
fi
exit "$FAILED"
