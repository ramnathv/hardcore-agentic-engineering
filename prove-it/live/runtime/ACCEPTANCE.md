# Phase 1 acceptance — the live runtime

Run every command from `course/prove-it/`. Nothing here needs a key, a network,
or a provider binary: Phase 1 ships the deterministic smoke adapter, and the
Claude adapter arrives in Phase 2.

Every command below passes `--tmp`, so a rehearsal writes its evidence under
`${TMPDIR:-/tmp}/prove-it-live-artifacts/` and leaves the checkout alone. Drop `--tmp`
when you want the run kept in `live/artifacts/` like a real comparison.

The gate the brief sets for this phase is four statements. Sections 1 to 4
below each prove one of them, by hand.

---

## 0. The student harness is untouched

Run these first. If any of them behaves differently than it did before, stop —
the rest of the phase does not matter.

```sh
bash scripts/green-check.sh      # expect: green check: 8 passed, 0 failed
npm test                         # expect: # pass 19, # fail 0
bash scripts/compare-check.sh    # expect: PASS s1 … PASS s6
bash scripts/probe.sh            # expect: the same honest containment report
bash scripts/tamper-table.sh     # expect: all six rows behaved as the syllabus requires
bash scripts/demo-compare.sh s3 --mock --seq --ci   # expect: exit 0, unchanged
```

Nothing under `src/`, `control/`, `working/`, or `tests/` changed. The new code
is all under `live/runtime/`, `live/providers/`, and `live/tests/`.

---

## 1. A multi-turn smoke run completes

```sh
npm run live:smoke -- --tmp
```

**What you should see**, in order:

- `AGENT Reading the current implementation before I change it.`
- `TOOL read_file · working/src/slugify.mjs` and a `✓` line
- `TOOL write_file` then `TOOL run_check` with a red `✗ failed — check failed (exit 1)`
- `AGENT The check failed on the ampersand case. Fixing it and re-running.`
- a second `run_check` with a green `✓ ok — check passed`
- `STATE The agent stated its work is complete. That is a claim. The gate has
  not been asked yet.`
- a `RUN` block ending `status needs_evidence`, `turns 4/8`, `tools 5 requested
  · 1 failed · 0 refused`

**The signal that matters:** four turns, and the second `run_check` is green.
The agent did not know in advance that the first attempt was wrong — it found
out because the harness ran the check and handed back the failure.

**Also confirm the harness, not the agent, did the work.** The last line prints
an `Artifact:` path. Open it:

```sh
D=$(ls -td "${TMPDIR:-/tmp}"/prove-it-live-artifacts/smoke-slugify-* | head -1)
ls "$D"/shared/tools/          # args.json + result.json + stdout/stderr per call
grep -c message.delta "$D"/shared/provider.raw.jsonl   # streaming text is kept raw
grep -c message.delta "$D"/shared/events.jsonl         # expect 0 — the log keeps whole messages
cat "$D"/manifest.json
```

The manifest names the scenario, runtime version, provider, model, session id,
contract hash, and start/stop times. It contains no home path and no token.

---

## 2. Every tool result returns to the agent

Two proofs, one on screen and one by construction.

**On screen:** section 1 already showed it. The agent's third turn quotes the
failure it was handed. It could not have written that turn without receiving
the result.

**By construction:** the smoke adapter branches on what comes back. If the
runtime ever stopped returning results, the run would end early and say so:

```sh
npm run test:live
```

Expect `# pass 52, # fail 0`. The relevant tests are
`every tool result completes the round trip back to the adapter` and
`a refusal is returned to the agent and the turn continues`.

**Watch a refusal reach the agent and get handled:**

```sh
node live/runtime/cli.ts smoke --script refusal --tmp
```

The agent asks to read `../control/gate.key`, the harness answers
`⊘ refused — credential path denied (fake or real, same rule)`, and the agent
then reads a path it is allowed to read. The run ends `1 refused` and
`needs_evidence` — a refusal is an answer, not a crash.

---

## 3. A restart reconstructs the run from the events alone

This is the S3 mechanism, running for real. The payment is a fixture; the
crash is not.

**Stop the process after the side effect and before the result record:**

