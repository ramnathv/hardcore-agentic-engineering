# Loophole worksheet — attack the contract wording

Reader: [Chapter 1, "Write a contract that can be attacked"](https://hardcoreagentic.com/course/reader/01-define-done.html)

Two hats, about 15 minutes at your desk — the live room runs only the 5-minute
warm-up — and no partner needed:

- **Author** — your drafted Done Contract, exactly as it would read to a cold
  agent. No commentary on the side: the contract must speak for itself.
- **Attacker** — you, or your agent with the loophole-hunter brief
  (`prompts/operate.md` §2): *satisfy the words while missing the intent*.
  Describe the laziest, cheapest result that makes every written check pass.
  You are not being difficult; you are being an agent.

Warm-up (5 min): run the six questions against
`sessions/s1-define-done/fixtures/weak-contract.yaml` first. Every question
lands on that file. Then turn them on your own draft.

## The six loophole questions

Ask each one out loud. Record the exploit, not just "yes".

| # | Question | Exploit found (how exactly would the words pass while the intent fails?) | Revision made |
|---|---|---|---|
| 1 | Could the test already be green before the change? | | |
| 2 | Could the result be produced by changing a fixture? | | |
| 3 | Could a required case be omitted? | | |
| 4 | Could the command succeed without running the check? | | |
| 5 | Could the run act on a different worktree or version? | | |
| 6 | Is a non-functional quality missing? | | |

## Rules of revision

1. Every exploit gets a revision **in the contract**, not a verbal promise.
   A loophole closed in conversation is still open in the run.
2. Prefer closing loopholes with a check or a `must_not_change` entry over
   more adjectives in the outcome. "Correctly" has never stopped an agent.
3. When the attacker runs dry, **freeze**: this wording is now fixed. If
   execution later proves the contract wrong, that is a new contract version,
   a new hash and a new run — never an edit in place (`dr-gate` refuses:
   `contract hash mismatch: contract changed after the run was opened`).

## Keep (your evidence)

- the draft (v1) and the frozen contract (v2) — keep both files
- at least one row of the table filled in with a real exploit
- the frozen contract's hash: `shasum -a 256 done/contract.yaml`
