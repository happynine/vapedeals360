import { fetchProducts } from '@/lib/database';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

interface RelatedProductsProps {
  currentId: number;
  currentSlug: string;
  categoryId: number | null;
}

interface RelatedItem {
  slug: string;
  name: string;
  price: number;
  currency: string;
}

function pickLowest(product: Record<string, unknown>): RelatedItem | null {
  const translations = product.translations as
    | Array<{ language: string; name: string }>
    | undefined;
  const tr = translations?.find((x) => x.language === 'en') || translations?.[0];
  const prices = (product.prices as Array<Record<string, unknown>> | undefined) || [];
  const valid = prices.filter(
    (pr) => pr.no_quote !== true && pr.in_stock !== false
  );
  if (!tr?.name) return null;

  const toNum = (pr: Record<string, unknown>) => {
    const v =
      pr.promotion_id != null && pr.promo_price != null && pr.promo_price !== ''
        ? Number(pr.promo_price)
        : Number(pr.current_price);
    return Number.isFinite(v) && v > 0 ? v : null;
  };

  // Prefer USD, otherwise fall back to the cheapest available currency so that
  // GBP/CAD-only products are still linked (no orphan pages).
  const isUsd = (cur: string) => cur === '$' || cur === 'US$' || cur === 'USD';
  const usdRows = valid.filter((pr) => isUsd(String(pr.currency ?? '$')));
  const pool = usdRows.length > 0 ? usdRows : valid;
  let currency = usdRows.length > 0 ? '$' : '';
  let best: number | null = null;
  for (const pr of pool) {
    const v = toNum(pr);
    if (v === null) continue;
    if (best === null || v < best) {
      best = v;
      currency = usdRows.length > 0 ? '$' : String(pr.currency ?? '');
    }
  }
  if (best === null) return null;
  return { slug: product.slug as string, name: tr.name as string, price: best, currency };
}

/**
 * Server-rendered related-product internal links.
 * Same-category products first, topped up with the newest products so every
 * product page exposes real <a href="/product/..."> links in the initial HTML,
 * eliminating orphan pages for crawlers.
 */
export async function RelatedProducts({ currentId, currentSlug, categoryId }: RelatedProductsProps) {
  if (!isSupabaseConfigured()) return null;

  try {
    const [sameCategory, latest] = await Promise.all([
      categoryId
        ? fetchProducts({ language: 'en', category_id: categoryId, limit: 40 })
        : Promise.resolve([] as unknown[]),
      fetchProducts({ language: 'en', limit: 40 }),
    ]);

    const seen = new Set<string>([currentSlug]);
    const items: RelatedItem[] = [];

    for (const raw of [...(sameCategory as Array<Record<string, unknown>>), ...(latest as Array<Record<string, unknown>>)]) {
      if ((raw.id as number) === currentId) continue;
      const item = pickLowest(raw);
      if (!item) continue;
      if (seen.has(item.slug)) continue;
      seen.add(item.slug);
      items.push(item);
      if (items.length >= 12) break;
    }

    if (items.length === 0) return null;

    return (
      <section aria-label="Related vape deals" className="mt-10 border-t border-gray-200 pt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Related Products</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
          {items.map((it) => (
            <li key={it.slug}>
              <a
                href={`/product/${it.slug}`}
                className="group block rounded-xl border border-gray-200 p-3 hover:border-purple-300 transition-colors"
              >
                <span className="block text-sm font-medium text-gray-900 group-hover:text-purple-700 line-clamp-2">
                  {it.name}
                </span>
                <span className="mt-1 block text-sm font-semibold text-purple-700">
                  from {it.currency}{it.price.toFixed(2)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    );
  } catch {
    return null;
  }
}
