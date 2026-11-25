/**
 * Formats a source citation from the first author and publication year,
 * e.g. "Fang et al. (2021)". Either part may be missing.
 */
export function sourceCitation(
  firstAuthor: string | null,
  publicationYear: number | null,
): string | null {
  const author = firstAuthor?.trim() || null;
  if (author && publicationYear !== null) return `${author} (${publicationYear})`;
  if (author) return author;
  if (publicationYear !== null) return `(${publicationYear})`;
  return null;
}
