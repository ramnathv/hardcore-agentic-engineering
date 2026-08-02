# labeling-trace — for the first-failure labeling exercise

A complete 23-event trace of a run that crashed and was recovered. The
exercise: open-code the trace and name the **first failing state** — the
earliest point where the run's truth stopped being fully known — before
reading anyone else's answer. Worksheet: `worksheet.md` (answer key in
`../../homework-solutions.md`).

Sanitization: absolute paths from the generating machine were replaced with
`<PROVE_IT_ROOT>`. Nothing else was edited.

Regenerate (throwaway copy, from the prove-it root):

```sh
T="$(mktemp -d)"; cp -R "$(pwd)" "$T/prove-it"; cd "$T/prove-it" && rm -rf runs && mkdir runs
PROVE_IT_CRASH_AT_TOOL=3 node src/loop.ts run --provider smoke --run-id labeling
node src/loop.ts resume labeling                      # refused: decide first
node src/loop.ts resume labeling --reconcile failed   # the operator's decision
```
