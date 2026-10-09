import { fetchProducts, fetchCategories } from '@/lib/database';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import { parseStoreCapabilities, canEnterUsZone } from '@/lib/store-capabilities';
import { getStateProductRule } from '@/lib/state-laws';

/**
 * Server-rendered, crawler-readable deal strip reused by the vape-laws Hub and
 * state pages. Real product names, images, USD prices and internal /product
 * links are emitted in the initial HTML.
 *
 * When `stateCode` is provided, a product only appears if it is carried by at
 * least one active US-zone store AND none of its US-zone stores bans that
 * state. In other words, a single retailer flagging the state as banned
 * disqualifies the whole product from the state page — another retailer that
 * still ships there does not keep it listed.
 */
export async function StateProductIndex({
  title = 'Popular vapes & deals right now',
  subtitle = 'Compare real-time prices across trusted, authorized retailers. Always confirm the product is legal in your state at checkout.',
  limit = 10,
  stateCode,
  layout = 'section',
}: {
  title?: string;
  subtitle?: string;
  limit?: number;
  stateCode?: string;
  layout?: 'section' | 'compact';
}) {
  if (!isSupabaseConfigured()) return null;

  // Resolve this state's product-level rule. `suppress` states (e.g. Texas)
  // render no recommendations until separate compliant sourcing is built.
  const stateRule = getStateProductRule(stateCode);
  if (stateRule?.suppress) return null;

  // Build category_id -> slug map once so category-level bans can be enforced.
  let bannedCategoryIds = new Set<number>();
  if (stateRule?.bannedCategorySlugs && stateRule.bannedCategorySlugs.length > 0) {
    try {
      const categories = (await fetchCategories('en')) as Array<{
        id: number;
        slug: string;
      }>;
      bannedCategoryIds = new Set(
        categories
          .filter((c) => stateRule.bannedCategorySlugs!.includes(c.slug))
          .map((c) => c.id),
      );
    } catch {
      // If category lookup fails, fail safe: do not silently over-recommend
      // into a regulated state.
      return null;
    }
  }

  // US state pages always price in USD ('$'), independent of visitor currency.
  const symbol = '$';

  let products: Array<Record<string, unknown>> = [];
  try {
    products = (await fetchProducts({
      language: 'en',
      limit: stateCode ? 100 : limit, // over-fetch so state filtering can still fill `limit`
      offset: 0,
      currency: symbol,
    })) as Array<Record<string, unknown>>;
  } catch {
    return null;
  }
  if (!products || products.length === 0) return null;

  // Classify a store against the US zone:
  // - 'banned': active, US-admitted store that explicitly bans `stateCode`
  // - 'allowed': active, US-admitted store that does not ban `stateCode`
  // - null: inactive or not US-admitted (irrelevant for this state's rule)
  const storeStatus = (store: unknown): 'banned' | 'allowed' | null => {
    if (!store) return null;
    const s = store as Record<string, unknown>;
    if (s.is_active === false) return null;
    const caps = parseStoreCapabilities(s.regions);
    if (!canEnterUsZone(caps)) return null;
    if (stateCode && (caps.banned_states || []).includes(stateCode)) return 'banned';
    return 'allowed';
  };

  const items = products
    .map((p) => {
      // State category-level compliance: drop products whose category is
      // banned in this state (e.g. disposables in California).
      if (bannedCategoryIds.has(Number(p.category_id))) return null;
      const translations = p.translations as Array<{ language: string; name: string }> | undefined;
      const tr = translations?.find((x) => x.language === 'en') || translations?.[0];
      const prices = (p.prices as Array<Record<string, unknown>> | undefined) || [];

      if (stateCode) {
        // A product is disqualified for this state if ANY active US-zone store
        // that carries it has the state in its banned list. Another retailer
        // that still ships there does not keep it listed.
        let hasAllowedStore = false;
        for (const pr of prices) {
          const status = storeStatus(pr.store);
          if (status === 'banned') return null;
          if (status === 'allowed') hasAllowedStore = true;
        }
        if (!hasAllowedStore) return null;
      }

      // Price is sourced only from valid, US-admitted stores that do not ban
      // the state, so the "from $x" figure is one the visitor can actually buy at.
      const valid = prices.filter(
        (pr) =>
          pr.no_quote !== true &&
          pr.in_stock !== false &&
          String(pr.currency ?? '') === symbol &&
          (!stateCode || storeStatus(pr.store) === 'allowed'),
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

  // On state pages, deterministically shuffle the eligible pool seeded by the
  // state code so different states surface different products/orders while a
  // given state stays stable across renders. Hub strips keep source order.
  let pool = items;
  if (stateCode) {
    let h = 1779033703 ^ stateCode.length;
    for (let i = 0; i < stateCode.length; i++) {
      h = Math.imul(h ^ stateCode.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let seed = h >>> 0;
    const rand = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    pool = [...items];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }

  const shown = stateCode ? pool.slice(0, limit) : pool;
  if (shown.length === 0) return null;

  const grid = (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-5">
      {shown.map((it) => (
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
  );

  if (layout === 'compact') {
    return (
      <section aria-label={title} className="mt-5">
        {grid}
      </section>
    );
  }

  return (
    <section aria-label={title} className="mt-12">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      <div className="mt-5">{grid}</div>
    </section>
  );
}
