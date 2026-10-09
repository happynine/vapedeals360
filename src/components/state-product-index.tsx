import { fetchProducts, fetchCategories } from '@/lib/database';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import { parseStoreCapabilities, canEnterUsZone } from '@/lib/store-capabilities';
import { getStateProductRule } from '@/lib/state-laws';
import { cleanAffiliateUrl } from '@/lib/seo';

/**
 * Server-rendered, crawler-readable deal strip reused by the vape-laws Hub and
 * state pages. Real product names, images, USD prices and internal /product
 * links are emitted in the initial HTML.
 *
 * When `stateCode` is provided, filtering is done at the STORE level:
 *  - a store that bans the state is simply dropped — none of its products
 *    appear on that state page;
 *  - a product is still recommended as long as at least one OTHER active
 *    US-zone store that does not ban the state carries it.
 * Each card lists the stores it is available from (logo, name, price, Buy),
 * mirroring the cards on /vape-laws.
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

  const storeName = (store: Record<string, unknown>): string => {
    const trs = store.store_translations as Array<{ language: string; name: string }> | undefined;
    return trs?.find((x) => x.language === 'en')?.name || trs?.[0]?.name || (store.slug as string) || 'Store';
  };

  const offerValue = (pr: Record<string, unknown>): number => {
    const v =
      pr.promotion_id != null && pr.promo_price != null && pr.promo_price !== ''
        ? Number(pr.promo_price)
        : Number(pr.current_price);
    return Number.isFinite(v) && v > 0 ? v : NaN;
  };

  interface StoreOffer {
    name: string;
    logo: string | null;
    url: string;
    price: number;
  }

  const items = products
    .map((p) => {
      // State category-level compliance: drop products whose category is
      // banned in this state (e.g. disposables in California).
      if (bannedCategoryIds.has(Number(p.category_id))) return null;
      const translations = p.translations as Array<{ language: string; name: string }> | undefined;
      const tr = translations?.find((x) => x.language === 'en') || translations?.[0];
      const prices = (p.prices as Array<Record<string, unknown>> | undefined) || [];

      // Store-level filtering: a store that bans the state is dropped, but the
      // product still qualifies if at least one other active US-zone store
      // (which does not ban the state) sells it.
      const offers: StoreOffer[] = [];
      for (const pr of prices) {
        if (pr.no_quote === true || pr.in_stock === false || String(pr.currency ?? '') !== symbol) continue;
        const status = storeStatus(pr.store);
        if (status !== 'allowed') continue;
        const price = offerValue(pr);
        if (!Number.isFinite(price)) continue;
        const store = (pr.store || {}) as Record<string, unknown>;
        const logo = (store.logo_url as string | null) || null;
        offers.push({
          name: storeName(store),
          logo,
          url: (pr.product_url as string) || '',
          price,
        });
      }
      if (!tr?.name || offers.length === 0) return null;

      offers.sort((a, b) => a.price - b.price);
      const image = (p.home_image_url as string | null) || (p.image_url as string | null) || '';
      return {
        slug: p.slug as string,
        name: tr.name as string,
        image,
        lowest: offers[0].price,
        stores: offers,
      };
    })
    .filter(
      (
        x,
      ): x is {
        slug: string;
        name: string;
        image: string;
        lowest: number;
        stores: StoreOffer[];
      } => x !== null,
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

  // Compact strips on the laws Hub show one store row each; the full section
  // on state pages shows up to two. Cards stay server-rendered (no JS needed).
  const maxStoreRows = layout === 'compact' ? 1 : 2;

  const logoSrc = (logo: string | null): string | null => {
    if (!logo) return null;
    if (logo.startsWith('http')) return logo;
    return `/api/image?key=${encodeURIComponent(logo)}`;
  };

  const grid = (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-5">
      {shown.map((it) => (
        <li key={it.slug}>
          <div className="group h-full rounded-2xl border border-gray-200 bg-white p-3 transition hover:border-purple-300 hover:shadow-sm">
            <a href={`/product/${encodeURI(it.slug)}`}>
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
            </a>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-gray-900">
                {symbol}
                {it.lowest.toFixed(2)}
              </span>
              {it.stores.length >= 2 && (
                <span className="text-[10px] font-medium text-emerald-600">Lowest</span>
              )}
            </div>

            {/* Store rows: logo + name + price + Buy (only state-allowed stores) */}
            <div className="mt-2 space-y-1.5">
              {it.stores.slice(0, maxStoreRows).map((s, i) => {
                const logo = logoSrc(s.logo);
                const buyHref = cleanAffiliateUrl(s.url);
                return (
                  <div
                    key={`${it.slug}-${s.name}-${i}`}
                    className="flex items-center justify-between gap-1.5 rounded-lg bg-gray-50 px-2 py-1"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-purple-50">
                        {logo ? (
                          <img src={logo} alt="" loading="lazy" className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-[9px] font-bold text-purple-600">
                            {s.name.charAt(0) || '?'}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-[11px] text-gray-500">{s.name}</span>
                    </div>
                    <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-emerald-600">
                      {symbol}
                      {s.price.toFixed(2)}
                    </span>
                    {buyHref ? (
                      <a
                        href={buyHref}
                        target="_blank"
                        rel="sponsored nofollow noopener noreferrer"
                        className="flex-shrink-0 rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 transition-colors hover:bg-purple-700 hover:text-white"
                      >
                        Buy
                      </a>
                    ) : null}
                  </div>
                );
              })}
              {it.stores.length > maxStoreRows && (
                <a
                  href={`/product/${encodeURI(it.slug)}`}
                  className="block py-0.5 text-center text-[11px] text-purple-700 hover:underline"
                >
                  View all {it.stores.length} stores
                </a>
              )}
            </div>
          </div>
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
