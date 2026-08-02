// The seeded fault for tamper row 6: green under check-v1, wrong for real
// inputs — long titles are silently truncated to their first word.
export function slugify(title) {
  const s = title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length > 60 ? s.split('-')[0] : s;
}
