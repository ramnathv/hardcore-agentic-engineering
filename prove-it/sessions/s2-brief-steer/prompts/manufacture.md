# S2 manufacture prompts — build M3 and M4 with your own agent

Three goal + rider pairs, in the course's own anatomy. Each pair is ONE brief
delivered in two messages: paste the goal, tell the agent to acknowledge it and
wait, then paste the rider. An agent that starts editing off the goal alone is
working against fences it has not read yet — which is the failure this session
names. Paste them into your own agent (Claude Code, Codex, …) opened at the
root of your prove-it clone; one pair per run, commit between runs. Each pair ends
with a Done when block naming the executable check. Run it yourself before
you believe the agent.

---

## P1 — Goal and rider recorded in the run manifest (M3)

### Goal (paste first)

> In this prove-it clone, extend `src/loop.ts` so a run records WHICH brief it
> was given: `open` and `run` accept `--goal <path>` and `--rider <path>`,
> store `{path, sha256}` for each in `runs/<id>/run.json` and in the
> `run.requested` event data, and refuse to open a run whose goal file exceeds
> 4,000 characters (the course `wc -m` limit), naming the actual count in the
> refusal. Both flags optional; omitted means absent from the manifest, never
> a fabricated value. Propose a plan before editing. Work only in `src/` and
> `tests/`. Stop and ask rather than change any event's existing shape.

### Rider (paste second)

#### Context

- This repo is the course harness. `control/` is host-owned: never write
  there. `src/` is worker-extendable; that is where this change lives.
- A run's identities are fixed at open: `openRun()` in `src/loop.ts` already
  pins the contract sha256 and candidate tree in `run.json`. Goal and rider
  are the missing third identity — the brief the worker was actually given.
- `sha256` of a file is one call away: `src/root.ts` exports
  `sha256(readFileSync(path))`.

#### Live evidence

- `node src/loop.ts open --run-id probe-p1`
  currently succeeds and writes a `run.json` with no goal/rider fields.
- `wc -m prompts/goal-m03.md` prints 1665 (1671 in a shell without a UTF-8
  locale) — the worked goal is under the 4,000-char course limit and is your
  test asset.

#### Focus files

- `src/loop.ts` — `opt()`, `openRun()`, and the `open`/`run` command branches.
- `src/root.ts` — `sha256` helper (import it; do not reimplement).
- `prompts/goal-m03.md`, `prompts/rider-m03.md` — real inputs for testing.

#### Deliverable

1. `--goal`/`--rider` flags on `open` and `run`: each recorded as
   `{path, sha256}` in `run.json` AND in the `run.requested` event's data.
2. A refusal (non-zero exit, message includes the actual character count and
   the 4,000 limit) when the goal file's character count exceeds 4,000.
3. A `tests/s2-manifest.test.ts` covering: refs recorded, oversized goal
   refused, omitted flags leave the manifest unchanged.

#### Fences

- Do not remove or rename any existing field or event; add only.
- Do not touch `control/`, `done/contract.yaml`, `working/`, or core tests.
- No dependencies. Character count = `.length` of the decoded UTF-8 string,
  not bytes. (`wc -m` matches only in a UTF-8 locale.)

#### Stop-when

- You are tempted to change the shape of `run.requested` rather than add keys.
- Any ambiguity about whether a flag should be mandatory — ask, don't decide.

### Done when

```sh
node src/loop.ts open --run-id m3-check \
  --goal prompts/goal-m03.md --rider prompts/rider-m03.md
node -e 'const m=require("./runs/m3-check/run.json");
  const h=x=>x&&x.path&&/^[0-9a-f]{64}$/.test(x.sha256);
  process.exit(h(m.goal)&&h(m.rider)?0:1)' && echo P1-manifest-OK
node -e 'require("fs").writeFileSync("runs/big-goal.md","x".repeat(4001))'
if node src/loop.ts open --run-id m3-big \
  --goal runs/big-goal.md --rider prompts/rider-m03.md; then echo P1-limit-FAIL
else echo P1-limit-OK; fi
rm -rf runs/m3-check runs/m3-big runs/big-goal.md   # this block's scratch runs
npm test
```

Expected: `P1-manifest-OK`, `P1-limit-OK`, test suite green.

---

## P2 — Plan approval becomes a real operator decision (M4)

### Goal (paste first)

