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
  /** User-defined feed top-category → internal slug overrides. */
  categoryOverrides?: Record<string, string>;
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
function categoryKey(value: string): string {
  return normText(topCategory(value));
}
/**
 * Explicit feed-category → internal-slug aliases. These take priority over
 * automatic matching so a feed name without an exact internal counterpart is
 * routed to the intended existing category instead of creating a duplicate.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  'vape kit': 'pod-systems',
};
/**
 * Map a feed category string to an internal category slug using existing
 * database categories. Returns null when no confident match exists.
 */
function mapCategory(
  feedCategory: string,
  categories: DbCategoryRow[],
  overrides?: Record<string, string>,
): string | null {
  const key = categoryKey(feedCategory);
  if (!key) return null;
  // 0. User-defined override (highest priority; target must exist).
  if (overrides) {
    const override = overrides[key];
    if (override && categories.some((c) => c.slug === override)) return override;
  }
  // 1. Explicit built-in alias (only when the target category actually exists).
  const alias = CATEGORY_ALIASES[key];
  if (alias && categories.some((c) => c.slug === alias)) return alias;
  for (const c of categories) {
    if (categoryKey(c.slug) === key) return c.slug;
    if (categoryKey(c.name || '') === key) return c.slug;
  }
  // Loose containment match (e.g. "disposable vapes" vs "disposable").
  for (const c of categories) {
    const cKey = categoryKey(c.name || c.slug);
    if (cKey && (key.includes(cKey) || cKey.includes(key))) return c.slug;
  }
  return null;
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
  } = input;

  const targetsByAdv = new Map<string, AdvertiserTarget>(
    targets.map((t) => [t.advertiserId, t]),
  );

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
    }
  }

  // --- Price + store helpers ---------------------------------------------------
  const storesById = new Map<number, DbStoreRow>(stores.map((s) => [s.id, s]));
  const storeName = (id: number): string => {
    const s = storesById.get(id);
    return s?.name || s?.slug || `Store #${id}`;
  };
  // All stores selling each product (candidate source classification).
  const storesByProduct = new Map<number, number[]>();
  for (const pr of prices) {
    const list = storesByProduct.get(pr.product_id) ?? [];
    if (!list.includes(pr.store_id)) list.push(pr.store_id);
    storesByProduct.set(pr.product_id, list);
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
  ): MatchCandidate => {
    const sellingIds = (storesByProduct.get(p.id) ?? []).filter(
      (sid) => sid !== targetStoreId,
    );
    return {
      productId: p.id,
      slug: p.slug,
      name: p.name || p.slug,
      imageUrl: p.image_url,
      score,
      level,
      source: sellingIds.length > 0 ? 'cross_store' : 'internal',
      sellingStores: sellingIds.map((sid) => ({ id: sid, name: storeName(sid) })),
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

    const feedCategory = normalizeTopCategory(item.category);
    const extraBuckets: string[] = [];
    for (const extraRaw of item.extraCategories ?? []) {
      const bucket = normalizeTopCategory(extraRaw);
      if (bucket && bucket !== feedCategory && !extraBuckets.includes(bucket)) {
        extraBuckets.push(bucket);
      }
    }
    const promo =
      (promoMap && item.merchantUrl && promoMap.get(productPath(item.merchantUrl))) ||
      null;
    const mappedFrom = feedCategory || item.category;
    let categorySlug = mapCategory(mappedFrom, categories, categoryOverrides);
    if (!categorySlug && mappedFrom) {
      categorySlug = slugify(mappedFrom);
      unmapped.add(mappedFrom);
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
        extraFeedCategories: extraBuckets,
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
        candidates.push(toCandidate(p, score, level, t.storeId));
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
        extraFeedCategories: extraBuckets,
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
        extraFeedCategories: [],
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
