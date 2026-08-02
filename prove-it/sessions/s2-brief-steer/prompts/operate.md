# S2 operating prompts — bet, interrupt, reject, rebrief

The S2 session set; the everyday kit is core `prompts/interrupts.md`. Paste,
do not compose: mid-run is the wrong time to write prose, and the smallest
control that matches the problem wins (the ladder, reader ch2).

## The bet card (fill in before the run starts)

```text
First action I expect:        ______________________________
Earliest signal I'd interrupt on: __________________________
The fact only I know:         ______________________________
Cancel trigger:               same premise fails twice
```

Thirty seconds before the run; keep the filled card as evidence for the S2
close.

## Two real steers, annotated (read these before you improvise)

### Exemplar A — one sentence kills a search branch (ladder rung 1)

Recorded January 2026. The agent was three calls deep hunting a phantom
missing-package error while CI was red. The operator typed:

> "DO NOT FORGET, this builds FINE locally. So this line of inquiry is
> wasting my time, no?"

The agent pivoted in the next breath: "The user is right, this builds fine
locally. The issue is specifically about CI not finding them, not about the
packages being missing."

One sentence asserting ground truth the model could not read off the source,
and the whole branch dies with the premise. (Book pattern 05, Interrupt Is
the Keyboard.)

### Exemplar B — four sentences, four jobs (ladder rungs 1 and 3 fused)

Recorded February 2026, after the agent wrote a confident four-step test plan
for `intent init` against existing files:

> "no, that does nothing. Intent doesn't DO anything with existing files. It
> waits for fsnotify events. Don't be dense. There's a special mode to get it
> to look at existing files. I need you to find what it is."

Four jobs in four sentences: reject the output, replace the mental model,
vent, re-scope the task; only the vent is optional, and the tell that it
landed is the agent abandoning its plan rather than patching it. (Book
pattern 06, Assert Ground Truth.)

## Ten one-liners, keyed to the ladder

Rung 1 — supply a missing fact:

1. "Stop. This builds fine locally — the failure is environment-specific.
   Kill this line of inquiry." (exemplar A, house form)
2. "Stop. That does nothing with existing files at runtime — it waits for
   fsnotify events. Find the mode that scans existing files." (exemplar B,
   vent removed)
3. "Stop. The `long titles` test is known-flaky on CI only. Do not fix it;
   note it and continue."

Rung 2 — point to a known-good reference:

4. "Stop. Copy the shape of `working/src/slugify.mjs` at the last green
   commit; the one intentional difference is the ampersand rule. Nothing else
   changes."

Rung 3 — reject the plan, ask for a revision:

5. "Plan rejected — fact: the legacy queue is read-only in this environment.
   Repropose using the outbox table." (the steering-fixture rejection)
6. "Plan rejected — the stored event is a public contract; its shape cannot
   change. Repropose without the schema migration."

Rung 4 — interrupt the current action:

7. "Interrupt. You are editing working/test/ — that is a stop-and-ask
   condition, not a task. Revert and ask."
8. "Interrupt. Before the next edit: state in one sentence which premise the
   last two failures shared."

Rung 5 — cancel the run:

9. "Cancel — reason: the premise 'the test is wrong' has failed twice.
   Rebrief follows; do not carry the old plan forward."

Rung 6 — rewrite the brief or contract:

10. "This isn't a steer; the Definition of Done itself is wrong. Pausing the
    run: new contract version, new hash, recorded approval, old receipts
    invalid. Nobody edits an accepted contract silently."

In prove-it, rung 4 is `loop interrupt <id> --fact "..."` once your P3 lands
(until then, `--interrupt-after N`), rung 5 is
`loop cancel <id> --reason "..."` — the reason is mandatory and that is the
point.

## Plan-rejection lines (M4 lab, with your P2 `reject` command)

A rejection carries ground truth, not taste; `--fact` forces the discipline.

```sh
# "loop" below = node src/loop.ts
loop reject <id> --fact "the legacy queue is read-only in this environment"
loop reject <id> --fact "working/test/ is ground truth; the plan edits it"
loop reject <id> --fact "the plan adds a dependency; the contract says node builtins only"
```

Anti-form to catch in your own log: `--fact "I don't like this approach"` is
an opinion wearing a flag; reject the rejection.

## Cancel-and-rebrief (same premise failed twice)

1. `loop cancel <id> --reason "premise X failed twice: <one sentence>"`
2. Fix the brief, not the chat: move the killed premise into the rider's
   Fences or Stop-when so no future run rediscovers it.
3. Open a fresh run from the revised pair. The rebrief paragraph asserts
   ground truth and current state — never re-sends the old prompt.

Template:

> Previous run canceled: the premise "____" failed twice (events e-__, e-__).
> Ground truth: ____. The plan of record is unchanged through phase __. Start
> at phase __ with that fact as your first observation. Do not revisit ____.

For the crash variant (kill between dispatch and record), use the core script
`prompts/rebrief-after-kill.md` — inspect, decide, reconcile, then rebrief.

## Fact-injection protocol (drill, about 10 minutes, on your own)

1. Draw a card from `../fixtures/injected-facts.md` without reading the rest.
2. Start the run and fill the bet card.
3. Mid-run, read the card's "World truth" line.
4. Interrupt with the fact in one sentence (bank above).
5. Score the sentence: did it name the fact without re-explaining the task?
   Against a real agent, also read whether the next action abandons the dead
   branch or patches it — abandon means the steer landed.
6. Same premise survives twice → cancel with a reason and rebrief.
   Card 6 is the trap card: if the "fact" changes the Definition of Done,
   the only correct move is rung 6 — pause, new contract version, new hash.

## Anti-patterns (short form; full list in core `prompts/interrupts.md`)

- "Try again." — spend, not steering.
- "Are you sure?" — invites a confident restatement, not an observation.
- A paragraph where a sentence would do — long explanations hide which fact
  matters.
- Re-pasting the original prompt after a kill — recovery is about the state
  of the work, not the state of the conversation.
