const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/**
 * Splits frontmatter from body using the standard YAML frontmatter regex.
 * Returns null for frontmatter when none is found.
 */
export function splitFrontmatter(content: string): { frontmatter: string | null; body: string } {
  const match = FRONTMATTER_REGEX.exec(content);
  if (!match) {
    return { frontmatter: null, body: content };
  }
  return {
    frontmatter: match[1],
    body: match[2] || '',
  };
}