> Replace prove-it's auto-approve with a real approval step. In this clone,
> change `src/loop.ts` so `run` records `plan.proposed` and then STOPS —
> printing the plan and exiting 0 — without starting any turn. Add two
> commands: `approve <run-id>` appends `plan.approved` (actor `operator`) and
> then executes the turns; `reject <run-id> --fact "..."` appends
> `plan.rejected` carrying the fact and stops, leaving the run open so a later
> `approve` can still start it. No turn may ever start before an approval
> event exists in the log. Propose a plan before editing; work in `src/` and
> `tests/`, plus the two callers in `scripts/` that a stopping `run` breaks
> (`tamper-table.sh`, `green-check.sh` — they need an `approve` line, and the
> suite will not go green until they have one); keep every existing event
> shape unchanged.

### Rider (paste second)

#### Context

- The starter confesses its own shortcut in `src/loop.ts` (the `run` branch):
  `plan.approved` is appended by the harness with
  `mode: 'auto-approved in the starter; M4 makes this a real decision'`.
  Delete that shortcut; this brief is that "real decision".
- The canonical event sequence you are enabling is
  `fixtures/events/steering.jsonl`: proposed → rejected(fact) → … →
  proposed → approved → turns. Your reducer already counts `plan.approved`
  into `planVersion` (`src/runview.ts`); `plan.rejected` is deliberately not
  counted — do not "fix" that.
- A rejection carries a FACT (ground truth the worker lacked), not an opinion.
  Make `--fact` mandatory, exactly like `cancel --reason`.

#### Live evidence

- `node src/loop.ts run --provider smoke --run-id probe-p2`
  currently runs all turns immediately — auto-approval in action.
- `grep -n "auto-approved" src/loop.ts` shows the exact line to retire.

#### Focus files

- `src/loop.ts` — the `run` branch, `runTurns()`, the command dispatcher.
- `src/runview.ts` — read-only reference for what the reducer expects.
- `fixtures/events/steering.jsonl` — the target event grammar.

#### Deliverable

1. `run` stops after `plan.proposed` (exit 0, no `turn.started` in the log);
   it prints the proposed plan and the approve/reject commands.
2. `approve <id>` — appends `plan.approved` with actor `operator`, then runs
   turns; refused with a clear message if the run already has turns or is
   cancelled/completed. `reject <id> --fact "..."` — appends `plan.rejected`
   `{fact}`; `--fact` mandatory; run stays open.
3. `tests/s2-approval.test.ts`: no-turn-before-approval invariant, reject
   requires a fact, approve-after-reject starts turns.

#### Fences

- Do not modify `src/runview.ts`, `src/events.ts`, or any event's existing
  shape; new event data keys only.
- Do not touch `control/`, `done/contract.yaml`, `working/`.
- `resume`, `cancel`, `view`, `complete` must keep working unchanged —
  `npm test` is the regression net.

#### Stop-when

- The change seems to require editing the reducer — stop, that means your
  event grammar drifted.
- Two failed attempts at the same wiring — stop and report the premise you
  now doubt.

### Done when

```sh
node src/loop.ts run --provider smoke --run-id m4-appr
node -e 'const L=require("fs").readFileSync("runs/m4-appr/events.jsonl","utf8")
  .trim().split("\n").map(JSON.parse);
  process.exit(L.some(e=>e.type==="plan.proposed")&&!L.some(e=>e.type==="turn.started")?0:1)' \
  && echo P2-stops-OK
node src/loop.ts approve m4-appr
node -e 'const L=require("fs").readFileSync("runs/m4-appr/events.jsonl","utf8")
  .trim().split("\n").map(JSON.parse);
  const a=L.findIndex(e=>e.type==="plan.approved"&&e.actor==="operator");
  const t=L.findIndex(e=>e.type==="turn.started");
  process.exit(a>=0&&t>a?0:1)' && echo P2-order-OK
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs   # the smoke run dirtied working/; restore red
rm -rf runs/m4-appr
npm test
```

Expected: `P2-stops-OK`, `P2-order-OK` (and the run ends `needs_evidence` —
the gate still decides), test suite green.

---

## P3 — A live interrupt command with a required fact (M4)

### Goal (paste first)

