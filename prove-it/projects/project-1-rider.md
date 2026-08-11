# Rider — duckddl D1: `duck_parquet_meta()` → `duck_parquet_metadata()`

## Context

- `duckddl` is the DDL and workspace layer for DuckDB in R. Pre-v0.2.0, 41
  exported functions, not on CRAN, no downstream users. `ROADMAP.md` records
  this rename as decision **D1**, and its reasoning: renames are free now and
  expensive after the first tagged release.
- Read `CLAUDE.md` first. It is authoritative on package identity rules, design
  principles, testing rules and the documentation workflow — in particular that
  `man/` and `NAMESPACE` are **generated** by `devtools::document()` from
  roxygen blocks in `R/`, never hand-edited.
- A gate outside this repository judged the starting state and will judge the
  finished one. It reads and hashes `duckddl`; it never writes here.

## Live evidence

Run these first; do not take my word for any of it.

- The suite is **red on purpose**: `183 passed, 1 error, 0 skipped`. The error
  is `test-introspect.R` calling `duck_parquet_metadata()`, which does not
  exist yet. That test was written first, deliberately. Target after your work:
  **185 / 0 / 0**.
- Seven tracked files still carry the old name:

  ```
  CLAUDE.md   NAMESPACE   R/introspect.R   README.Rmd
  README.md   ROADMAP.md  man/duck_parquet_meta.Rd
  ```

  Confirm with `git grep -lP "duck_parquet_meta\b" -- ':!NEWS.md'`. Note the
  `-P`: `git grep -E` does **not** support `\b` and silently matches nothing.

- **`CLAUDE.md` is itself on that list.** The file you are reading for guidance
  is stale at lines 45 and 182. Updating it is part of the job.

## Focus files

- `R/introspect.R` — the definition and its roxygen block. The real edit.
- `NAMESPACE`, `man/` — regenerate with `devtools::document()`. Do not hand-edit.
- `README.Rmd` → `README.md` — the `.Rmd` is the source; keep them consistent.
- `ROADMAP.md`, `CLAUDE.md` — prose references to the old name.
- `NEWS.md` — the one tracked file allowed to keep the old name. Add an entry
  recording the rename.

## Deliverable

1. `duck_parquet_metadata()` exported, `duck_parquet_meta()` gone, suite at
   185 / 0 / 0.
2. Zero tracked references to the old name outside `NEWS.md`.
3. One sentence naming what these checks do **not** cover — the residual risk
   is part of the deliverable, not an afterthought.

## Fences

- **Nothing under `tests/testthat/`.** Pinned by sha256; any change refuses the
  whole run.
- **Nothing under `.Rproj.user/`.** Gitignored editor state. It contains stale
  copies of the old name that are not in scope and not checked.
- **D1 only.** Leave D2, D3, D4 and D6 alone.
- No new dependencies, no behaviour changes, no "while I was in here" fixes.
- Do not claim completion, coverage, or containment you have not observed.

## Stop-when

- The plan involves touching `tests/testthat/` for any reason.
- A check seems to contradict this brief.
- You want to change any fence.
- The same failure repeats twice with the same cause.

## Open questions

- `man/duck_parquet_meta.Rd` should end up **renamed on disk**, not merely
  rewritten. The stale-reference check reads file *contents*, so an orphaned
  file with the old name in its filename would pass. `devtools::document()`
  usually handles this; verify it did.
- Whether `_pkgdown.yml` needs a matching edit. It is not currently on the
  stale list — confirm the reference index still builds.
