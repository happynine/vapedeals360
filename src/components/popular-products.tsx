import { fetchProducts } from '@/lib/database';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

interface PopularItem {
  slug: string;
  name: string;
  price: number;
  currency: string;
}

function pickLowest(product: Record<string, unknown>): PopularItem | null {
  const translations = product.translations as
    | Array<{ language: string; name: string }>
    | undefined;
  const tr = translations?.find((x) => x.language === 'en') || translations?.[0];
  const prices = (product.prices as Array<Record<string, unknown>> | undefined) || [];
  const valid = prices.filter((pr) => pr.no_quote !== true && pr.in_stock !== false);
  if (!tr?.name || valid.length === 0) return null;

  const isUsd = (cur: string) => cur === '$' || cur === 'US$' || cur === 'USD';
  const usdRows = valid.filter((pr) => isUsd(String(pr.currency ?? '$')));
  const pool = usdRows.length > 0 ? usdRows : valid;
  let best: number | null = null;
  let currency = usdRows.length > 0 ? '$' : '';
  for (const pr of pool) {
    const v =
      pr.promotion_id != null && pr.promo_price != null && pr.promo_price !== ''
        ? Number(pr.promo_price)
        : Number(pr.current_price);
    if (v === null || !Number.isFinite(v) || v <= 0) continue;
    if (best === null || v < best) {
      best = v;
      currency = usdRows.length > 0 ? '$' : String(pr.currency ?? '');
    }
  }
  if (best === null) return null;
  return { slug: product.slug as string, name: tr.name as string, price: best, currency };
}

/**
 * SSR block of popular product links, rendered on article/policy pages so they
 * pass crawl equity to product pages. All links appear in the initial HTML.
 */
export async function PopularProducts({ limit = 10 }: { limit?: number }) {
  if (!isSupabaseConfigured()) return null;
  try {
    const rows = (await fetchProducts({ language: 'en', limit: 30 })) as Array<
      Record<string, unknown>
    >;
    const items: PopularItem[] = [];
    const seen = new Set<string>();
    for (const raw of rows) {
      const item = pickLowest(raw);
      if (!item || seen.has(item.slug)) continue;
      seen.add(item.slug);
      items.push(item);
      if (items.length >= limit) break;
    }
    if (items.length === 0) return null;

    return (
      <section aria-label="Popular vape deals" className="mt-12 border-t border-gray-200 pt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Popular Vape Deals</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-3">
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
