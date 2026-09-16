import { fetchProducts } from '@/lib/database';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';

/**
 * Server-rendered, crawler-readable product index for the home page.
 *
 * The interactive product grid lives in ProductListClient, which suspends
 * during SSR (useSearchParams) and therefore renders only a skeleton into the
 * initial HTML. This section renders real product names, prices and /product
 * links on the server so non-JS crawlers and affiliate reviewers can read the
 * core deal content, and adds an ItemList JSON-LD block.
 */
export async function HomeProductIndex() {
  if (!isSupabaseConfigured()) return null;

  let products: Array<Record<string, unknown>> = [];
  try {
    products = (await fetchProducts({
      language: 'en',
      limit: 120,
      offset: 0,
    })) as Array<Record<string, unknown>>;
  } catch {
    return null;
  }

  if (!products || products.length === 0) return null;

  const items = products
    .map((p) => {
      const translations = p.translations as Array<{ language: string; name: string }> | undefined;
      const tr = translations?.find((x) => x.language === 'en') || translations?.[0];
      const prices = (p.prices as Array<Record<string, unknown>> | undefined) || [];
      const valid = prices.filter((pr) => pr.no_quote !== true && pr.in_stock !== false);
      if (!tr?.name || valid.length === 0) return null;
      const isUsd = (cur: string) => cur === '$' || cur === 'US$' || cur === 'USD';
      const usdRows = valid.filter((pr) => isUsd(String(pr.currency ?? '$')));
      const pool = usdRows.length > 0 ? usdRows : valid;
      const currency = usdRows.length > 0 ? '$' : '';
      let lowest = Infinity;
      let pickedCurrency = currency;
      for (const pr of pool) {
        const v =
          pr.promotion_id != null && pr.promo_price != null && pr.promo_price !== ''
            ? Number(pr.promo_price)
            : Number(pr.current_price);
        if (Number.isFinite(v) && v > 0 && v < lowest) {
          lowest = v;
          pickedCurrency = usdRows.length > 0 ? '$' : String(pr.currency ?? '');
        }
      }
      if (!Number.isFinite(lowest)) return null;
      return {
        slug: p.slug as string,
        name: tr.name as string,
        price: lowest,
        currency: pickedCurrency,
      };
    })
    .filter((x): x is { slug: string; name: string; price: number; currency: string } => x !== null);

  if (items.length === 0) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://www.vapedeals360.com/product/${it.slug}`,
      name: it.name,
    })),
  };

  return (
    <section aria-label="Browse all vape deals" className="mt-12 border-t border-gray-200 pt-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h2 className="text-xl font-bold text-gray-900 mb-1">Browse Vape Deals</h2>
      <p className="text-sm text-gray-500 mb-5">
        Real-time prices compared across trusted, authorized vape retailers.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-2">
        {items.map((it) => (
          <li key={it.slug} className="flex items-baseline justify-between gap-2 py-1">
            <a
              href={`/product/${it.slug}`}
              className="text-sm text-purple-700 hover:underline truncate"
            >
              {it.name}
            </a>
            <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
              from ${it.currency}${it.price.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
