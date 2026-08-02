# projects/ — where your weekly submissions live

Your Project each week is one file in this directory, on its own branch, linked
from Maven. The branch is what makes the submission reviewable: the file tells
the story, and every piece of evidence it links sits in the same tree, frozen
at the commit you submitted.

## Once, before Project 1

Your clone came from the course repo, which you cannot push to. Give it a home
you own:

1. Fork `specstoryai/hardcore-agentic-engineering` on GitHub. A fork of a
   public repo is public — that is fine when your task card is already
   privacy-safe. If you need privacy instead, create a private repository you
   own, push your clone there, and invite Greg (`gregce`) as a reader.
2. Add it as a remote: `git remote add submit <your-repo-url>`. Keep `origin`
   pointing at the course repo, so `git pull origin main` still brings fixes.
3. Push once: `git push submit main`.

## Every week

1. Week 1: `git checkout -b project-1`, from main.
2. Write `prove-it/projects/project-1.md`. The headings are on the week page,
   and [project-1-example.md](project-1-example.md) shows a finished one.
3. Commit the evidence your file links — the contract, the brief, the run
   directories, and the receipts under `control/receipts/` — on the same
   branch. If your contract lives outside the clone, commit a byte-identical
   copy under `projects/` (same bytes, same sha — the sha is what the receipt
   binds). Links in your file are relative paths into the branch, so a
   reviewer clicks from your story to your evidence.
4. Push it: `git push submit project-1`.
5. Paste the file's URL on that branch into the Maven Project 1 channel:
   `https://github.com/<you>/<repo>/blob/project-1/prove-it/projects/project-1.md`

Weeks 2 and 3 continue the chain rather than restarting it:
`git checkout project-1 && git checkout -b project-2`, then
`git checkout project-2 && git checkout -b project-3`. Each branch carries
everything before it — the contract, the evidence, the card rows you already
filled — so the run card on `project-3` links files that live on the same
branch. Project 3 has no
separate file: the branch carries [`PROOF.md`](../PROOF.md) completed, and that
is the file you link.

A truthful refusal is a result. If the run did not do what you hoped, the
branch holds what happened, and you submit that.

## The examples

One fictional task — deduplicating a payments webhook — carried across all
three weeks, exactly the way your real task will be:

- [project-1-example.md](project-1-example.md) — the contracted run
- [project-2-example.md](project-2-example.md) — the controlled and attacked run
- [project-3-example.md](project-3-example.md) — the run card, filled

Their gate evidence is earned, not imagined: the contract carries
`candidate_dir` and `protect`, and [PORT.md](../PORT.md)'s three commands —
open, check, complete — produce every receipt and refusal the examples cite.

The examples set the bar, not the ceiling: yours will differ in content and
match in shape. Every claim links evidence; no console output is pasted where
a link can stand.
