/**
 * WooCommerce Store API enrichment.
 *
 * Some Awin feeds carry only placeholder images ("noimage.gif") and empty
 * category columns even though the store is a public WooCommerce site. The
 * public Store API exposes each product's real image and categories, and the
 * feed's `merchant_product_id` equals the WooCommerce product id, so rows can
 * be enriched precisely without scraping HTML.
 *
 * Everything here is best-effort: any failure returns null/empty and the
 * normal feed-based flow continues unchanged.
 */

export interface WcEnrichment {
  /** Real primary product image URL. */
  imageUrl: string;
  /** Meaningful WooCommerce category slugs (marketing/brand tags removed). */
  categorySlugs: string[];
}

interface WcApiProduct {
  id: number;
  categories?: Array<{ id: number; name: string; slug: string }>;
  images?: Array<{ id: number; src: string; thumbnail?: string }>;
}

/** URL substrings that indicate an Awin placeholder rather than a real image. */
const PLACEHOLDER_MARKERS = ['noimage', 'no-image', 'placeholder'];

/** Category slugs that describe merchandising, not a product's real type. */
const NOISE_CATEGORY =
  /(sale|offer|clearance|new-arrival|coming-soon|best-|price-drop|spring-|flash|free-vape|-kits$|-replacements$|special|hardware-clearance|hi-drip|pachamama|pancake|tobacco-)/i;

/** Returns true when the feed image is a known placeholder / missing. */
export function isPlaceholderImage(url: string): boolean {
  const u = (url || '').trim().toLowerCase();
  if (!u) return true;
  return PLACEHOLDER_MARKERS.some((m) => u.includes(m));
}

/** Extract the store origin (https://host) from a product/deep-link URL. */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function fetchJson(url: string, timeoutMs: number): Promise<WcApiProduct[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
      // Never cache to CDN-mutate; Next route handles revalidation.
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as WcApiProduct[];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the store's whole catalog (paginated, up to a cap) and index it by id.
 * Returns null when the endpoint does not behave like a WooCommerce Store API.
 */
export async function fetchWcCatalog(
  origin: string,
  opts: { perPage?: number; maxPages?: number; timeoutMs?: number } = {},
): Promise<Map<number, WcEnrichment> | null> {
  const perPage = opts.perPage ?? 100;
  const maxPages = opts.maxPages ?? 30;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const base = `${origin}/wp-json/wc/store/v1/products`;
  const index = new Map<number, WcEnrichment>();

  for (let page = 1; page <= maxPages; page++) {
    const url = `${base}?per_page=${perPage}&page=${page}&_fields=id,categories,images`;
    let products: WcApiProduct[];
    try {
      products = await fetchJson(url, timeoutMs);
    } catch {
      // First page failing means this isn't an usable Store API endpoint.
      return page === 1 ? null : index;
    }
    if (!Array.isArray(products) || products.length === 0) break;
    for (const p of products) {
      const imageUrl = p.images?.[0]?.src ?? '';
      const categorySlugs = (p.categories ?? [])
        .map((c) => c.slug)
        .filter((s) => s && !NOISE_CATEGORY.test(s));
      index.set(p.id, { imageUrl, categorySlugs });
    }
    if (products.length < perPage) break;
  }
  return index;
}
