#!/usr/bin/env bash
# Stage the S5 hand-off pack: the green demo run, then the three templates in
# runs/demo/handoff/. A wrapper over Replay steps 2 and 4 of the session page —
# nothing happens in here that the walkthrough does not show one command at a
# time. Idempotent: an existing run is left alone, and a template already in
# place is never overwritten. Usage, from the root of your (throwaway) copy:
#   bash sessions/s5-operate-improve/fixtures/stage-pack.sh
# Or create, enter, and stage a throwaway copy with one shell submission:
#   eval "$(bash sessions/s5-operate-improve/fixtures/stage-pack.sh --new-copy)"
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMPBASE="${TMPDIR:-/tmp}"; TMPBASE="${TMPBASE%/}"
TMPBASE="$(cd "$TMPBASE" && pwd -P)"

if [ "${1:-}" = "--cleanup" ]; then
  TARGET="${2:?--cleanup needs the S5_LAB path}"
  RESOLVED="$(cd "$TARGET" 2>/dev/null && pwd -P)" || {
    echo "stage-pack: cleanup target does not exist" >&2
    exit 1
  }
  case "$RESOLVED" in
    "$TMPBASE"/prove-it-s5-lab.*) ;;
    *) echo "stage-pack: refusing cleanup outside the S5 temp path" >&2; exit 1 ;;
  esac
  [ -f "$RESOLVED/.prove-it-s5-lab" ] || {
    echo "stage-pack: refusing cleanup without the ownership marker" >&2
    exit 1
  }
  rm -rf -- "$RESOLVED"
  echo "S5 lab removed: $RESOLVED"
  exit 0
fi

if [ "${1:-}" = "--new-copy" ]; then
  S5_TEMP="$(mktemp -d "$TMPBASE/prove-it-s5-lab.XXXXXX")"
  printf 'owned by stage-pack.sh\n' >"$S5_TEMP/.prove-it-s5-lab"
  S5_COPY="$S5_TEMP/prove-it"
  mkdir -p "$S5_COPY"
  cp -R "$ROOT/control" "$ROOT/done" "$ROOT/fixtures" "$ROOT/sessions" \
    "$ROOT/src" "$ROOT/working" "$ROOT/package.json" "$S5_COPY/"
  mkdir -p "$S5_COPY/runs"
  if ! bash "$S5_COPY/sessions/s5-operate-improve/fixtures/stage-pack.sh" \
      >"$S5_TEMP/stage-pack.log"; then
    rm -rf "$S5_TEMP"
    echo "stage-pack: could not stage the throwaway copy" >&2
    exit 1
  fi
  printf 'export PIT=%q\n' "$ROOT"
  printf 'export S5_LAB=%q\n' "$S5_TEMP"
  printf 'cd %q\n' "$S5_COPY"
  printf 'printf "S5 lab ready. Full staging log: %%s\\n" "$S5_LAB/stage-pack.log"\n'
  exit 0
fi
if [ $# -gt 0 ]; then
  echo "stage-pack: use --new-copy or --cleanup <S5_LAB>" >&2
  exit 2
fi

export PROVE_IT_ROOT="$ROOT"
cd "$ROOT"

if [ -f runs/demo/run.json ]; then
  echo "left alone: runs/demo already exists (delete it to restage)"
else
  echo "\$ node src/loop.ts run --provider smoke --run-id demo"
  node src/loop.ts run --provider smoke --run-id demo
  echo "\$ node control/dr-gate.ts check demo"
  node control/dr-gate.ts check demo
  echo "\$ node src/loop.ts complete demo"
  node src/loop.ts complete demo
  echo "staged: runs/demo — a green smoke run, receipt at control/receipts/demo.json"
fi

mkdir -p runs/demo/handoff
for t in handoff.md AS-BUILT.md incident.md; do
  if [ -f "runs/demo/handoff/$t" ]; then
    echo "left alone: runs/demo/handoff/$t (never overwritten)"
  else
    cp "sessions/s5-operate-improve/fixtures/templates/$t" "runs/demo/handoff/$t"
    echo "staged: runs/demo/handoff/$t (template — fill it from evidence on screen)"
  fi
done

if [ -f runs/before-after-resume.md ]; then
  echo "left alone: runs/before-after-resume.md (never overwritten)"
else
  cp sessions/s5-operate-improve/fixtures/templates/before-after.md runs/before-after-resume.md
  echo "staged: runs/before-after-resume.md (template — fill and sign after both case runs)"
fi

echo "stage-pack: done. Fill the pack, then:"
echo "  bash sessions/s5-operate-improve/fixtures/checks/handoff-check.sh runs/demo/handoff"
