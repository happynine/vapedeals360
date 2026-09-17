import { fetchProducts } from '@/lib/database';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import { getServerCurrency } from '@/lib/server-currency';

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

function pickLowest(product: Record<string, unknown>, symbol: string): RelatedItem | null {
  const translations = product.translations as
    | Array<{ language: string; name: string }>
    | undefined;
  const tr = translations?.find((x) => x.language === 'en') || translations?.[0];
  const prices = (product.prices as Array<Record<string, unknown>> | undefined) || [];
  // Strict: only prices in the visitor's selected currency. No fallback to other
  // currencies so the Related block never mixes currencies.
  const valid = prices.filter(
    (pr) =>
      pr.no_quote !== true &&
      pr.in_stock !== false &&
      String(pr.currency ?? '') === symbol
  );
  if (!tr?.name) return null;

  const toNum = (pr: Record<string, unknown>) => {
    const v =
      pr.promotion_id != null && pr.promo_price != null && pr.promo_price !== ''
        ? Number(pr.promo_price)
        : Number(pr.current_price);
    return Number.isFinite(v) && v > 0 ? v : null;
  };

  let best: number | null = null;
  for (const pr of valid) {
    const v = toNum(pr);
    if (v === null) continue;
    if (best === null || v < best) best = v;
  }
  if (best === null) return null;
  return { slug: product.slug as string, name: tr.name as string, price: best, currency: symbol };
}

/**
 * Server-rendered related-product internal links.
 *
 * Driven entirely by products the merchant flags is_featured, and strictly
 * filtered to the visitor's global currency (read from the `currency` cookie).
 * Same-category featured products first, topped up with other featured products.
 * If not enough featured products carry a price in the selected currency the
 * block simply shows fewer items (and renders nothing when there are none) —
 * it never falls back to another currency.
 */
export async function RelatedProducts({ currentId, currentSlug, categoryId }: RelatedProductsProps) {
  if (!isSupabaseConfigured()) return null;

  try {
    const { symbol } = await getServerCurrency();

    const [sameCategory, allFeatured] = await Promise.all([
      categoryId
        ? fetchProducts({ language: 'en', featured: true, currency: symbol, category_id: categoryId, limit: 40 })
        : Promise.resolve([] as unknown[]),
      fetchProducts({ language: 'en', featured: true, currency: symbol, limit: 60 }),
    ]);

    const seen = new Set<string>([currentSlug]);
    const items: RelatedItem[] = [];

    for (const raw of [...(sameCategory as Array<Record<string, unknown>>), ...(allFeatured as Array<Record<string, unknown>>)]) {
      if ((raw.id as number) === currentId) continue;
      const item = pickLowest(raw, symbol);
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
