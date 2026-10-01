/**
 * Promotion landing-page parser.
 *
 * Vapesourcing (and similar Magento-style stores) publish sale / brand pages
 * that contain richer promo data than the Awin product feed: current price,
 * struck-through original price and a coupon code. This module fetches those
 * pages and extracts the promo info keyed by the product's site path so the
 * preview can annotate matching feed rows.
 *
 * The parsing is intentionally tolerant: selectors target the common
 * `li.product-item / .price-box / .special-price / .old-price` markup and any
 * failure on one page simply yields no entries for that page.
 */

export interface PromoInfo {
  /** Product site path, e.g. "/remit-slim-air-50k.html". */
  path: string;
  currentPrice: number | null;
  originalPrice: number | null;
  couponCode: string | null;
  /** Page URL the info came from. */
  sourceUrl: string;
}

/** Parse a " $11.99 " style price. */
function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.,]/g, '').trim();
  if (!cleaned) return null;
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned.replace(/,/g, '');
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Reduce a possibly-relative product URL to its pathname. */
export function productPath(rawUrl: string): string {
  const v = (rawUrl || '').trim();
  if (!v) return '';
  try {
    // Relative URLs need a base.
    const u = v.startsWith('http')
      ? new URL(v)
      : new URL(v, 'https://vapesourcing.com');
    return u.pathname;
  } catch {
    return v.split('?')[0];
  }
}

/** Pull a page-wide coupon code from prose such as 'coupon code: REMIT'. */
function extractPageCoupon(html: string): string | null {
  const m = html.match(/coupon\s*code[:\s</a-z0-9=":#-]{0,120}?>\s*([A-Z0-9][A-Z0-9_-]{1,19})\b/i);
  if (m) return m[1].toUpperCase();
  const w = html.match(/with\s*code[:\s</a-z0-9=":#-]{0,80}?([A-Z][A-Z0-9]{2,11})\b/i);
  if (w) return w[1].toUpperCase();
  return null;
}

/** Parse one promotion page's HTML into promo entries keyed by product path. */
export function parsePromoPage(html: string, sourceUrl: string): PromoInfo[] {
  const items = html.match(/<li class="product-item">[\s\S]*?<\/li>/g) || [];
  const pageCoupon = extractPageCoupon(html);
  const out: PromoInfo[] = [];
  for (const block of items) {
    const hrefMatch = block.match(/href="([^"]+\.html)"/);
    if (!hrefMatch) continue;
    const path = productPath(hrefMatch[1]);
    if (!path) continue;
    const curMatch = block.match(/special-price[\s\S]{0,200}?<span class="price">\s*\$?([\d.,]+)/);
    const oldMatch = block.match(/old-price[\s\S]{0,200}?<span class="price">\s*\$?([\d.,]+)/);
    const codeMatch = block.match(/code[:\s</a-z0-9=":#-]{0,80}?([A-Z0-9][A-Z0-9_-]{1,19})/i);
    out.push({
      path,
      currentPrice: curMatch ? parseMoney(curMatch[1]) : null,
      originalPrice: oldMatch ? parseMoney(oldMatch[1]) : null,
      couponCode: codeMatch ? codeMatch[1].toUpperCase() : pageCoupon,
      sourceUrl,
    });
  }
  return out;
}

/**
 * Fetch several promotion pages and merge them into a map keyed by product
 * path. Per-page fetch/parse failures are collected rather than thrown so a
 * single bad URL never breaks the whole preview.
 */
export async function buildPromoMap(
  urls: string[],
): Promise<{ map: Map<string, PromoInfo>; errors: string[] }> {
  const map = new Map<string, PromoInfo>();
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; VapeDeals360/1.0; +https://vapedeals360.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) {
        errors.push(`${url} → HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      let count = 0;
      for (const info of parsePromoPage(html, url)) {
        if (!map.has(info.path)) {
          map.set(info.path, info);
          count++;
        }
      }
      if (count === 0) errors.push(`${url} → 未解析到产品`);
    } catch (e) {
      errors.push(`${url} → ${e instanceof Error ? e.message : 'fetch failed'}`);
    }
  }
  return { map, errors };
}
