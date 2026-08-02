export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
