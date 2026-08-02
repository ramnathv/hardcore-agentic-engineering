# S5 fixtures — index

Session 5 material only. The 5 supplied eval cases live in the core harness at
`fixtures/eval/cases/01–05`. They are referenced here, not duplicated. This
directory adds what M9 and M10 need beyond them.

- `failed-trace/` — the fallback failed run (interrupted red candidate,
  gate refusal). Raw material for case 06 when you have no failed trace of
  your own. Preserved as it failed; see its `NOTE.md` for provenance and
  regeneration commands.
- `labeling-trace/` — a 23-event crash-and-recovery trace plus
  `worksheet.md` for the first-failure labeling exercise (answers in
  `../homework-solutions.md`).
- `templates/` — the M9/M10 blanks: `handoff.md`, `AS-BUILT.md`,
  `incident.md`, `eval-case.template.yaml` (cases 06–08),
  `before-after.md` (one harness change).
- `checks/` — the executable "Done when" for each template:
  - `handoff-check.sh [--manifest-only] <dir>` — hand-off pack structure
  - `eval-case-check.sh <files|cases-dir>` — case shape; pack mode needs >= 6
  - `before-after-check.sh <file>` — one change, baseline+after, holdout,
    human decision

All checks print an honest label about what they do not verify. Structure
checks cannot prove semantic accuracy, which is what the fresh-reader test is
for. Shape checks cannot prove a grader is honest, which is what the
grader-health drill is for. Run them from anywhere; paths resolve against the
prove-it root.
