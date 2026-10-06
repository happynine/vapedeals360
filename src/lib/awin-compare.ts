/**
 * Pure comparison logic between normalized Awin feed items and the current
 * database contents. No I/O here — the route layer fetches rows and passes
 * them in, which keeps this module deterministic and testable.
 *
 * Supports feeds containing multiple advertisers, each mapped to a store +
 * region. Identity matching prefers persisted external ids; same-SKU / same
 * name / fuzzy matches are never auto-trusted and surface as candidates.
 */
import type { NormalizedFeedItem } from './awin-feed';
import type {
  CategoryGroup,
  ChangeKind,
  MatchCandidate,
  PreviewEntry,
  PreviewPrice,
  PreviewPromo,
} from './awin-import-types';
import type { PromoInfo } from './promo-page';
import { productPath } from './promo-page';
import { scoreSimilarity } from './product-similarity';
export interface DbProductRow {
  id: number;
  slug: string;
  image_url: string | null;
  aw_product_id?: string | null;
  merchant_product_id?: string | null;
  name?: string | null; // merged en translation
  description?: string | null; // merged en translation
}
export interface DbPriceRow {
  id: number;
  product_id: number;
  store_id: number;
  current_price: number | string | null;
  original_price?: number | string | null;
  discount_percent?: number | string | null;
  product_url: string | null;
  in_stock: boolean | null;
  currency: string | null;
  region?: string | null;
}
export interface DbCategoryRow {
  id: number;
  slug: string;
  name?: string | null; // merged en translation
}
export interface DbStoreRow {
  id: number;
  slug: string;
  name?: string | null;
  logoUrl?: string | null;
  store_type?: string | null;
}
/** One advertiser's resolved target (store name looked up from catalog). */
export interface AdvertiserTarget {
  advertiserId: string;
  advertiserName: string;
  storeId: number;
  storeName: string;
  region: string;
}
export interface CompareInput {
  /** Every advertiser in the file, already mapped to a store + region. */
  targets: AdvertiserTarget[];
  /** All feed items (all advertisers). */
  feedItems: NormalizedFeedItem[];
  products: DbProductRow[];
  prices: DbPriceRow[];
  categories: DbCategoryRow[];
  /** Catalog stores, used to label which stores sell each candidate product. */
  stores: DbStoreRow[];
  /** External identities already persisted (network, advertiser, awId/sku). */
  externalIds: DbExternalIdRow[];
  /** Promotion info keyed by the store product pathname. */
  promoMap?: Map<string, PromoInfo>;
  /** User-defined feed top-category → internal slug overrides (this session). */
  categoryOverrides?: Record<string, string>;
  /** Persisted category mappings: advertiser_id NULL = global default. */
  savedCategoryMappings?: SavedCategoryMapping[];
}

export interface SavedCategoryMapping {
  advertiser_id: string | null;
  feed_category: string;
  category_slug: string;
}
export interface DbExternalIdRow {
  product_id: number;
  network: string;
  advertiser_id: string;
  aw_product_id: string | null;
  merchant_product_id: string | null;
}
export interface CompareResult {
  entries: PreviewEntry[];
  totals: Record<ChangeKind, number>;
  unmappedCategories: string[];
  categoryGroups: CategoryGroup[];
  categoryOverrides: Record<string, string>;
  promoCount: number;
}
const EMPTY_TOTALS: Record<ChangeKind, number> = {
  new: 0,
  price_changed: 0,
  info_changed: 0,
  unchanged: 0,
  possible_match: 0,
  missing: 0,
};
/** Normalize text for comparison: collapse whitespace, lowercase. */
function normText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}
/** URL-friendly slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
/** Top-level feed category (first segment before / or >), blank when none. */
export function topCategory(value: string): string {
  return (value.split(/[/>]/)[0] || '').trim();
}

