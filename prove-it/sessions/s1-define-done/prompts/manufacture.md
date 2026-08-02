# S1 manufacture prompts: agent-build this session's components

Two goal + rider pairs. Paste the goal as the agent's task, the rider
immediately after. Both artifacts land under `sessions/s1-define-done/bin/`
(create it); an agent proposing to touch `src/`, `control/`, `done/` or
`working/` is your first live interrupt (`operate.md` §4). Each pair is done
when its Done-when commands pass on your machine, not when the agent says so.

---

## Pair 1: `contract-lint.mjs`

Judges a Done Contract before it is frozen; done when the 3 commands under
its Done-when behave as stated.

### Goal (paste first)

Build `sessions/s1-define-done/bin/contract-lint.mjs`: a zero-dependency
Node script that judges a Done Contract file *before* it is frozen.

Usage: `node sessions/s1-define-done/bin/contract-lint.mjs <contract.yaml>`.

Behavior:

- **REFUSE** (exit 1, lines starting `REFUSE:`) when any of the eight schema
  keys is missing (`outcome, checks, runtime_observation, must_change,
  must_not_change, budgets, stop_and_ask, release_owner`), when no check has
  a `command:`, or when a check command contains a suppression pattern
  (`|| true`, `--no-verify`, `--exit-zero`, `--passWithNoTests`, or trailing
  `exit 0`).
- **WARN** (exit 0, lines starting `WARN:`) on authoring smells that a
  schema check cannot refuse: a `||` fallback in a check command that is not
  in the refuse list; `budgets.attempts` > 10 or `budgets.elapsed_minutes`
  > 120; a `runtime_observation` entry with no observable anchor (contains
  none of `node`, `npm`, `bash`, `curl`, `http`, `prints`, `exits`).
- On exit 0, the **last line** is `sha256 <hex of the file bytes>` — the
  freeze hash, same value as `shasum -a 256`.

Posture: bounded run. Propose a plan first. Only create files under
`sessions/s1-define-done/bin/`. Stop and ask rather than widening scope.

Done when all three commands below behave as stated.

### Rider (paste second)

#### Context

- Repo: `prove-it`, the course harness. `control/` is host-owned; you write
  nothing there. `done/contract.yaml` is the operator contract — read it,
  never edit it. The schema is the one in `src/contract.ts` (`Contract`
  interface) and the eight-key loop in `control/checks/bootstrap-check.sh`
  lines 12–14; match them exactly, do not invent keys.
- The refuse-list must match the gate's own list: `SUPPRESS` in
  `control/dr-gate.ts` line 14, plus its trailing-`exit 0` regex. If lint
  and gate disagree, the gate wins and the lint is wrong.

#### Live evidence

- `node control/dr-gate.ts check <run>` refuses
  `|| true` with `suppressed check: …` — your REFUSE tier mirrors that.
- `sessions/s1-define-done/fixtures/weak-contract.yaml` is schema-complete
  but must produce at least 3 WARN lines (the `|| echo done anyway`
  fallback, the 99/480 budgets, the unobservable "looks right" observation).
- `shasum -a 256 done/contract.yaml` is the reference value for your
  `sha256` line.

#### Focus files

- `src/contract.ts` — the schema, authoritative.
- `control/dr-gate.ts` — the suppression list, authoritative.
- `sessions/s1-define-done/fixtures/weak-contract.yaml` — WARN test bed.

#### Deliverable (max 3 items)

1. `sessions/s1-define-done/bin/contract-lint.mjs` — plain `.mjs`, node
   built-ins only, no YAML library (line/regex parsing in the style of
   `src/contract.ts` is enough for this schema).
2. A `--help` text of ≤10 lines stating the two tiers and exit codes.
3. Nothing else — no tests directory, no package.json edits, no config.

#### Fences

- New files only, and only under `sessions/s1-define-done/bin/`.
- Do not import from `src/` (the lint must survive student rewrites of
  `src/`, same reason the gate imports nothing from there).
- Do not "improve" the schema, the fixtures, or the gate.

#### Stop-when

- The schema in `src/contract.ts` seems to disagree with
  `bootstrap-check.sh` — stop and report, do not pick a side silently.
- You want a dependency or a second file.
- Any check below fails twice for the same reason.

#### Done when (run these yourself)

