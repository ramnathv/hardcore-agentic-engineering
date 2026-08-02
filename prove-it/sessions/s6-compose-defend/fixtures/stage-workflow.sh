#!/usr/bin/env bash
# Stage the required S6 workflow in one throwaway copy. The script runs the
# four nodes and writes a human promotion record. --exports prints shell code
# for eval, so the caller receives T and PROVE_IT_ROOT in one submission.
set -euo pipefail
CODE="$(cd "$(dirname "$0")/../../.." && pwd)"
OWNER="${USER:-student}@local"
TMPBASE="${TMPDIR:-/tmp}"; TMPBASE="${TMPBASE%/}"
TMPBASE="$(cd "$TMPBASE" && pwd -P)"
if [ "${1:-}" = "--cleanup" ]; then
  TARGET="${2:?--cleanup needs the S6_LAB path}"
  RESOLVED="$(cd "$TARGET" 2>/dev/null && pwd -P)" || {
    echo "stage-workflow: cleanup target does not exist" >&2
    exit 1
  }
  case "$RESOLVED" in
    "$TMPBASE"/prove-it-s6-lab.*) ;;
    *) echo "stage-workflow: refusing cleanup outside the S6 temp path" >&2; exit 1 ;;
  esac
  [ -f "$RESOLVED/.prove-it-s6-lab" ] || {
    echo "stage-workflow: refusing cleanup without the ownership marker" >&2
    exit 1
  }
  rm -rf -- "$RESOLVED"
  echo "S6 lab removed: $RESOLVED"
  exit 0
fi
while [ $# -gt 0 ]; do
  case "$1" in
    --exports) shift ;;
    --owner) OWNER="${2:?--owner needs a value}"; shift 2 ;;
    *) echo "stage-workflow: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

T="$(mktemp -d "$TMPBASE/prove-it-s6-lab.XXXXXX")"
printf 'owned by stage-workflow.sh\n' >"$T/.prove-it-s6-lab"
KEEP=0
cleanup() {
  if [ "$KEEP" -eq 0 ]; then rm -rf "$T"; fi
}
trap cleanup EXIT

cp -R "$CODE/control" "$CODE/working" "$CODE/done" "$CODE/fixtures" "$CODE/sessions" "$T/"
mkdir -p "$T/runs"
cp "$T/control/checks/fixtures/solution-stub.mjs" "$T/working/src/slugify.mjs"
export PROVE_IT_ROOT="$T"
LOG="$T/setup.log"
NODE_NO_WARNINGS=1 node "$CODE/sessions/s6-compose-defend/fixtures/runner.ts" \
  run --wf-id live >"$LOG" 2>&1
bash "$CODE/sessions/s6-compose-defend/fixtures/promote.sh" live \
  --owner "$OWNER" \
  --rollback "git checkout -- working/ (restore the pre-workflow tree)" >>"$LOG" 2>&1

KEEP=1
printf 'export T=%q\n' "$T"
printf 'export S6_LAB=%q\n' "$T"
printf 'export PROVE_IT_ROOT=%q\n' "$T"
printf 'printf "S6 workflow ready. Full staging log: %%s\\n" "$S6_LAB/setup.log"\n'
