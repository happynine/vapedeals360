import { fetchProducts } from '@/lib/database';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import { getServerCurrency } from '@/lib/server-currency';

/**
 * Server-rendered, crawler-readable product index for the home page.
 *
 * The interactive product grid lives in ProductListClient, which suspends
 * during SSR (useSearchParams) and therefore renders only a skeleton into the
 * initial HTML. This section renders the page H1, real product images, names,
 * prices and /product links on the server so non-JS crawlers and affiliate
 * reviewers can read the core deal content, and adds an ItemList JSON-LD block.
 *
 * This lists only products the admin marked as Featured (the home page is a
 * curated deals page), restricted to products that have a live price in the
 * visitor's global currency; products with no price in the selected currency
 * are hidden rather than shown in another currency. Renders nothing (including
 * the H1) when no featured product has a price in the selected currency.
 */
export async function HomeProductIndex() {
  if (!isSupabaseConfigured()) return null;

  const { symbol } = await getServerCurrency();

  let products: Array<Record<string, unknown>> = [];
  try {
    products = (await fetchProducts({
      language: 'en',
      featured: true,
      currency: symbol,
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
      // Strict: only live prices in the visitor's selected currency.
      const valid = prices.filter(
        (pr) =>
          pr.no_quote !== true &&
          pr.in_stock !== false &&
          String(pr.currency ?? '') === symbol
      );
      if (!tr?.name || valid.length === 0) return null;
      let lowest = Infinity;
      for (const pr of valid) {
        const v =
          pr.promotion_id != null && pr.promo_price != null && pr.promo_price !== ''
            ? Number(pr.promo_price)
            : Number(pr.current_price);
        if (Number.isFinite(v) && v > 0 && v < lowest) {
          lowest = v;
        }
      }
      if (!Number.isFinite(lowest)) return null;
      const image =
        (p.home_image_url as string | null) || (p.image_url as string | null) || '';
      return {
        slug: p.slug as string,
        name: tr.name as string,
        price: lowest,
        currency: symbol,
        image,
      };
    })
    .filter(
      (x): x is { slug: string; name: string; price: number; currency: string; image: string } =>
        x !== null,
    );

  if (items.length === 0) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://www.vapedeals360.com/product/${encodeURI(it.slug)}`,
      name: it.name,
      image: it.image || undefined,
    })),
  };

  return (
    <section aria-label="Browse all vape deals" className="mt-12 pt-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
        Best Vape Deals &amp; Price Comparison
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Compare real-time prices on {items.length} vapes across trusted, authorized retailers.
      </p>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-5">
        {items.map((it) => (
          <li key={it.slug}>
            <a
              href={`/product/${encodeURI(it.slug)}`}
              className="group block rounded-2xl border border-gray-200 bg-white p-3 transition hover:border-purple-300 hover:shadow-sm"
            >
              {it.image ? (
                <img
                  src={it.image}
                  alt={`${it.name} — best price comparison`}
                  width={480}
                  height={480}
                  loading="lazy"
                  className="mb-2 aspect-square w-full rounded-xl border border-gray-100 object-cover"
                />
              ) : (
                <div className="mb-2 aspect-square w-full rounded-xl bg-gray-50" />
              )}
              <span className="block truncate text-sm font-medium text-purple-700 group-hover:underline">
                {it.name}
              </span>
              <span className="mt-0.5 block text-sm font-semibold text-gray-900">
                from {it.currency}{it.price.toFixed(2)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
