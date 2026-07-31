<p align="center">
  <a href="https://maven.com/specstory/hardcore-agentic-engineering-for-builders-who-ship"><img src="assets/maven-logo.png" alt="Maven" width="150"></a>
</p>

<h1 align="center">Hardcore Agentic Engineering: <em>for builders who ship</em></h1>

- Free lightning lessons from [Hardcore Agentic Engineering](https://maven.com/specstory/hardcore-agentic-engineering-for-builders-who-ship), a three-week Maven course on getting real work out of coding agents and proving that work is correct.
- The course runs **August 3&ndash;21, 2026**. **[Register here](https://get.specstory.com/agentic-engineering)**: the link applies promo code `HARDCORE` for you.

---

## The course

Most AI courses teach you to prompt. This one assumes you already prompt an agent, read the diff, and accept the result. It teaches the discipline that comes next. The spine of the whole course is one method:

> **Define done. Brief the run. Steer the work. Verify the result.**

Five outcomes, one per session:

- **Define.** Fix the result, the boundary and the evidence before the run starts.
- **Brief.** Give a fresh agent enough context, limits and stop conditions to start cold, with no hidden chat history.
- **Operate.** When the premise, state or authority becomes uncertain, choose a justified action.
- **Verify.** Make a relevant wrong result turn the evidence red. The agent never gets to mark its own homework done.
- **Compound.** Turn one run into a retained change that makes the next run better.

Over three weeks you work in one artifact and keep it: **`prove-it`**, a small TypeScript agent harness with a gate at the exit. The worker's "done" is an opinion; only `dr-gate` — 95 lines you can actually read — reruns the agreed checks and records completion. Each week you also take the same method to one real task in a repository of your own, and hand in what happened.

| Week | Theme |
|---|---|
| Aug 3–9 | **Define it, then brief it.** What done means before the run starts, and a brief a fresh agent can start from cold. Project 1: the contracted run |
| Aug 10–16 | **Control it, then attack it.** The control plane under the run, then attacks on your own gate and checks. Project 2: the controlled and attacked run |
| Aug 17–21 | **Improve it, then defend it.** Better checks from your own failed runs, composed verified runs, and a live defense of the evidence. Demo Day closes the cohort |

Six live sessions (Tuesdays and Thursdays, August 4–20, 2026) plus Demo Day (Friday, August 21), taught by [Greg Ceccarelli](https://maven.com/specstory) (ex-CPO Pluralsight; data at GitHub, Dropbox, and Google). Details and enrollment on [the Maven course page](https://maven.com/specstory/hardcore-agentic-engineering-for-builders-who-ship).

## The course starter: `prove-it`

The practice harness students build on lives in [`prove-it/`](prove-it/): a small
TypeScript agent loop with a gate at the exit. Zero dependencies, no API keys,
no network — Node ≥ 22.6 runs it directly. Start with
[`prove-it/README.md`](prove-it/README.md), then the
[Session 0 guide](prove-it/sessions/s0-setup/README.md). The full course site —
reader, decks and week pages — is at [hardcoreagentic.com](https://hardcoreagentic.com)
(cohort passcode required).

## The lightning lessons

Three free one-hour sessions in July 2026. Each stands alone and teaches one piece of the course's argument. Each lesson with materials gets a folder in [`lightning-lessons/`](lightning-lessons/) holding its deck and demo code.

| Date | Lesson | Materials |
|---|---|---|
| Tue, Jul 14 | [Build a Definition of Done for Claude Code and Codex](https://maven.com/p/e72330/build-a-definition-of-done-for-claude-code-and-codex): why agents say "done" when they aren't, and the ten-line loop that makes done an exit code | [▶ recording](https://www.youtube.com/watch?v=vLemEkD35V0) · [slides](https://specstoryai.github.io/hardcore-agentic-engineering/definition-of-done/) · [`lightning-lessons/definition-of-done/`](lightning-lessons/definition-of-done/) |
| Mon, Jul 20 | [Build an environment-aware AI Agent from Scratch](https://maven.com/p/2ffede/build-an-environment-aware-ai-agent-from-scratch): an agent harness is a loop you can build yourself in an afternoon. With John Berryman (GitHub Copilot; author, *Prompt Engineering for LLMs*) | [▶ recording](https://www.youtube.com/watch?v=x8UI9X6ofr4) · [slides](https://specstoryai.github.io/hardcore-agentic-engineering/build-an-environment-aware-agent/) · [`lightning-lessons/build-an-environment-aware-agent/`](lightning-lessons/build-an-environment-aware-agent/) |
| Mon, Jul 27 | [Make Your Repo Agent-Ready: Rules, Docs, Reviews](https://maven.com/p/d68fd1/make-your-repo-agent-ready-rules-docs-reviews): most agent failures aren't the model's fault, they're the repo's. With Dan Gerlanc (co-founder, .txt/Outlines) | [▶ recording](https://www.youtube.com/watch?v=HjBTyYJ4LH0) · [slides](https://specstoryai.github.io/hardcore-agentic-engineering/make-your-repo-agent-ready/) · [`lightning-lessons/make-your-repo-agent-ready/`](lightning-lessons/make-your-repo-agent-ready/) |

## Using this repo

```bash
git clone https://github.com/specstoryai/hardcore-agentic-engineering.git
```

Everything is in the clone, demos included. Each lesson folder has its own README explaining the deck and how to run the demo. The decks are single self-contained HTML files. Open one in a browser and present.

## Further reading

- **[25 Patterns in Agentic Engineering](https://specstory.com/books/25-patterns-in-agentic-engineering-book-2026.pdf)**: Greg's free field guide to shipping software by steering agents, drawn from ~1,310 captured agent sessions and 4,670 commits of building [Stoa](https://withstoa.com)
- **[deadreckon.sh](https://deadreckon.sh)**: run your coding agent unattended, and trust the result. The industrial-grade version of the loops these lessons teach
- **[SpecStory](https://specstory.com)** ([github.com/specstoryai/getspecstory](https://github.com/specstoryai/getspecstory)): capture, search, and learn from every AI coding session
