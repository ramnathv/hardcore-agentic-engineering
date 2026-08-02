# Residual-risk note — <run-id> / <check-version>

<!-- S4 live-evidence close + M8 deliverable. One page maximum. A receipt
     records what WAS checked; this note records what was NOT. Copy this file
     next to the run (runs/<run-id>/residual-risk.md) and fill every field —
     "none" is a claim and needs a sentence of justification like any other. -->

- Run / receipt: `<run-id>`, issued under `<check-version>`, candidate `<tree:… first 12>`
- Attack demonstrated: <one line: the exact tamper/replay/fault attempted>
- Observed result: <verbatim refusal line, or "bypass succeeded" + what you changed>
- New red case: <the test/check added, and the commit or file that carries it>

## What the current checks still cannot catch

<!-- Name concrete wrong results that would survive the portfolio today.
     "Unicode titles", "concurrent writes", "the check target list itself" are
     the right shape; "edge cases" is not. 1–3 items. -->

1.
2.

## Who accepts this risk

- Human owner of the release decision: <name>
- Decision: <accepted as-is | accepted with follow-up | blocked>
- Follow-up (if any) and where it is tracked:
