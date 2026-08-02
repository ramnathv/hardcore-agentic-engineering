# Real-repo task card (Session 0, task 3)

Copy this file, fill every field, keep it under 2,000 characters (`wc -m`).
This card is what you nominate before Session 1 — Greg maps a
supplied fixture to the same control problem when your context cannot leave
your organization. A vague card wastes your live time; a sharp one buys you
six sessions of transfer material.

The one rule: **the result must be small enough to verify.** If you cannot
name a command that would prove it, pick a smaller task.

---

Repo (name or redacted alias):

One-sentence task (a result, not an activity — "X behaves like Y", never
"investigate X"):

The observable result (what a second person could see without reading any
chat transcript):

The check command that would prove it (must be runnable by someone else;
exit status counts, narrative does not):

Expected exit status of that check today (it should FAIL now — if it already
passes, the task is done and you picked the wrong task):

Blast radius if an agent gets it wrong (files/systems touched; is it
reversible?):

What must NOT change (protected paths, interfaces, data):

Why this is worth six sessions (the honest stake — a real incident, a slow
chore, a risky release):

---

Done when: `wc -m < your-task-card.md` prints a number ≤ 2000 AND every field
above has a non-empty answer AND the check command is pasted verbatim, not
described.
