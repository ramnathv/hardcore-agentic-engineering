# Before/after — one harness change

<!-- One change, one table. If you changed two things, attribution is
     guesswork — split it into two tables and two reruns.
     Structure is checkable: bash sessions/s5-operate-improve/fixtures/checks/before-after-check.sh <file> -->

Change: <one sentence: the single instruction/tool/policy/check/topology change, with the file and line>
Hypothesis: <what the change should fix, stated before rerunning anything>
Target case: <fixtures/eval/cases/NN-*.yaml — the case this change is for>
Holdout: <at least one unaffected case NOT used while tuning the change>

| Case | Grader | Baseline | After | Trajectory notes |
|---|---|---|---|---|
| NN-target-case | deterministic | fail | ? | |
| MM-holdout-case | deterministic | pass | ? | |

Rerun commands (from the repo root, throwaway copy):

```sh

```

Decision: <promote | reject | revise> — <one sentence of reasoning>
Decided by: <a person's name — the system proposes, a human promotes>
Kept evidence: <paths to the preserved traces for both baseline and after runs>