```sh
PROVE_IT_LIVE_CRASH_AT=after_effect node live/runtime/cli.ts smoke \
  --script payment --run-id demo1 --tmp
echo "exit=$?"     # expect 9
```

**Look at the world and the log, separately:**

```sh
cat "${TMPDIR:-/tmp}/prove-it-live/demo1/live-state/ledger.jsonl"   # ONE payment happened
D=$(ls -td "${TMPDIR:-/tmp}"/prove-it-live-artifacts/smoke-payment-* | head -1)
tail -1 "$D"/shared/events.jsonl | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).type))'
```

The ledger has one entry. The log's last event is `tool.dispatched`. There is
no `tool.result`. The harness committed to an action and never recorded what
came of it.

**Confirm the runtime says so, rebuilding the state from the log:**

```sh
node live/runtime/cli.ts view "$D"
```

Expect `status needs_reconcile`, then a `STATE` block naming the tool, the
exact arguments, the idempotency key, the dispatch time, and the stage path to
go and inspect.

**Confirm a bare resume fails:**

```sh
node live/runtime/cli.ts resume "$D"
echo "exit=$?"     # expect 2
```

Expect `RESUME REFUSED`. There is no flag that skips this.

**Record what you found, then resume:**

```sh
node live/runtime/cli.ts reconcile "$D" --decision ok \
  --note "the ledger shows one entry under the key"
node live/runtime/cli.ts resume "$D"
```

The restarted process is new — it has none of the first process's memory. It
reads the durable conversation, sees the operator's decision, and calls
`inspect_ledger` rather than paying again. Expect
`✓ ok — intent 'invoice-4021': 1 ledger entry` and a final
`status needs_evidence`.

```sh
wc -l "${TMPDIR:-/tmp}/prove-it-live/demo1/live-state/ledger.jsonl"   # still 1
```

**The harder decision is worth seeing too.** Repeat the sequence with
`--decision in_doubt`: the operator genuinely cannot tell whether the payment
landed, the agent retries on the *same* idempotency key, and the ledger still
holds one entry. That is what the key is for.

**Every stop boundary is covered by test**, not just the one above:
`before_request`, `after_request`, `after_dispatch`, `after_effect`,
`after_result`, and a torn record mid-append. See
`live/tests/runtime/recovery.test.ts`.

---

## 4. Clean up

```sh
rm -rf "${TMPDIR:-/tmp}"/prove-it-live "${TMPDIR:-/tmp}"/prove-it-live-artifacts
```

`live/artifacts/` is git-ignored and is now excluded from the course site build
(`scripts/build-course-site.sh`). Stages live under `${TMPDIR:-/tmp}/prove-it-live/`.

---

## What Phase 1 does NOT do

Stated plainly, so the scope is honest:

- **No real agent yet.** Only the smoke adapter. `live/providers/claude-cli.ts`
  and the MCP bridge are Phase 2.
- **No lesson is converted.** `scripts/demo-compare.sh` still runs the shipped
  renderer, and `--mock` is exactly what it was. There is no `--live-v2` flag
  yet — it arrives when a lesson first uses the new runtime.
- **No gate call.** The engine stops at `worker.claimed_done` /
  `needs_evidence`. Wiring `dr-gate` in as the completion authority is Phase 2.
- **No pane barriers and no lane split.** `copyPrefix()` exists and is tested,
  but nothing calls it until Phase 3.
- **The renderer is provisional.** Screen formatting lives in
  `live/runtime/cli.ts`, consuming `PresentationEvent` only. Phase 3 moves it
  into the shipped renderer; the shipped renderer is unchanged today.
- **Two catalog tools are missing.** `run_eval_case` and `run_workflow_node`
  bind to session fixtures that Phase 5 and Phase 6 convert. The other six are
  built and tested.

## Decisions still owed before Phase 2

The brief requires these recorded in the manifest and the instructor run sheet,
and they are not values an implementation should pick on its own:

- the default Claude model
- the provider effort level
- the maximum provider cost per lane
- the maximum turn count and maximum lane duration
  (Phase 1 defaults to 8 turns and 300 seconds — confirm or change)
- the provider setup command for instructors
