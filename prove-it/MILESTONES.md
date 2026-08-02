# Build the optional engineering track

M1–M12 show how to extend the course harness. They are not the course progress
system.

> [!IMPORTANT]
> The Maven week pages contain all required work. Nothing on this page is
> graded, dated, or required for a later session, Project, or Demo Day.

## On this page

- [Projects and milestones](#projects-and-milestones)
- [How the track works](#how-the-track-works)
- [The 12 milestones](#the-12-milestones)
- [How the artifacts change](#how-the-artifacts-change)
- [Authority stays outside the agent](#authority-stays-outside-the-agent)
- [Full engineering evidence](#full-engineering-evidence)

## Projects and milestones

Projects show that you can use a course idea in real work. Milestones show
that you can build the mechanism into the course harness.

The required Projects are:

- Project 1: define and brief
- Project 2: operate and verify
- Project 3: improve and defend

The optional engineering track has two milestones for each live session.
Session guides introduce the plain idea first. Their Go deeper sections link
to the matching milestones.

Completing a session demonstration does not complete a milestone. A milestone
is complete only when every extension in its row has evidence.

## How the track works

`prove-it` is a small TypeScript harness. It runs an agent, records events, and
asks an independent gate to check the result.

The starter supplies the shared mechanism. The optional track asks you to
extend or attack it.

If you attempt a milestone:

1. Lock the Done Contract before the run starts.
2. Record the contract and checked code identities.
3. Build the extension.
4. Run the named checks.
5. Ask `dr-gate` for a receipt.
6. Record a truthful refusal if the gate does not accept the work.

A **Done Contract** states the result, limits, and checks for one task.

A **receipt** is the signed record that the gate creates for one exact run,
contract, check version, and checked code snapshot.

An **attack** changes the evidence path on purpose. The attack proves that the
gate refuses false, copied, or old evidence.

## The 12 milestones

### S1: contracts and the gate

| Milestone | Plain purpose | The starter supplies | Optional extension | Evidence that closes it |
|---|---|---|---|---|
| **M1** | Write, attack, and revise the result and checks before the agent starts. | `done/contract.yaml`, `loop open`, contract hashing, and checked-code hashing. | Write a fixture contract in your own words. Attack one loophole. Revise and lock the file before the run. | The contract, both hashes, the attack, the revision, and a matching receipt. |
| **M2** | Prove that the course setup and gate work on your computer. | `control/bootstrap-contract.yaml`, `bootstrap-check.sh`, the gate, and the forged-receipt fixture. | Run the bootstrap path. Attempt the forged `accepted.json` receipt. | The bootstrap `VERIFIED` line and the forged-receipt refusal. |

### S2: briefs and corrections

| Milestone | Plain purpose | The starter supplies | Optional extension | Evidence that closes it |
|---|---|---|---|---|
| **M3** | Start a fresh agent from a short goal and a detailed rider. | The worked goal and rider, plus the 4,000-character goal limit. | Write your own pair. Record both file references in `run.json`. Start a fresh agent from only those files. | The files, `wc -m`, manifest references, and the first fresh-agent action. |
| **M4** | Record plan decisions, interruptions, resumptions, cancellations, and their reasons. | The event vocabulary, `--interrupt-after`, `resume`, `cancel --reason`, and a replay log. | Add real plan approval. Add `interrupt --fact`. Add cancel and rebrief after a repeated bad premise. | A plan ruling, a fact-carrying interrupt, a resume, and a cancel-and-rebrief sequence. |

The supplied S2 interrupt records where the run stopped. It does not record a
fact. The `interrupt --fact` extension belongs to M4.

### S3: recovery and authority

| Milestone | Plain purpose | The starter supplies | Optional extension | Evidence that closes it |
|---|---|---|---|---|
| **M5** | Recover safely after a crash. Prevent duplicate external actions and useless retries. | The append-only log, `RunView`, crash fixture, and torn-record recovery. | Add event IDs, stable request IDs, reconciliation, and attempt, time, and no-progress budgets. | The new event lines, one harmless retry, each budget refusal, and a receipt after recovery. |
| **M6** | Give every tool result a clear meaning. Send risky actions to the correct approver. | `ToolResult`, the tool policy, credential policy, and `scripts/probe.sh`. | Add the remaining action classes, a `pending` approval flow, and new probe rows. | The full policy matrix, approval events, probe results, and honest containment labels. |

### S4: false evidence and stronger checks

| Milestone | Plain purpose | The starter supplies | Optional extension | Evidence that closes it |
|---|---|---|---|---|
| **M7** | Make old, copied, weakened, or forged evidence fail. | Signature, contract, check-version, and checked-code matching, plus the tamper table. | Run the full table. Add one missing attack. Close the old run. Issue new identities. | Every refusal, the new attack row, and a fresh receipt after the repair. |
| **M8** | Prove that a check catches a relevant wrong result and still accepts correct code. | One missed fault, a stronger check, and the three-state check script. | Create another missed fault. Strengthen and adopt the check under a new version. | Old check passes wrong code, stronger check fails wrong code, stronger check passes correct code, plus the remaining blind spot. |

### S5: hand-offs and regression cases

| Milestone | Plain purpose | The starter supplies | Optional extension | Evidence that closes it |
|---|---|---|---|---|
| **M9** | Make a folder that lets a fresh reader understand and rerun one past run. | Hand-off templates, `PROOF.md`, `FIELD-NOTES.md`, run manifests, and saved check output. | Build a dated AS-BUILT map and incident record. Ask a fresh reader to rerun one check. | The pack, its checker result, the fresh-reader result, and the correction that result caused. |
| **M10** | Turn Project 3's simple case into a structured evaluation. | Five regression cases and the case and table checkers. | Convert your case to the supplied YAML format. Add a trajectory rule, signed table, and holdout. | The YAML case, source trace, checker results, signed before-and-after table, target result, and holdout result. |

The larger six-case and eight-case packs are optional engineering targets.
They are not Demo Day requirements.

### S6: joins and release

| Milestone | Plain purpose | The starter supplies | Optional extension | Evidence that closes it |
|---|---|---|---|---|
| **M11** | Join several gated runs. Accept only matching receipts within one shared budget. | The four-node workflow, join, attack script, contracts, and receipts. | Diagnose or fix one connection. Add a node, budget rule, or deterministic refusal. | The node receipts, shared-budget rule, join transcript, and new refusal. |
| **M12** | Keep release outside the workflow. Record a human owner and rollback path. | `request_release`, `promote.sh`, and the run card. | Enforce promotion outside a custom workflow. Record a named owner and rollback path. | The release record, owner, rollback path, completed run card, and refusal of self-promotion. |

## How the artifacts change

The same artifacts mature across the course. This table is a reference, not a
required checklist.

| Artifact | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---|---|---|---|---|---|
| Done Contract | Written and locked before the run. | Compiled into a goal and rider. | Exercised by recovery and budget rules. | Reissued after a stronger check. | Its blind spot enters the hand-off. | Split into per-node contracts. |
| Named check | Locked in the first receipt. | Fails and passes during the steered run. | Stays fixed while recovery grows around it. | Gains a new version after a missed fault. | Becomes a regression expectation. | Each node carries its own check. |
| Checked files | Hashed before work and at receipt time. | Can remain half-written after a crash. | Survives torn records and recovery. | Makes old receipts fail after a change. | Gains new evidence without edited history. | Each node starts from its dependency's accepted snapshot. |
| Receipt | Proves four matching values and a signature. | Follows the interrupted and resumed run. | Follows a recovery decision. | Refuses forgery, replay, and old files. | Becomes an expectation in a saved case. | Becomes the join's input. |
| Regression pack | Empty. | Empty. | Empty. | Provides the missed fault. | Gains a case from a failed run. | Can become another workflow check. |
| Run card | Gains Define. | Gains Brief. | Gains Operate. | Gains Verify. | Gains Compound. | Gains the release owner and remaining blind spot. |

## Authority stays outside the agent

The agent can ask for a gate run. It cannot write:

- the gate executable
- `gate.key`
- fixed control contracts
- `control/receipts/`
- the completion transition

If an extension gives the agent one of these powers, record it as a failed
control. Do not present it as a completed milestone.

## Full engineering evidence

This list belongs only to the optional engineering track. The run card replaces
it on the required course path.

### Contracts and briefs

- Done Contract path and SHA-256
- checked code snapshot
- goal and rider paths
- non-goals and stop conditions
- fresh-agent first action

### Run control

- plan ruling
- append-only run log
- interrupt and resume sequence
- cancel and rebrief sequence
- reconciliation decision
- action and approval matrix
- budget refusal

### Gate evidence

- signed receipt
- one truthful gate refusal
- deliberate fault
- stronger check and version
- remaining blind spot

### Learning evidence

- dated hand-off pack
- incident with a rejected hypothesis
- regression case from a failed run
- before-and-after comparison
- unchanged holdout

### Workflow evidence

- run-shape decision
- node receipts
- join transcript
- deterministic join refusal
- human release owner
- rollback path
- remaining risk

Private notes stay in `FIELD-NOTES.md`. Required evidence links stay in
`PROOF.md`.

If you want to continue after M12, use [the challenge](CHALLENGE.md). It is
also optional.
