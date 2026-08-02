# Injected-fact cards — the S2 steering drill

Protocol: draw ONE card without reading the rest. Start your run, then read the
card's "World truth" line. Interrupt with that fact in ONE sentence — not a
paragraph, not a re-prompt. If the same premise survives two interrupts, cancel
with a reason and rebrief.

Score the interrupt, not the outcome: did one sentence name the fact, and did
it name it without re-explaining the whole task? Against the supplied smoke
fixture the run stops at your interrupt, so the sentence is what you grade.
Whether the next agent action abandons the dead branch or patches it is a tell
you can only read against a real agent, on your own task.

Cards 1-3 fit the slug-kit fixture; cards 4-6 are for real-repo transfer runs.

## Card 1 — the flaky test

- World truth: "The `long titles` test is known-flaky on CI only; it is green
  locally and must not be 'fixed'."
- Wrong premise it kills: the failing check means the implementation is wrong.
- One-sentence interrupt: "Stop — `long titles` is known-flaky on CI only; do
  not touch it, note it and continue with the ampersand case."
- Pivot to watch for: the agent stops editing for that test and names the
  remaining real failure.

## Card 2 — the environment mismatch

- World truth: "This builds fine locally; the failure is CI-environment
  specific."
- Wrong premise it kills: a package or file is missing from the repo.
- One-sentence interrupt: "DO NOT FORGET, this builds FINE locally — so this
  line of inquiry is wasting my time, no?" (the real recorded steer; see
  ../prompts/operate.md exemplar A)
- Pivot to watch for: the agent abandons the missing-package hunt entirely and
  looks at what differs in CI.

## Card 3 — the read-only fence

- World truth: "working/test/ is ground truth; any edit there is a
  stop-and-ask, never a fix."
- Wrong premise it kills: the test is wrong and should be updated to match the
  implementation.
- One-sentence interrupt: "You are editing working/test/ — that is a
  stop-and-ask condition, not a task; revert and ask."
- Pivot to watch for: revert plus a question, not a justification.

## Card 4 — the runtime behavior (real repos)

- World truth: a runtime fact the source does not show, e.g. "the watcher only
  reacts to fsnotify events; it does nothing with existing files."
- Wrong premise it kills: static reading of the code predicts runtime
  behavior.
- One-sentence interrupt: name the runtime behavior and re-scope: "That does
  nothing — it waits for fsnotify events; find the mode that scans existing
  files." (exemplar B in ../prompts/operate.md)
- Pivot to watch for: the prior multi-step plan evaporates rather than gets
  patched.

## Card 5 — the frozen interface

- World truth: "The stored event shape is a public contract consumed by
  another team; it cannot change this quarter."
- Wrong premise it kills: refactoring the event schema is in scope.
- One-sentence interrupt: "The stored event is the public contract — do not
  change its shape."
- Pivot to watch for: the plan reroutes around the schema instead of migrating
  it.

## Card 6 — the moved goalpost trap (meta-card)

- World truth: mid-run, a stakeholder says the outcome itself should change
  ("actually, slugs should keep unicode").
- This is NOT an interrupt fact. Changing the Definition of Done means pause or
  cancel, new contract version and hash, recorded approval, invalidated
  receipts (reader ch2). The correct operator move is to refuse the in-flight
  edit and say so.
- Score: the operator who "just steers" the new outcome into the run has
  silently edited an accepted contract — that is the failure this card exists
  to catch.
