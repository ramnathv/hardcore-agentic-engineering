# failed-trace — the fallback failed run for M10 (case 06 raw material)

A real run of the core harness, preserved exactly as it failed. Use it if you
do not yet have a failed trace of your own. **Do not clean it up.** The failed
trace is the raw material; deleting or prettifying it destroys the evidence
the regression case is built from.

What happened (read the trace before reading this):

- smoke run, contract fixed (`run.json` pins the sha before turn 1)
- turn 2 wrote the naive implementation (drops the word `and`) and the named
  check went red (event 13, `tool.result run_check status=failed`)
- the operator interrupted after turn 2 (event 14) — the fix turn never ran
- a gate run was then requested on the red candidate. The gate refused:

```text
dr-gate: REFUSED — check failed: 'node --test working/test/slugify.test.mjs' exited 1, expected 0 (output in runs/fallback/check-output.txt)
```

Files:

- `run.json` — the run manifest (contract sha fixed pre-run)
- `events.jsonl` — the full append-only trace, 14 events
- `tool-output-1.txt` — the failing check's TAP output as the worker saw it
- `check-output.txt` — the failing check's output as the **gate** retained it

Sanitization: absolute paths from the generating machine were replaced with
`<PROVE_IT_ROOT>`. Nothing else was edited. Timestamps and durations are from
the original run.

Regenerate on your machine (from the prove-it root, in a throwaway copy so
your `working/` stays pristine):

```sh
T="$(mktemp -d)"; cp -R "$(pwd)" "$T/prove-it"; cd "$T/prove-it" && rm -rf runs && mkdir runs
node src/loop.ts run --provider smoke --run-id fallback --interrupt-after 2
node control/dr-gate.ts check fallback   # REFUSED, exit 1
```

The promotion exercise (M10) turns this into `fixtures/eval/cases/06-*.yaml`.
See `../../prompts/manufacture.md`, prompt 3.
