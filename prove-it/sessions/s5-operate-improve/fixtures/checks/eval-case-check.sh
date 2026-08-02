#!/usr/bin/env bash
# Validate eval case files (fixtures/eval/cases/*.yaml shape).
# Usage:
#   bash .../eval-case-check.sh fixtures/eval/cases/06-my-case.yaml   # one or more files
#   bash .../eval-case-check.sh fixtures/eval/cases                   # pack mode: all cases,
#                                                                    # requires >= 6, unique ids
# Cases 06+ must carry source_trace pointing at a PRESERVED trace that exists.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
[ $# -ge 1 ] || { echo "usage: eval-case-check.sh <case.yaml ...|cases-dir>"; exit 1; }

files=(); PACK=0
if [ -d "$1" ] || [ -d "$ROOT/$1" ]; then
  d="$1"; [ -d "$d" ] || d="$ROOT/$1"
  PACK=1
  while IFS= read -r f; do files+=("$f"); done < <(ls "$d"/*.yaml 2>/dev/null | grep -v 'template')
else
  for a in "$@"; do [ -f "$a" ] && files+=("$a") || files+=("$ROOT/$a"); done
fi

[ "${#files[@]}" -gt 0 ] || { echo "eval-case-check: no case files found"; exit 1; }

pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  ok   $1"; }
bad() { fail=$((fail+1)); echo "  FAIL $1"; }

ids=""
for f in "${files[@]}"; do
  b="$(basename "$f" .yaml)"
  [ -f "$f" ] || { bad "$b: file not found ($f)"; continue; }
  id="$(grep -E '^id:' "$f" | head -1 | sed -E 's/^id:[[:space:]]*//; s/[[:space:]]*$//')"
  [ "$id" = "$b" ] && ok "$b: id matches filename" || bad "$b: id '$id' != filename '$b'"
  ids="$ids $id"
  for k in situation expected_outcome trajectory_constraint grader; do
    grep -qE "^$k:" "$f" && ok "$b: has $k" || bad "$b: missing key '$k'"
  done
  g="$(grep -E '^grader:' "$f" | head -1)"
  echo "$g" | grep -qE 'deterministic|model-based|human-adjudicated' \
    && ok "$b: grader names its type" \
    || bad "$b: grader must name deterministic | model-based | human-adjudicated"
  n="${b%%-*}"
  case "$n" in (0[6-9]|[1-9][0-9])
    st="$(grep -E '^source_trace:' "$f" | head -1 | sed -E 's/^source_trace:[[:space:]]*//; s/#.*//; s/[[:space:]]*$//')"
    if [ -z "$st" ]; then
      bad "$b: cases 06+ need source_trace — keep the failed trace, it is the raw material"
    elif [ -e "$ROOT/$st" ] || [ -e "$st" ]; then
      ok "$b: source_trace exists ($st)"
    else
      bad "$b: source_trace path does not exist: $st"
    fi
  ;; esac
done

if [ "$PACK" -eq 1 ]; then
  count="${#files[@]}"
  [ "$count" -ge 6 ] && ok "pack has $count cases (optional M10 target: >= 6)" || bad "pack has $count cases; optional M10 target is >= 6"
  dup="$(echo "$ids" | tr ' ' '\n' | grep -v '^$' | sort | uniq -d)"
  [ -z "$dup" ] && ok "case ids are unique" || bad "duplicate case ids:$dup"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "eval-case-check: PASS ($pass checks). Shape only — whether a grader is"
  echo "HONEST is the grader-health drill, not this script."
  exit 0
else
  echo "eval-case-check: FAILED ($fail of $((pass+fail)) checks)."
  exit 1
fi
