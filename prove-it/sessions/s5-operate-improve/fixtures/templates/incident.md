# Incident — <one-line name>

<!-- Write it as it unfolded, not as it looks in hindsight. Do not rewrite
     the incident as if the answer was obvious from the start — the rejected
     hypothesis is the most valuable line in this file, and handoff-check.sh
     fails an incident that lacks one. -->

## Observed failure

<!-- What was seen, verbatim where possible: the refusal line, the failing
     assertion, the wrong output. Not the diagnosis. -->

## Impact

<!-- Who/what was affected, and for how long. "One lab run, 20 minutes" is a
     fine answer. -->

## Timeline / event slice

<!-- The relevant slice of events.jsonl by id range, with the run path. Link,
     don't paste the whole trace. -->

## Boundary that was not visible

<!-- The seam the failure crossed that nobody was watching. -->

## Hypotheses tested

<!-- All of them, in order, each with the observation that supported or
     killed it. -->

1.

## Rejected hypothesis

<!-- REQUIRED. The hypothesis you believed, the evidence that killed it, and
     the trace/event ids of that evidence. This is what saves the next
     person from retrying your dead end. -->

## Cause or current uncertainty

<!-- The cause if proven; otherwise the precise thing still unknown. "Unknown,
     bounded by X" beats a confident guess. -->

## Corrective action

<!-- What changed: instruction, tool, policy, check, or nothing-yet. One
     critical change at a time, or attribution is guesswork. -->

## Regression case

<!-- Path to the eval case this incident became (fixtures/eval/cases/NN-*.yaml)
     and the path to the PRESERVED failed trace. The trace outlives the fix. -->
