// S4/M8 second seeded fault: GREEN under check-v2, wrong for real inputs —
// digits are silently dropped ('Top 10 Tools of 2026' → 'top-tools-of').
// Use with check-adequacy.sh to prove a check earns trust only by catching
// a relevant wrong result. The v1 fault (truncation) lives in
// control/checks/fixtures/solution-faulty.mjs; this one survives its fix.
export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[0-9]+/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
