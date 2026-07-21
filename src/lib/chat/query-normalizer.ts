/**
 * Helper to normalize user query strings before semantic retrieval & embedding generation.
 *
 * Operations:
 * 1. Trim leading/trailing whitespace.
 * 2. Convert text to lowercase.
 * 3. Replace trailing/punctuation marks (?, !, ., comma) and hyphens/underscores with space.
 * 4. Collapse multiple consecutive spaces into a single space.
 *
 * Examples:
 * - "Top Ten Tags"       -> "top ten tags"
 * - "top ten tags"       -> "top ten tags"
 * - "TOP TEN TAGS"       -> "top ten tags"
 * - "Top   Ten   Tags"   -> "top ten tags"
 * - "top-ten-tags"       -> "top ten tags"
 * - "Top ten tags?"      -> "top ten tags"
 */
export function normalizeQuery(query: string): string {
  if (!query || typeof query !== "string") {
    return "";
  }

  return query
    .trim()
    .toLowerCase()
    .replace(/[\?\,\.\!]+/g, " ")
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