/**
 * Collapse a (possibly fine-grained) feed category to one of a fixed set of
 * top-level buckets by keyword. This keeps the importer's category filter to a
 * handful of chips even when the feed exposes subcategories as standalone names
 * (e.g. "Disposable Mango Vapes" -> "Disposable Vapes").
 */
const TOP_CATEGORY_RULES: Array<[RegExp, string]> = [
  // Merchandising collections are not real product types.
  [/best sellers?|new arrivals?|clearance|deals?\b|sale\b|rechargeable\b/, 'Uncategorized'],
  [/disposable|puffs?\b|nicotine pouch|nicotine gum/, 'Disposable Vapes'],
  [/\be-?liquids?\b|vape juices?|freebase|salt nic|nicotine juices?/, 'E-liquids'],
  // 整机/套装优先于 mods、tanks，避免 "box mod kit"、"disposable tank" 被抢走
  [/\bkits?\b|\bpods?\b|pod system|starter kit|vape pen/, 'Vape Kit'],
  [/\btanks?\b|glass replacement|clearomizer|rta\b|rdta\b/, 'Tanks'],
  [/\bmods?\b|box mod|new in hardware/, 'Vape Mods'],
  [/vaporizer|dry herb|concentrate/, 'Vaporizers'],
  [/coil|atomizer|batter|charger|accessor|drip tip|replacement pod|510 thread/, 'Accessories'],
  // Flavored vapes (disposable lines) after the above; "vape juice/flavour"
  // stays an e-liquid via the earlier rule, plain flavor words imply devices.
  [/flavou?red|flavou?rs?/, 'Disposable Vapes'],
];

function normalizeTopCategory(raw: string): string {
  const first = topCategory(raw);
  const text = (first || '').toLowerCase().trim();
  if (!text) return '';
  for (const [re, bucket] of TOP_CATEGORY_RULES) {
    if (re.test(text)) return bucket;
  }
  return first;
}
/** Normalize a category name for matching (take first segment, strip symbols). */
export function categoryKey(value: string): string {
  return normText(topCategory(value));
}
/**
 * Explicit feed-category → internal-slug aliases. These take priority over
 * automatic matching so a feed name without an exact internal counterpart is
 * routed to the intended existing category instead of creating a duplicate.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  'vape kit': 'pod-systems',
  // EightVape Google feed leaves: unambiguous consumable hardware.
  coils: 'accessories',
};

/**
 * Advertiser-specific leaf aliases. EightVape's (86487) Google feed maps odd
 * Google taxonomy leaves to products whose real type only the store context
 * reveals (verified title-by-title). Kept per-advertiser so other feeds that
 * reuse the same leaf names are never affected.
 */
const PER_ADV_ALIASES: Record<string, Record<string, string>> = {
  '86487': {
    hardware: 'pod-systems', // 8/8 pod kits
    'electronic cigarettes': 'pod-systems', // 214/269 devices
    'food, beverages & tobacco': 'e-liquids', // vape juice rows
    'vaporisers & electronic cigarettes': 'e-liquids', // 148/148 juice titles
    'baking mixes': 'e-liquids', // Dinner Lady salts
    'sweets & chocolate': 'e-liquids', // VGOD nic salts
  },
};

/**
 * Title-level category guess, used as a last resort when the feed provides no
 * usable category (e.g. EightVape's Google feed leaves google_product_category
 * empty on ~90% of rows and the few values are noisy). Generic rules only —
 * brand-specific names are not hardcoded — so this stays safe for other feeds.
 */
const TITLE_NON_PRODUCT =
  /gift\s*card|wish list|creation and sharing|excise|nicotine\s*tax|e-?cig\s*tax|vapor\s*tax|signature\s*fee|red envelopes?|package\s*protection|shipping|\btax\b|\bfee\b/i;
const TITLE_ELIQUID_STRONG =
  /vape\s*juice|e-?juice|e-?liquid|nic(?:otine)?\s*salts?|\bsalts?\b|vape\s*liquid/i;
