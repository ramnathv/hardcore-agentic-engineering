# The challenge: build your own harness

Build your own harness — contract, gate, receipt — with everything this
course teaches you about what each piece must refuse. This is the graduation
track, and you can start it at any time.

Nothing here is required. It is not a Project, it is not graded, and it does
not appear on Demo Day. It exists because some people
want a mountain. This is the mountain, with the route marked.

The reference points are two sizes of the same design. prove-it taught the
disciplines with a 163-line gate. [DeadReckon](https://deadreckon.sh) is the
production version: the same `events.jsonl` filename, the same
contract → gate → receipt spine, and a `dr-gate` of 692 lines inside about
260,000 lines of Rust. The ladder between those two numbers is this page.

## Why build one

The course shows you what a harness must refuse. In Session 1 you will forge
a receipt and watch the gate refuse it. In Session 4 you will weaken a check
and make it go red again.

A gate is worth exactly what it refuses. Build one sized for your machine,
your agent CLI, and your own work.

## The ladder

Each rung has a label. **deepen** means the course teaches the concept and
you build it for real. **new** means the course does not cover it.

Every "done when you can demo" line is a refusal your harness performs on
screen. You show it. You do not assert it.

### Tier 1 — rebuild what the course taught you (a weekend) — all *deepen*

Build your own contract, gate, `events.jsonl`, and smoke provider.

Start with the smoke provider. In DeadReckon it is 175 lines, and it is the
best return on effort in the system. A fake provider makes your whole harness
testable with no API key — the same move `--provider smoke` makes in this
course.

**Done when you can demo:**

- [ ] Your gate refuses a receipt it did not sign, with a named reason
- [ ] Your gate refuses a contract edited after the run opened
- [ ] A run with a green check completes, and the same run with no receipt is
      refused completion — end to end on your smoke provider, offline and
      keyless

### Tier 2 — four small upgrades

**(a) The two-phase gate** — *deepen*. Split the gate in two: an evaluator
that holds no key, and a signer that starts no child processes. Then the code
under judgment can never touch the signing key. This is the most important
structural change on the ladder, and it is about 150 lines.

**(b) Strict contract admission** — *deepen*. About 25 lines that refuse a
bad contract before any run exists. A contract with no required checks:
refused. A contract whose only proof is that its working directory exists:
refused.

**(c) A typed outcome table** — *new*. DeadReckon pairs 8 outcomes with 16
stop reasons in one small function that says which pairs are legal. This is a
day of work. After it, your harness never again parses meaning out of
free-form failure text.

**(d) Two logs, not one** — *deepen*. `events.jsonl` records what the agent
did. A second append-only log records what the harness decided. A reducer
folds that second log into a state file you can delete and rebuild — which is
why you can trust it.

**Done when you can demo:**

- [ ] The evaluator holds no key, and the signer starts no child processes
- [ ] A contract with no required checks is refused before any run exists
- [ ] An illegal outcome pair cannot be recorded — the types refuse it
- [ ] Delete the state file, replay the log, and the rebuilt state matches

### Tier 3 — the hard walls

**(e) The fenced lease** — *new*. Each launch gets a number that only
increases, plus the boot id and the process id. An event from a stale launch
is refused. Without this, a crash or a double launch corrupts your log.

**(f) Reconciliation that fails closed** — *deepen*. If your harness cannot
prove that every process it started is gone, it does not record a clean stop.
It records `LostContainment`. The honest bad answer beats the comfortable
false one.

**(g) One real sandbox** — *new*. Seatbelt on macOS, or bubblewrap on Linux.
One rule makes it matter: a result produced outside the sandbox can never
become a verified receipt.

**(h) The second key** — *new*. After the checks pass, a fresh model call
reads the evidence and answers: achieved, revise, or uncertain. Three rules
keep a judge safe. A failed check never calls the judge. The judge can never
overrule a failed check. An uncertain verdict is recorded as `NEEDS_REVIEW`,
never as a pass. DeadReckon also caps what the judge reads: a 64KB contract,
a 256KB diff, and a 4,000-character summary.

**Done when you can demo:**

- [ ] After `kill -9` and a relaunch, an event from the stale launch is refused
- [ ] A stop you cannot prove clean is recorded `LostContainment`, never success
- [ ] A result from outside the sandbox is refused a verified receipt
- [ ] Your judge cannot flip a failed check, and its "not sure" is recorded as
      `NEEDS_REVIEW`

## The stop line

Build the join the course shows you in Session 6 — receipts in, five
questions, pass or a named refusal. Then stop on purpose.

The join concept is about 200 lines. The crash-safe, concurrent version is
`graph_job.rs`: 11,661 lines, the largest file in DeadReckon. The first
discipline of this course applies to the challenge too: define done before
you start. The join that reads receipts is done. The join that survives
anything is a different project — take it on deliberately or not at all.

## Three honest warnings

These come from DeadReckon's own code and its own map.

1. **The join is the expensive part.** The join merges the verified work of
   several agents into one result. The simple version is small — read each
   receipt, ask the five questions, pass or refuse — about 200 lines. The
   hard version answers questions the simple one ignores: what if the machine
   crashes in the middle of the merge? What if two joins run at once? What if
   a child's files change after the join read its receipt? In DeadReckon, the
   code that answers those questions is 11,661 lines — the largest file in
   the system. Decide in advance which version you are building.
2. **Checking code is bigger than the code it checks.** Writing a receipt is
   easy: record 30 facts. Checking that receipt later means proving each fact
   is still true, against every way a file system can lie. Is the file now a
   symlink? Did its permissions change? Did git rewrite its line endings on
   checkout? In DeadReckon, the code that checks the 30-field receipt is
   about 760 lines, and each line handles one plain case like these. Plan
   three to five times more code for checking than for the thing you check.
   None of it feels clever, and it is most of the product.
3. **Surviving a crash is the hardest problem here.** A crash can land
   between any two lines of your code. You will meet the small version in
   Session 3: the crash that lands between sending a payment and recording
   it. A harness meets that same problem at every step — did the agent
   finish? Is an orphaned process still writing? Does the restart resume the
   run exactly once, not zero times and not twice? The DeadReckon authors
   wrote 132 planning documents for this across hundreds of commits, and
   their own map says most of the live crash drills have not run yet. Do not
   expect to get it right on the first try. Nobody has.

## Start from

- **Your prove-it clone** is the reference implementation: the 163-line gate,
  the smoke provider, the tamper table, the probe. Everything in Tier 1 has a
  working sibling here to diff against.
- **[PORT.md](PORT.md)** is proof that the gate design generalizes: the same
  contract and the same refusals, judging a repo you care about. Your
  harness's first real task can be the task you port there.

If you build one, post it in Maven `#general` — never required, always read.
The people who built the harnesses in this course started exactly where you
are standing now.