> Give the operator a real interrupt. In this clone, add
> `interrupt <run-id> --fact "..."` to `src/loop.ts`: it writes the fact to a
> flag file `runs/<id>/INTERRUPT` and exits — it must NOT append to the event
> log (one writer per log). The run loop checks for that flag at each tool
> boundary; when present it appends `run.interrupted` `{fact}` with actor
> `operator`, deletes the flag, and stops exactly as `--interrupt-after`
> does today. Also add `--turn-delay-ms N` (default 0) to whichever command runs
> the turns — after P2 that is `approve`, not `run` — and to `resume`, so a
> human can catch a smoke run from a second terminal. `--fact` is
> mandatory. Propose a plan first; `src/` and `tests/` only; existing event
> shapes unchanged.

### Rider (paste second)

#### Context

- `--interrupt-after N` already exists in `runTurns()` — your flag-file check
  is a second trigger for the same exit path; reuse it, do not fork it.
- Why a flag file and not a second log writer: `EventLog` appends from the
  run process; a concurrent writer risks interleaved records. The interrupt
  command talks to the run process through the filesystem; the run process
  remains the log's only author.
- An interrupt asserts a fact (see `sessions/s2-brief-steer/prompts/operate.md`).
  The event must carry it so the resumed worker can read WHY it was stopped.

#### Live evidence

- `node src/loop.ts run --provider smoke --run-id probe-p3`
  finishes in under a second — hence `--turn-delay-ms`, or no human can ever
  win the race.
- `src/runview.ts` already maps `run.interrupted` → status `interrupted` and
  `resume` already handles that status; you add no reducer code.

#### Focus files

- `src/loop.ts` — `runTurns()` (tool-boundary loop and the existing
  `interruptAfter` exit), the command dispatcher, `opt()`.
- `src/runview.ts`, `src/events.ts` — read-only references.

#### Deliverable

1. `interrupt <id> --fact "..."`: writes `runs/<id>/INTERRUPT`; refuses
   without `--fact`; never touches `events.jsonl` itself.
2. Flag check at each tool boundary in `runTurns()`: append
   `run.interrupted` `{fact}` (actor `operator`), delete the flag, stop.
   Plus `--turn-delay-ms N` on the turn-running command (`approve` after P2)
   and `resume` (default 0 — tests stay fast).
3. `tests/s2-interrupt.test.ts`: pre-planting `runs/<id>/INTERRUPT` before
   `run` yields an interrupted run whose `run.interrupted` event carries the
   fact — deterministic, no sleeps in the test.

#### Fences

- The interrupt command must not append events, kill processes, or edit
  anything outside `runs/<id>/INTERRUPT`.
- No new statuses in `RunView`; no changes to `src/runview.ts`.
- Do not touch `control/`, `done/contract.yaml`, `working/`.

#### Stop-when

- You want signals/IPC instead of the flag file — stop and ask; the file is
  the spec.
- The test needs a `sleep` to pass — stop; plant the flag before the run
  starts instead.

### Done when

```sh
node src/loop.ts run --provider smoke --run-id m4-int
# P2 made run stop at plan.proposed, so the turns start under approve:
node src/loop.ts approve m4-int --turn-delay-ms 1500 &
sleep 2
node src/loop.ts interrupt m4-int \
  --fact "the legacy queue is read-only in this environment"
wait
node -e 'const L=require("fs").readFileSync("runs/m4-int/events.jsonl","utf8")
  .trim().split("\n").map(JSON.parse);
  const i=L.find(e=>e.type==="run.interrupted");
  process.exit(i&&i.actor==="operator"&&/read-only/.test(i.data.fact||"")?0:1)' \
  && echo P3-fact-OK
node src/loop.ts resume m4-int   # continues to needs_evidence
cp control/checks/fixtures/solution-stub.mjs working/src/slugify.mjs   # the smoke run dirtied working/; restore red
rm -rf runs/m4-int
npm test
```

Expected: the background run stops mid-flight, `P3-fact-OK`, resume completes
the remaining turns, test suite green. (The `sleep` lives in this manual
check only; your node:test uses the pre-planted flag.)

---

## After all three

Close the milestone the only way the course closes anything:

```sh
node src/loop.ts run --provider smoke --run-id m3m4-close \
  --goal prompts/goal-m03.md --rider prompts/rider-m03.md
node src/loop.ts approve m3m4-close
node control/dr-gate.ts check m3m4-close
node src/loop.ts complete m3m4-close
```

Record the receipt path and the goal/rider shas in FIELD-NOTES.md; the Brief row of PROOF.md takes one link.
