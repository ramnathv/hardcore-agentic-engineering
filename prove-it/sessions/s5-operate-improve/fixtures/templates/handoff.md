# Hand-off — run <run-id>

<!-- The hand-off is an INDEX of evidence, not a retelling of the transcript.
     Every line a memoryless reader might doubt links to something they can
     open or rerun. The transcript stays in the audit archive; it is not the
     next worker's context.
     Structure is checkable: bash sessions/s5-operate-improve/fixtures/checks/handoff-check.sh <dir>
     Semantic accuracy is not: that requires the fresh-reader test. -->

```yaml
run_id:                # runs/<id>/
contract_path:         # e.g. done/contract.yaml
contract_sha256:       # from runs/<id>/run.json — fixed BEFORE the run
goal_ref:              # path to the goal used, or "none"
rider_ref:             # path to the rider used, or "none"
provider:              # smoke | claude-cli | codex-cli | ...
harness_version:       # git commit of the harness at run time
candidate_start:       # tree:... from run.json
candidate_end:         # tree:... at last check (or "unchanged")
status:                # completed | cancelled | needs_evidence | needs_reconcile
receipt:               # control/receipts/<id>.json, or the exact refusal line
trace:                 # runs/<id>/events.jsonl
evidence:              # retained check outputs, probe reports — paths, one per line
budget_remaining:      # attempts / minutes left when the run ended
proof_still_required:  # what the receipt does NOT prove; "none" is rarely true
human_decision:        # PENDING (a person signs this; an agent may not)
decided_by:            # name, or PENDING
```

## Decisions that constrain the next action

<!-- 3 bullets max. Only decisions a fresh worker must not re-litigate. -->

-

## Dead ends — do not retry

<!-- Each entry: what was tried, the evidence it failed, link into the trace. -->

-

## Where to start reading

<!-- One path into the code/artifacts, not a summary of them. -->

-