const TITLE_ACCESSORY =
  /\bcoils?\b|replacement|\brta\b|\brda\b|\brba\b|\btanks?\b|\bglass\b|atomizer|cartridge|drip\s*tip|charger|\bbatteries?\b|adapter|o-?rings?|silicone|\bmouthpiece\b|(?:vape|organic)?\s*cotton\s*bacon|\bvape\s*cotton\b|organic\s*cotton|unicorn\s*bottles?|empty\s*bottles?|\bbottles?\b|t-?shirt|\bhoodies?\b|\bcaps?\b|\bbeanie\b|socks?|keychain|key\s*ring|lanyard|mouse\s*pad|fridge\s*magnet|wallet|backpack|tote|cotton\s*bag|\bcable\b|tea\s*set|scented\s*card|\bpillow\b|\bbag\b|\bpods?\b\s*[(（](?:(?!require battery)[\s\S])*?(?:pack|pcs|cartridge|empty|coil|\d+(?:\.\d+)?\s*ohm)|\bpods?\b[^.;]{0,60}?(?:pack|pcs|cartridge|empty|replacement)/i;
const TITLE_VOLUME = /\d+(?:\.\d+)?\s?ml\b/i;
const TITLE_DISPOSABLE =
  /dispos[ao]?b?a?l?e?|diposable|\bpuffs?\b|\b\d{2,3}k\b(?:[^.;]{0,30}?puffs)?/i;
const TITLE_BOXMOD = /box\s*mod/i;
const TITLE_DEVICE = /\bmod\b|\bkit\b|\bsystem\b|\bpen\b|\bpods?\b|\bdevice\b/i;

export function guessCategoryFromTitle(
  title: string,
  categories: DbCategoryRow[],
): string | null {
  if (!title || TITLE_NON_PRODUCT.test(title)) return null;
  const slug: string | null = TITLE_ELIQUID_STRONG.test(title)
    ? 'e-liquids'
    : TITLE_ACCESSORY.test(title)
      ? 'accessories'
      : TITLE_VOLUME.test(title)
        ? 'e-liquids'
        : TITLE_DISPOSABLE.test(title)
          ? 'disposable-vapes'
          : TITLE_BOXMOD.test(title)
            ? 'box-mods'
            : TITLE_DEVICE.test(title)
              ? 'pod-systems'
              : null;
  if (slug && categories.some((c) => c.slug === slug)) return slug;
  return null;
}
/**
 * Resolve one saved slug for a key across per-advertiser then global scope.
 */
function savedSlug(
  key: string,
  advertiserId: string,
  savedByAdv: Map<string, Map<string, string>>,
  savedGlobal: Map<string, string>,
): string | null {
  const perAdv = savedByAdv.get(advertiserId);
  if (perAdv?.has(key)) return perAdv.get(key) as string;
  if (savedGlobal.has(key)) return savedGlobal.get(key) as string;
  return null;
}

/**
 * Built-in guess for one category key (alias → exact → loose containment).
 * Returns null when nothing fits. Advertiser-specific aliases take priority
 * when an advertiserId is supplied.
 */
export function autoGuessCategory(
  key: string,
  categories: DbCategoryRow[],
  advertiserId?: string,
): string | null {
  if (!key) return null;
  const perAdv = advertiserId ? PER_ADV_ALIASES[advertiserId]?.[key] : undefined;
  if (perAdv && categories.some((c) => c.slug === perAdv)) return perAdv;
  const alias = CATEGORY_ALIASES[key];
  if (alias && categories.some((c) => c.slug === alias)) return alias;
  for (const c of categories) {
    if (categoryKey(c.slug) === key) return c.slug;
    if (categoryKey(c.name || '') === key) return c.slug;
  }
  for (const c of categories) {
    const cKey = categoryKey(c.name || c.slug);
    if (cKey && (key.includes(cKey) || cKey.includes(key))) return c.slug;
  }
  return null;
}

/**
 * Map a feed product to an internal category slug.
 *
 * Mapping is keyed on the store's own RAW top-level category (so every
 * advertiser keeps a distinct set); the normalized bucket only serves the
 * filter chips and acts as a fallback.
 *
 * Priority per stage (raw key, then normalized key):
 *   this-session override → saved per-advertiser/global mapping → built-in guess.
 */
function mapCategory(
  rawKey: string,
  normalizedKey: string,
  categories: DbCategoryRow[],
  overrides: Record<string, string> | undefined,
  advertiserId: string,
  savedByAdv: Map<string, Map<string, string>>,
  savedGlobal: Map<string, string>,
): string | null {
  const valid = (slug: string | undefined | null): boolean =>
    !!slug && categories.some((c) => c.slug === slug);

  for (const key of [rawKey, normalizedKey]) {
    if (!key) continue;
    if (overrides && valid(overrides[key])) return overrides[key] as string;
    const saved = savedSlug(key, advertiserId, savedByAdv, savedGlobal);
    if (valid(saved)) return saved as string;
  }
  // No saved/override hit: auto-guess raw first, then normalized.
  const guessRaw = autoGuessCategory(rawKey, categories, advertiserId);
  if (guessRaw) return guessRaw;
  return autoGuessCategory(normalizedKey, categories, advertiserId);
}
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}
function toPreviewPromo(p: PromoInfo): PreviewPromo {
  return {
    currentPrice: p.currentPrice,
    originalPrice: p.originalPrice,
    couponCode: p.couponCode,
    sourceUrl: p.sourceUrl,
  };
}