```sh
node sessions/s1-define-done/bin/contract-lint.mjs done/contract.yaml
# exit 0; last line matches: shasum -a 256 done/contract.yaml

grep -v '^release_owner:' done/contract.yaml > /tmp/missing-key.yaml
node sessions/s1-define-done/bin/contract-lint.mjs /tmp/missing-key.yaml
# exit 1; prints: REFUSE: missing key: release_owner

node sessions/s1-define-done/bin/contract-lint.mjs sessions/s1-define-done/fixtures/weak-contract.yaml
# exit 0; at least 3 WARN: lines
```

---

## Pair 2: `pin-contract.mjs`

The contract-pinning step you carry to a real repository (homework part B);
done when the 4-command sequence under its Done-when behaves as stated.

### Goal (paste first)

Build `sessions/s1-define-done/bin/pin-contract.mjs`: a zero-dependency Node
script that fixes a contract's identity before a run and detects drift after.

Usage:

- `node …/pin-contract.mjs pin <contract-file> --run-id <id>` — writes
  `.pins/<id>.json` in the current directory containing: `run_id`,
  `contract_path`, `contract_sha256` (sha256 of the file bytes),
  `candidate` (output of `git rev-parse HEAD` when inside a git repo, else
  the literal string `no-git`), `pinned_at` (ISO timestamp). Refuses (exit
  1) if the pin file already exists — a pin is written once.
- `node …/pin-contract.mjs verify --run-id <id>` — recomputes the contract
  sha256 from `contract_path`; exit 0 printing `PIN OK <run_id>
  sha256=<hex>` on match; exit 1 printing both pinned and current sha on
  mismatch, prefixed `PIN STALE:`.

Posture: bounded run. Plan first. New files only, under
`sessions/s1-define-done/bin/`; `.pins/` is created at runtime by the tool.

Done when the four-command sequence below behaves as stated.

### Rider (paste second)

#### Context

- This mirrors what `src/loop.ts openRun()` does inside prove-it (pins
  `contract_sha256` in `runs/<id>/run.json` before any turn) — read it for
  the shape, but the tool must not import it or anything from `src/`: it
  will be copied alone into arbitrary repos.
- The point of `candidate`: a contract binds to *a specific tree*. In a git
  repo, HEAD is the cheap honest identity. `no-git` is an honest label, not
  a failure — never fake an identity you cannot observe.

#### Live evidence

- `node src/loop.ts open --run-id pin-demo`
  then `cat runs/pin-demo/run.json` shows the fields prove-it pins; your
  pin file is the portable subset.
- `git rev-parse HEAD` prints a 40-hex commit in this repo.

#### Focus files

- `src/loop.ts` (`openRun`) — shape reference only.
- `done/contract.yaml` — the file you will pin in the Done-when check.

#### Deliverable (max 3 items)

1. `sessions/s1-define-done/bin/pin-contract.mjs` — single file, node
   built-ins only (`node:crypto`, `node:fs`, `node:child_process` for git).
2. A `--help` of ≤10 lines showing both commands.
3. Nothing else.

#### Fences

- New files only, under `sessions/s1-define-done/bin/`. `.pins/` entries are
  runtime output, not committed artifacts.
- No imports from `src/`; no dependencies; must run on bare Node 20+.
- Do not touch `runs/`, `control/`, `done/`.

#### Stop-when

- You are tempted to add `unpin`/`--force` (deleting a pin is a human `rm`
  with a reason, not a tool feature).
- Any ambiguity about what `candidate` should be outside git — ask, don't
  invent.

#### Done when (run these yourself, from the prove-it root)

```sh
node sessions/s1-define-done/bin/pin-contract.mjs pin done/contract.yaml --run-id hw
# exit 0; .pins/hw.json exists with the five fields

node sessions/s1-define-done/bin/pin-contract.mjs verify --run-id hw
# exit 0; prints: PIN OK hw sha256=<same value as shasum -a 256 done/contract.yaml>

cp done/contract.yaml /tmp/s1-contract-keep.yaml   # your contract — keep it
printf '\n# drift\n' >> done/contract.yaml
node sessions/s1-define-done/bin/pin-contract.mjs verify --run-id hw
# exit 1; prints PIN STALE: with pinned and current sha

cp /tmp/s1-contract-keep.yaml done/contract.yaml && rm -rf .pins
```

---

## After each pair

Record in `FIELD-NOTES.md` what the agent got wrong on the first pass and
which Done-when line caught it. If nothing caught anything, your Done-when
was too weak.
