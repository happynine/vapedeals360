/**
 * Extract a plain-text excerpt from article HTML content.
 * Strips tags, decodes common entities and truncates to maxLength.
 */
export function makeExcerpt(html: string | null | undefined, maxLength = 120): string {
  if (!html) return '';
  let text = String(html)
    // Replace block endings with spaces to avoid words glued together
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    // Drop all remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&hellip;/g, '…')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > maxLength) {
    text = text.slice(0, maxLength).replace(/\s+\S*$/, '').trimEnd() + '…';
  }
  return text;
}
