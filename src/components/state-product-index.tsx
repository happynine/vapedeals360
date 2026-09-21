import { fetchProducts } from '@/lib/database';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import { getServerCurrency } from '@/lib/server-currency';

/**
 * Server-rendered, crawler-readable deal strip reused by the vape-laws Hub and
 * state pages. Mirrors HomeProductIndex: real product names, images, prices
 * and internal /product links are emitted in the initial HTML so these legal
 * pages are not thin/empty shells. State-specific legal filtering belongs to
 * the future compliance engine (PRD 06); until then this presents nationally
 * available deals WITHOUT claiming state-legal eligibility for any product.
 */
export async function StateProductIndex({
  title = 'Popular vapes & deals right now',
  subtitle = 'Compare real-time prices across trusted, authorized retailers. Always confirm the product is legal in your state at checkout.',
  limit = 10,
}: {
  title?: string;
  subtitle?: string;
  limit?: number;
}) {
  if (!isSupabaseConfigured()) return null;

  const { symbol } = await getServerCurrency();

  let products: Array<Record<string, unknown>> = [];
  try {
    products = (await fetchProducts({
      language: 'en',
      limit,
      offset: 0,
      currency: symbol,
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
      const valid = prices.filter(
        (pr) =>
          pr.no_quote !== true &&
          pr.in_stock !== false &&
          String(pr.currency ?? '') === symbol,
      );
      if (!tr?.name || valid.length === 0) return null;
      let lowest = Infinity;
      for (const pr of valid) {
        const v =
          pr.promotion_id != null && pr.promo_price != null && pr.promo_price !== ''
            ? Number(pr.promo_price)
            : Number(pr.current_price);
        if (Number.isFinite(v) && v > 0 && v < lowest) lowest = v;
      }
      if (!Number.isFinite(lowest)) return null;
      const image = (p.home_image_url as string | null) || (p.image_url as string | null) || '';
      return { slug: p.slug as string, name: tr.name as string, price: lowest, image };
    })
    .filter(
      (x): x is { slug: string; name: string; price: number; image: string } => x !== null,
    );

  if (items.length === 0) return null;

  return (
    <section aria-label={title} className="mt-12">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      <ul className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-5">
        {items.map((it) => (
          <li key={it.slug}>
            <a
              href={`/product/${encodeURI(it.slug)}`}
              className="group block rounded-2xl border border-gray-200 bg-white p-3 transition hover:border-purple-300 hover:shadow-sm"
            >
              {it.image ? (
                <img
                  src={it.image}
                  alt={`${it.name} — price comparison`}
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
                from {symbol}
                {it.price.toFixed(2)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
