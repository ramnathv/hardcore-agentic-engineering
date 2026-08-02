# Interrupt bank — one-liners keyed to the intervention ladder

Paste, do not compose: an interrupt asserts a fact or a boundary, and the
cheapest correction that works wins.

## Rung 1 — supply a missing fact

- "Stop. The legacy queue is read-only in this environment. Reread rider §Fences and repropose the plan."
- "Stop. This builds fine locally — the failure is environment-specific. Kill this line of inquiry."
- "Stop. The flaky test is `slugify long titles`, known-flaky on CI only. Do not fix it; note it and continue."

## Rung 2 — reassert a boundary

- "You are editing working/test/. That is a stop-and-ask condition, not a task. Revert and ask."
- "That path is outside working/. Nothing outside working/ is yours. Propose an alternative inside the fence."

## Rung 3 — narrow the scope

- "Drop the refactor. This run delivers exactly one green named check; nothing else changes."
- "You have one attempt left. Spend it on the failing assertion, not on new structure."

## Rung 4 — force a decision point

- "Before the next edit: state in one sentence which premise the last two failures shared."
- "Propose two candidate causes and the observation that would separate them. Do not edit yet."

## Rung 5 — cancel and rebrief (same premise failed twice)

- "Cancel. The premise 'the test is wrong' has now failed twice. New brief follows; do not carry the old plan forward."
- "Cancel. Reason: world state uncertain after the crash. We reconcile by hand, then rebrief from the approved plan."

## Anti-patterns (do not paste these)

- "Try again." — a retry without new evidence is spend, not steering.
- "Are you sure?" — invites a confident restatement, not an observation.
- Repeating the same prompt after a kill — recovery is about the state of the
  work, not the state of the conversation.
