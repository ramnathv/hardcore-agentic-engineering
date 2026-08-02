#!/usr/bin/env bash
# The battery: a launcher the battery has not run does not ship. For every
# scenario under live/scenarios/, run the mock sequential path to exit 0,
# assert one room pause, the complete frame shape, the declared verdict
# semantics, and a bounded live surface. Full command output belongs in the
# retained artifact, not on the presentation surface.
set -uo pipefail
test -f src/loop.ts || {
  echo "compare-check: run this from a prove-it root (src/loop.ts not found here)."
  exit 1
}
export NODE_NO_WARNINGS=1
overall=0
found=0
for f in live/scenarios/*.ts; do
  [ -e "$f" ] || continue
  found=1
  id="$(basename "$f" .ts)"
  id="${id%%-*}"
  log="$(mktemp "${TMPDIR:-/tmp}/compare-check-${id}.XXXXXX")"
  ok=1
  if node live/runner.ts "$id" --mock --seq --ci >"$log" 2>&1; then
    art="$(sed -n 's/^artifact: //p' "$log" | head -1)"
    if [ -z "$art" ] || ! node live/runner.ts "$id" --assert-artifact "$art"; then
      echo "  $id: artifact semantics failed"
      ok=0
    fi
    clean="${log}.clean"
    sed $'s/\033\\[[0-9;]*m//g' "$log" >"$clean"
    pauses="$(grep -c '^  ? ' "$clean" || true)"
    if [ "$pauses" -ne 1 ]; then
      echo "  $id: expected one room pause, found $pauses"
      ok=0
    fi
    # The dod-demo grammar shows commands as dim `$ ` lines on purpose; the
    # guard is now truncation, not absence — a visible command never wraps.
    long_commands="$(awk '/^  \$ / && length($0) > 96' "$clean" | wc -l | tr -d ' ')"
    if [ "$long_commands" -ne 0 ]; then
      echo "  $id: $long_commands visible command line(s) exceed the 96-char truncation"
      ok=0
    fi
    # Every lane shows the exact input its worker (or standing contract) was
    # given, boxed, before anything runs — one box per lane, minimum.
    input_boxes="$(grep -c '┌─ INPUT' "$clean" || true)"
    if [ "$input_boxes" -lt 2 ]; then
      echo "  $id: expected an INPUT box per lane, found $input_boxes"
      ok=0
    fi
    # Worker output must stream as `● ` lines, never as raw markdown walls.
    raw_markdown="$(grep -c '^  - ' "$clean" || true)"
    if [ "$raw_markdown" -ne 0 ]; then
      echo "  $id: $raw_markdown raw markdown line(s) leaked past the ● renderer"
      ok=0
    fi
    visible_lines="$(wc -l <"$clean" | tr -d ' ')"
    if [ "$visible_lines" -gt 140 ]; then
      echo "  $id: presentation is $visible_lines lines (limit 140)"
      ok=0
    fi
  else
    echo "  $id: runner exited nonzero"
    ok=0
  fi
  # The one-difference rule: --describe prints every lane-specific step under
  # "causal difference:" for eyeball verification, and exits nonzero if any
  # exists without a declared allowedCausalDifference.
  node live/runner.ts "$id" --describe || ok=0
  if [ "$ok" -eq 1 ]; then
    echo "PASS $id"
    rm -f "$log" "${log}.clean"
  else
    echo "FAIL $id (full runner log: $log)"
    overall=1
  fi
done
[ "$found" -eq 1 ] || {
  echo "compare-check: no scenarios under live/scenarios/"
  exit 1
}
exit $overall
