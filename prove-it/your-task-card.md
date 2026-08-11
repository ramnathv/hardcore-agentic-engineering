# Real-repo task card (Session 0, task 3)

**Repo:** `duckddl` — the DDL and workspace layer for DuckDB in R. Pre-v0.2.0,
41 exported functions, 185 tests passing, not yet on CRAN.

**One-sentence task:** `duckddl` exports `duck_parquet_metadata()` and no longer
exports `duck_parquet_meta()`, with no reference to the old name surviving
outside the `NEWS.md` entry that records the rename.

**The observable result:** a second person greps the repo for the old name and
finds exactly one file — `NEWS.md`. Source, tests, man pages, both READMEs,
ROADMAP, CLAUDE.md and NAMESPACE all name only the new function.

**The check command:**

```
test -z "$(grep -rlE 'duck_parquet_meta\b' . --exclude-dir=.git --exclude=NEWS.md)"
```

The `\b` is load-bearing: `duck_parquet_meta` is a prefix of
`duck_parquet_metadata`, so a naive grep matches the new name too and the check
could never pass.

**Expected exit status today:** 1 — eight files still carry the old name
(`NAMESPACE`, `R/introspect.R`, `man/duck_parquet_meta.Rd`,
`tests/testthat/test-introspect.R`, `README.md`, `README.Rmd`, `ROADMAP.md`,
`CLAUDE.md`).

**Blast radius:** 9 files, 20 references. No behaviour change — the function
body is untouched. Fully reversible with `git checkout`; baseline is `81cabd1`.

**What must NOT change:** the 15 files under `tests/testthat/`, pinned by
sha256 so no assertion can be weakened to pass; and the test tally — 185
passing, 0 skipped. A `skip_if_not_installed()` that makes a failure vanish
while `devtools::check()` stays clean is the loophole to refuse.

**Why this is worth six sessions:** D1 is the first of five queued pre-tag
renames (D1, D2, D3, D4, D6 in the ROADMAP), all the same shape. The contract I
write once runs five times, and run two is where the apparatus starts paying
for itself. The API freezes at v0.2.0; after that each of these gets expensive.