/**
 * Build a preview comparing feed items against DB state across every mapped
 * advertiser. Each advertiser resolves to a store + region, so price lookup and
 * the missing scan are scoped to that (store, region) tuple.
 */
export function buildPreview(input: CompareInput): CompareResult {
  const {
    targets,
    feedItems,
    products,
    prices,
    categories,
    stores,
    externalIds,
    promoMap,
    categoryOverrides,
    savedCategoryMappings,
  } = input;

  // Persisted category mappings: per-advertiser overrides + global defaults.
  const savedByAdv = new Map<string, Map<string, string>>();
  const savedGlobal = new Map<string, string>();
  for (const m of savedCategoryMappings ?? []) {
    const key = categoryKey(m.feed_category);
    if (!key) continue;
    if (m.advertiser_id) {
      const bucket = savedByAdv.get(m.advertiser_id) ?? new Map<string, string>();
      bucket.set(key, m.category_slug);
      savedByAdv.set(m.advertiser_id, bucket);
    } else {
      savedGlobal.set(key, m.category_slug);
    }
  }

  const targetsByAdv = new Map<string, AdvertiserTarget>(
    targets.map((t) => [t.advertiserId, t]),
  );
  // Any advertiser feeding each store (used to look up that store's SKU).
  const advsByStore = new Map<number, string[]>();
  for (const t of targets) {
    const list = advsByStore.get(t.storeId) ?? [];
    if (!list.includes(t.advertiserId)) list.push(t.advertiserId);
    advsByStore.set(t.storeId, list);
  };

  // --- Product identity indexes ------------------------------------------------
  const byMerchantSku = new Map<string, DbProductRow>();
  const byName = new Map<string, DbProductRow>();
  for (const p of products) {
    if (p.merchant_product_id) byMerchantSku.set(normText(p.merchant_product_id), p);
    if (p.name) byName.set(normText(p.name), p);
  }

  // Persisted external identities:
  //  (advertiser, aw_product_id) -> product   [only safe auto-match]
  //  merchant SKU -> products                 [cross-merchant same-product hint]
  const extByAdvAw = new Map<string, DbProductRow>();
  const productById = new Map<number, DbProductRow>(products.map((p) => [p.id, p]));
  const extByMerchantSku = new Map<string, DbProductRow[]>();
  // Known per-store SKU: (product, store) -> merchant_product_id.
  const extSkuByProductStore = new Map<string, string>();
  for (const e of externalIds) {
    const p = productById.get(e.product_id);
    if (!p) continue;
    if (e.aw_product_id) {
      extByAdvAw.set(`${e.advertiser_id}::${normText(e.aw_product_id)}`, p);
    }
    if (e.merchant_product_id) {
      const key = normText(e.merchant_product_id);
      const list = extByMerchantSku.get(key) ?? [];
      if (!list.some((x) => x.id === p.id)) list.push(p);
      extByMerchantSku.set(key, list);
      extSkuByProductStore.set(`${e.product_id}::${e.advertiser_id}`, e.merchant_product_id);
    }
  }

  // --- Price + store helpers ---------------------------------------------------
  const storesById = new Map<number, DbStoreRow>(stores.map((s) => [s.id, s]));
  const storeName = (id: number): string => {
    const s = storesById.get(id);
    return s?.name || s?.slug || `Store #${id}`;
  };
  // All (store, region) pairs selling each product. Same store in a different
  // region counts as a separate marketplace for candidate classification.
  const sellingByProduct = new Map<number, Array<{ storeId: number; region: string }>>();
  for (const pr of prices) {
    const list = sellingByProduct.get(pr.product_id) ?? [];
    const region = pr.region ?? '';
    if (!list.some((x) => x.storeId === pr.store_id && x.region === region)) {
      list.push({ storeId: pr.store_id, region });
    }
    sellingByProduct.set(pr.product_id, list);
  }
  // Every price row per product (used to render each store's current offer).
  const allPricesByProduct = new Map<number, DbPriceRow[]>();
  for (const pr of prices) {
    const list = allPricesByProduct.get(pr.product_id) ?? [];
    list.push(pr);
    allPricesByProduct.set(pr.product_id, list);
  }
  // Existing price rows keyed by (product, store, region).
  const priceKeyOf = (productId: number, storeId: number, region: string) =>
    `${productId}::${storeId}::${region}`;
  const pricesByKey = new Map<string, DbPriceRow[]>();
  for (const pr of prices) {
    const key = priceKeyOf(pr.product_id, pr.store_id, pr.region ?? '');
    const list = pricesByKey.get(key) ?? [];
    list.push(pr);
    pricesByKey.set(key, list);
  }

  const toCandidate = (
    p: DbProductRow,
    score: number,
    level: 'strong' | 'possible',
    targetStoreId: number,
    targetRegion: string,
  ): MatchCandidate => {
    // Other marketplaces = any (store, region) other than this very target.
    const others = (sellingByProduct.get(p.id) ?? []).filter(
      (x) => !(x.storeId === targetStoreId && x.region === targetRegion),
    );
    const sellingIds: number[] = [];
    for (const x of others) if (!sellingIds.includes(x.storeId)) sellingIds.push(x.storeId);
    // Existing per-store offers (all rows for this product), for column B.
    const storePrices = (allPricesByProduct.get(p.id) ?? []).map((pr) => {
      const s = storesById.get(pr.store_id);
      const advId = (advsByStore.get(pr.store_id) ?? [])[0] ?? '';
      let sku: string | null = null;
      if (advId) sku = extSkuByProductStore.get(`${p.id}::${advId}`) ?? null;
      return {
        storeId: pr.store_id,
        storeName: storeName(pr.store_id),
        logoUrl: s?.logoUrl ?? null,
        region: pr.region ?? '',
        price: toNumber(pr.current_price),
        originalPrice: toNumber(pr.original_price ?? null),
        discountPercent: toNumber(pr.discount_percent ?? null),
        currency: pr.currency || '',
        inStock: pr.in_stock ?? true,
        productUrl: pr.product_url ?? null,
        sku,
      };
    });
    return {
      productId: p.id,
      slug: p.slug,
      name: p.name || p.slug,
      imageUrl: p.image_url,
      description: p.description ?? null,
      score,
      level,
      source: others.length > 0 ? 'cross_store' : 'internal',
      sellingStores: sellingIds.map((sid) => {
        const s = storesById.get(sid);
        return { id: sid, name: storeName(sid), logoUrl: s?.logoUrl ?? null };
      }),
      storePrices,
    };
  };

  const entries: PreviewEntry[] = [];
  // Canonical product ids matched per advertiser (hard match) — feeds it.
  const hardMatchedByAdv = new Map<string, Set<number>>();
  // Global guard: never emit a duplicate entry for the same physical product
  // target (advertiser + aw id), even if advertiser id is blank across rows.
  const seenFeedKeys = new Set<string>();
  const unmapped = new Set<string>();
  const usedSlugs = new Set<string>(products.map((p) => p.slug));

  const makePrice = (
    t: AdvertiserTarget,
    oldRow: DbPriceRow | null,
    item: NormalizedFeedItem,
  ): PreviewPrice => ({
    priceId: oldRow?.id ?? null,
    storeId: t.storeId,
    storeName: t.storeName,
    region: t.region,
    oldPrice: toNumber(oldRow?.current_price ?? null),
    newPrice: item.price,
    oldOriginalPrice: toNumber(oldRow?.original_price ?? null),
    newOriginalPrice: item.rrpPrice ?? toNumber(oldRow?.original_price ?? null),
    currency: item.currency,
    oldUrl: oldRow?.product_url ?? null,
    newUrl: item.deepLink || oldRow?.product_url || null,
    inStock: item.inStock,
  });

  for (const item of feedItems) {
    const advId = item.merchantId || item.merchantName || 'unknown';
    const t = targetsByAdv.get(advId);
    // Items whose advertiser wasn't mapped are skipped here (listed separately).
    if (!t) continue;

    const dedupeKey = `${advId}::${item.merchantProductId || item.awProductId}`;
    if (dedupeKey !== '::') {
      if (seenFeedKeys.has(dedupeKey)) continue;
      seenFeedKeys.add(dedupeKey);
    }

    const rawTop = topCategory(item.category);
    const rawKey = categoryKey(rawTop);
    const feedCategory = normalizeTopCategory(item.category);
    const extraBuckets: string[] = [];
    const extraRaw: string[] = [];
    for (const extraRawCat of item.extraCategories ?? []) {
      const bucket = normalizeTopCategory(extraRawCat);
      if (bucket && bucket !== feedCategory && !extraBuckets.includes(bucket)) {
        extraBuckets.push(bucket);
      }
      const rk = categoryKey(topCategory(extraRawCat));
      if (rk && rk !== rawKey && !extraRaw.includes(rk)) {
        extraRaw.push(rk);
      }
    }
    const promo =
      (promoMap && item.merchantUrl && promoMap.get(productPath(item.merchantUrl))) ||
      null;
    let categorySlug = mapCategory(
      rawKey,
      categoryKey(feedCategory),
      categories,
      categoryOverrides,
      advId,
      savedByAdv,
      savedGlobal,
    );
    // Feed carries a leaf but it gives no usable slug: a strong title signal
    // is still better than a synthetic "new category" slug (e.g. EightVape
    // "Gift Boxes and Tins" that are actually disposable mystery boxes).
    if (!categorySlug) {
      categorySlug = guessCategoryFromTitle(item.name, categories);
    }
    if (!categorySlug && rawKey) {
      categorySlug = slugify(rawTop);
      unmapped.add(rawTop);
    }
    if (!categorySlug) categorySlug = 'uncategorized';

    // ① Only a persisted external id (this advertiser + this aw id) auto-matches.
    const hard =
      (item.awProductId &&
        extByAdvAw.get(`${advId}::${normText(item.awProductId)}`)) ||
      null;

    if (hard) {
      let set = hardMatchedByAdv.get(advId);
      if (!set) {
        set = new Set();
        hardMatchedByAdv.set(advId, set);
      }
      set.add(hard.id);

      const oldRows =
        pricesByKey.get(priceKeyOf(hard.id, t.storeId, t.region)) ?? [];
      const oldRow = oldRows[0] ?? null;
      const oldPrice = toNumber(oldRow?.current_price ?? null);
      const priceChanged =
        item.price !== null && oldPrice !== null && item.price !== oldPrice;
      const linkChanged =
        !!item.deepLink &&
        !!oldRow?.product_url &&
        normText(oldRow.product_url) !== normText(item.deepLink);
      const priceMissingBefore = oldRow === null && item.price !== null;
      const nameChanged =
        !!hard.name && normText(hard.name) !== normText(item.name);
      const descChanged =
        !!hard.description &&
        normText(hard.description) !== normText(item.description);
      const imageChanged =
        !!hard.image_url &&
        normText(hard.image_url) !== normText(item.imageUrl);
      let kind: ChangeKind;
      if (priceChanged || linkChanged || priceMissingBefore) kind = 'price_changed';
      else if (nameChanged || descChanged || imageChanged) kind = 'info_changed';
      else kind = 'unchanged';

      entries.push({
        key: `p-${advId}-${hard.id}`,
        kind,
        selected: false,
        advertiserId: advId,
        advertiserName: item.merchantName,
        awProductId: item.awProductId,
        merchantProductId: item.merchantProductId,
        productId: hard.id,
        slug: hard.slug,
        name: item.name || hard.name || '',
        oldName: hard.name ?? null,
        description: item.description || hard.description || '',
        oldDescription: hard.description ?? null,
        imageUrl: item.imageUrl || hard.image_url || '',
        oldImageUrl: hard.image_url ?? null,
        category: categorySlug,
        categoryLabel: item.category || categorySlug,
        feedCategory,
        rawFeedCategory: rawTop,
        extraFeedCategories: extraBuckets,
        extraRawFeedCategories: extraRaw,
        promo: promo ? toPreviewPromo(promo) : null,
        brand: item.brand,
        matchCandidates: [],
        prices: [makePrice(t, oldRow, item)],
      });
    } else {
      // Not an established identity → candidates, never pre-selected.
      const candidateIds = new Set<number>();
      const candidates: MatchCandidate[] = [];
      const pushCandidate = (
        p: DbProductRow,
        score: number,
        level: 'strong' | 'possible',
      ) => {
        if (candidateIds.has(p.id)) return;
        candidateIds.add(p.id);
        candidates.push(toCandidate(p, score, level, t.storeId, t.region));
      };
      // ② Same merchant (factory) SKU → strong cross-merchant hint.
      if (item.merchantProductId) {
        for (const p of extByMerchantSku.get(normText(item.merchantProductId)) ?? []) {
          pushCandidate(p, 0.95, 'strong');
        }
        const bySku = byMerchantSku.get(normText(item.merchantProductId));
        if (bySku) pushCandidate(bySku, 0.9, 'strong');
      }
      // ③ Exact name → strong, still needs confirmation.
      if (item.name) {
        const exact = byName.get(normText(item.name));
        if (exact) pushCandidate(exact, 0.8, 'strong');
      }
      // ④ Fuzzy similarity.
      for (const p of products) {
        if (candidateIds.has(p.id)) continue;
        const r = scoreSimilarity(item.name, p.name || p.slug);
        if (r.level === 'none') continue;
        pushCandidate(p, r.score, r.level === 'strong' ? 0.78 : r.score);
      }
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0] ?? null;
      const kind: ChangeKind = best ? 'possible_match' : 'new';

      // Unique slug for the new product.
      const baseSlug =
        slugify(item.name) ||
        (item.merchantProductId ? slugify(item.merchantProductId) : '') ||
        `awin-${item.awProductId || advId}`;
      let slug = baseSlug;
      let n = 2;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${n}`;
        n++;
      }
      usedSlugs.add(slug);

      entries.push({
        key: `n-${advId}-${item.awProductId || slug}`,
        kind,
        selected: false,
        advertiserId: item.merchantId,
        advertiserName: item.merchantName,
        awProductId: item.awProductId,
        merchantProductId: item.merchantProductId,
        productId: null,
        slug,
        name: item.name,
        oldName: null,
        description: item.description,
        oldDescription: null,
        imageUrl: item.imageUrl,
        oldImageUrl: null,
        category: categorySlug,
        categoryLabel: item.category || categorySlug,
        feedCategory,
        rawFeedCategory: rawTop,
        extraFeedCategories: extraBuckets,
        extraRawFeedCategories: extraRaw,
        promo: promo ? toPreviewPromo(promo) : null,
        brand: item.brand,
        matchCandidates: candidates.slice(0, 6),
        prices: [makePrice(t, null, item)],
      });
    }
  }

  // --- Missing: per advertiser (store + region), existing rows absent in feed --
  for (const t of targets) {
    const hardSet = hardMatchedByAdv.get(t.advertiserId) ?? new Set<number>();
    // Every existing price row in this (store, region).
    for (const pr of prices) {
      if (pr.store_id !== t.storeId) continue;
      if ((pr.region ?? '') !== t.region) continue;
      if (hardSet.has(pr.product_id)) continue;
      const product = productById.get(pr.product_id);
      if (!product) continue;
      const key = `m-${t.advertiserId}-${pr.id}`;
      if (entries.some((e) => e.key === key)) continue;
      entries.push({
        key,
        kind: 'missing',
        selected: false,
        advertiserId: t.advertiserId,
        advertiserName: t.advertiserName,
        awProductId: product.aw_product_id || '',
        merchantProductId: product.merchant_product_id || '',
        productId: product.id,
        slug: product.slug,
        name: product.name || '',
        oldName: product.name ?? null,
        description: product.description || '',
        oldDescription: product.description ?? null,
        imageUrl: product.image_url || '',
        oldImageUrl: product.image_url ?? null,
        category: '',
        categoryLabel: '',
        feedCategory: '',
        rawFeedCategory: '',
        extraFeedCategories: [],
        extraRawFeedCategories: [],
        promo: null,
        brand: '',
        matchCandidates: [],
        prices: [
          {
            priceId: pr.id,
            storeId: t.storeId,
            storeName: t.storeName,
            region: t.region,
            oldPrice: toNumber(pr.current_price),
            newPrice: null,
            currency: pr.currency || '',
            oldUrl: pr.product_url,
            newUrl: null,
            inStock: pr.in_stock ?? true,
          },
        ],
      });
    }
  }

  // --- Aggregate totals + category groups --------------------------------------
  const totals = { ...EMPTY_TOTALS };
  for (const e of entries) totals[e.kind]++;
  const groupOrder: string[] = [];
  const groupCount = new Map<string, number>();
  const groupPromo = new Map<string, number>();
  for (const e of entries) {
    if (e.kind === 'missing') continue;
    const buckets = [e.feedCategory || 'Uncategorized', ...e.extraFeedCategories];
    for (const labelRaw of buckets) {
      const label = labelRaw || 'Uncategorized';
      if (!groupCount.has(label)) {
        groupCount.set(label, 0);
        groupPromo.set(label, 0);
        groupOrder.push(label);
      }
      groupCount.set(label, (groupCount.get(label) ?? 0) + 1);
      if (e.promo) groupPromo.set(label, (groupPromo.get(label) ?? 0) + 1);
    }
  }
  const categoryGroups: CategoryGroup[] = groupOrder.map((label) => ({
    key: label === 'Uncategorized' ? '' : label,
    label,
    count: groupCount.get(label) ?? 0,
    promoCount: groupPromo.get(label) ?? 0,
  }));
  const promoCount = entries.filter((e) => e.promo).length;
  return {
    entries,
    totals,
    unmappedCategories: Array.from(unmapped),
    categoryGroups,
    categoryOverrides: categoryOverrides ?? {},
    promoCount,
  };
}
