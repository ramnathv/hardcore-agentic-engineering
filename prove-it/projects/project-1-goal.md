# Goal — duckddl D1: rename `duck_parquet_meta()` to `duck_parquet_metadata()`

## Outcome

`duckddl` exports `duck_parquet_metadata()` and no longer exports
`duck_parquet_meta()`; the full `testthat` suite passes with **185 passed, 0
failed, 0 skipped**; and no tracked file outside `NEWS.md` still names the old
function.

Done is decided by `dr-gate` against the contract pinned at
`sha256:b0f0114ade50…` before this run opened — not by your own report. Run id
is `port-1`.

## Posture

Bounded run, in the `duckddl` repository, with your own tools. The course
harness is **not** in this loop: it fixed the identities before you started and
will judge afterwards. Nothing you do writes to it.

Work on the current branch. Commit when the checks are green, not before.

## Constraints

- **`tests/testthat/` is pinned by sha256.** All 15 files. Editing, adding, or
  deleting any of them refuses the entire run — there is no partial credit.
  The failing introspect test is the target, not the obstacle.
- **This is D1 only.** `ROADMAP.md` queues D2, D3, D4 and D6 as renames of the
  same shape. They are separate contracts and separate runs. Do not do them.
- **`.Rproj.user/` is out of scope.** It is gitignored editor state that holds
  stale copies of the old name. The check uses `git grep`, so it never looks
  there. Neither should you.
- No behaviour change. The function body is untouched; only its name moves.
- Follow `CLAUDE.md` for style, roxygen and the `devtools::document()`
  workflow. It is authoritative on how this package is built.

## Stop and ask

- **Any** need to edit, add, or delete anything under `tests/testthat/` —
  including adding a `skip_if_*()`. Stop and say why; do not work around it.
- The rename cannot be completed without changing behaviour rather than names.
- A caller of `duck_parquet_meta()` exists that this contract did not
  anticipate.
- The same check fails twice for the same reason: stop, name the premise you
  now doubt, and wait for a rebrief.

## Budget

3 attempts, 30 minutes. A spent budget with a clear trail is a good outcome. A
guessed green is not.
