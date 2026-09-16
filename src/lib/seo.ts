/**
 * Shared SEO helpers.
 *
 * - metaDescription: turns long merchant/body copy into a concise, unique
 *   meta description (hard cap, word-boundary aware).
 * - sanitizeArticleHtml: demotes every in-body heading to a safe hierarchy
 *   (the page already renders one <h1> from the title) and guarantees every
 *   <img> carries an alt attribute, so rich-text content never produces
 *   multiple H1s or missing alt.
 */

export function metaDescription(
  raw: string | null | undefined,
  fallback = '',
  maxLength = 158,
): string {
  const stripTags = (html?: string | null) =>
    (html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  let text = stripTags(raw);
  if (!text) text = fallback;
  if (!text) return '';
  if (text.length <= maxLength) return text;

  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

export function sanitizeArticleHtml(html: string): string {
  if (!html) return '';
  let out = html;

  // Demote in-body headings so there is exactly one H1 (the article title).
  // Do this bottom-up so replacements do not collide.
  out = out.replace(/<h5([\s>])/gi, '<h6$1').replace(/<\/h5>/gi, '</h6>');
  out = out.replace(/<h4([\s>])/gi, '<h5$1').replace(/<\/h4>/gi, '</h5>');
  out = out.replace(/<h3([\s>])/gi, '<h4$1').replace(/<\/h3>/gi, '</h4>');
  out = out.replace(/<h2([\s>])/gi, '<h3$1').replace(/<\/h2>/gi, '</h3>');
  out = out.replace(/<h1([\s>])/gi, '<h2$1').replace(/<\/h1>/gi, '</h2>');

  // Guarantee alt on every img (decorative images get an empty alt).
  out = out.replace(/<img\b([^>]*)>/gi, (match, attrs: string) => {
    if (/\balt\s*=/i.test(attrs)) return match;
    return `<img${attrs} alt="">`;
  });

  return out;
}

/**
 * Strip search/click tracking params (e.g. Google's srsltid) that were
 * accidentally captured into stored retailer URLs before linking out.
 */
const TRACKING_PARAMS = new Set([
  'srsltid', 'gclid', 'fbclid', 'msclkid', 'twclid', 'ttclid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
]);

export function cleanAffiliateUrl(raw: string): string {
  if (!raw) return raw;
  let url: URL;
  try {
    url = new URL(raw, 'https://placeholder.invalid');
  } catch {
    return raw;
  }
  let changed = false;
  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return raw;
  // Re-serialize. For relative input keep only path+query.
  const qs = url.search;
  const result = url.pathname + qs + url.hash;
  // absolute URL: rebuild with origin
  if (/^https?:\/\//i.test(raw)) {
    return url.origin + result;
  }
  return result;
}
