/**
 * Pure comparison logic between normalized Awin feed items and the current
 * database contents. No I/O here — the route layer fetches rows and passes
 * them in, which keeps this module deterministic and testable.
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
export interface CompareInput {
  advertiserId: string;
  advertiserName: string;
  targetStoreId: number;
  targetStoreName: string;
  /** Region within the target store this feed maps to (USA / UK / Japan). */
  targetRegion: string;
  feedItems: NormalizedFeedItem[];
  products: DbProductRow[];
  prices: DbPriceRow[];
  categories: DbCategoryRow[];
  /** Catalog stores, used to label which stores sell each candidate product. */
  stores: DbStoreRow[];
  /** Promotion info keyed by the store product pathname. */
  promoMap?: Map<string, PromoInfo>;
  /** User-defined feed top-category → internal slug overrides. */
  categoryOverrides?: Record<string, string>;
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
 * Build a preview comparing feed items against DB state for one advertiser.
 */
export function buildPreview(input: CompareInput): CompareResult {
  const {
    targetStoreId,
    targetRegion,
    feedItems,
    products,
    prices,
    categories,
    stores,
    promoMap,
    categoryOverrides,
  } = input;
  // Indexes of existing products.
  const byMerchantSku = new Map<string, DbProductRow>();
  const byAwId = new Map<string, DbProductRow>();
  const byName = new Map<string, DbProductRow>();
  for (const p of products) {
    if (p.merchant_product_id) {
      byMerchantSku.set(normText(p.merchant_product_id), p);
    }
    if (p.aw_product_id) {
      byAwId.set(normText(p.aw_product_id), p);
    }
    if (p.name) {
      byName.set(normText(p.name), p);
    }
  }
  // Existing prices at the target advertiser store + target region, grouped by
  // product. Each region has its own price row, so UK feed must not touch USA.
  const pricesByProduct = new Map<number, DbPriceRow[]>();
  for (const pr of prices) {
    if (pr.store_id !== targetStoreId) continue;
    if ((pr.region ?? '') !== targetRegion) continue;
    const list = pricesByProduct.get(pr.product_id) ?? [];
    list.push(pr);
    pricesByProduct.set(pr.product_id, list);
  }
  // Store lookup + the full set of stores selling each product (all stores,
  // not just the target), used to classify candidates as cross-store/internal.
  const storesById = new Map<number, DbStoreRow>(stores.map((s) => [s.id, s]));
  const storeName = (id: number): string => {
    const s = storesById.get(id);
    return s?.name || s?.slug || `Store #${id}`;
  };
  const storesByProduct = new Map<number, number[]>();
  for (const pr of prices) {
    const list = storesByProduct.get(pr.product_id) ?? [];
    if (!list.includes(pr.store_id)) list.push(pr.store_id);
    storesByProduct.set(pr.product_id, list);
  }
  // Build one candidate object for an existing product vs a feed item.
  const toCandidate = (
    p: DbProductRow,
    score: number,
    level: 'strong' | 'possible',
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
      // Available at one or more other stores → cross-store duplicate; a
      // catalog product with no other store price is an internal match.
      source: sellingIds.length > 0 ? 'cross_store' : 'internal',
      sellingStores: sellingIds.map((sid) => ({ id: sid, name: storeName(sid) })),
    };
  };
  const entries: PreviewEntry[] = [];
  const matchedProductIds = new Set<number>();
  const unmapped = new Set<string>();
  const usedSlugs = new Set<string>(products.map((p) => p.slug));
  for (const item of feedItems) {
    // Hard identity keys are safe to auto-trust: the store's own SKU or the
    // globally unique Awin product id.
    const hardMatched =
      (item.merchantProductId && byMerchantSku.get(normText(item.merchantProductId))) ||
      (item.awProductId && byAwId.get(normText(item.awProductId))) ||
      null;
    // An exact-name hit is NOT auto-trusted: different items can share a name.
    // Route it through the candidate card for explicit confirmation.
    const nameMatched =
      (!hardMatched && item.name && byName.get(normText(item.name))) || null;
    const matched = hardMatched;
    const feedCategory = normalizeTopCategory(item.category);
    // Normalize the extra (deduped) categories to top buckets; keep only those
    // distinct from the canonical bucket so one entry can appear under several.
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
    if (matched) {
      matchedProductIds.add(matched.id);
      const existingPrices = pricesByProduct.get(matched.id) ?? [];
      const oldRow = existingPrices[0] ?? null;
      const oldPrice = toNumber(oldRow?.current_price ?? null);
      const priceChanged =
        item.price !== null && oldPrice !== null && item.price !== oldPrice;
      const linkChanged =
        !!item.deepLink &&
        !!oldRow?.product_url &&
        normText(oldRow.product_url) !== normText(item.deepLink);
      const priceMissingBefore = oldRow === null && item.price !== null;
      const nameChanged =
        !!matched.name && normText(matched.name) !== normText(item.name);
      const descChanged =
        !!matched.description &&
        normText(matched.description) !== normText(item.description);
      const imageChanged =
        !!matched.image_url &&
        normText(matched.image_url) !== normText(item.imageUrl);
      let kind: ChangeKind;
      if (priceChanged || linkChanged || priceMissingBefore) {
        kind = 'price_changed';
      } else if (nameChanged || descChanged || imageChanged) {
        kind = 'info_changed';
      } else {
        kind = 'unchanged';
      }
      const previewPrice: PreviewPrice = {
        priceId: oldRow?.id ?? null,
        storeId: targetStoreId,
        storeName: input.targetStoreName,
        region: targetRegion,
        oldPrice,
        newPrice: item.price,
        currency: item.currency,
        oldUrl: oldRow?.product_url ?? null,
        newUrl: item.deepLink || oldRow?.product_url || null,
        inStock: item.inStock,
      };
      entries.push({
        key: `p-${matched.id}`,
        kind,
        // Nothing auto-selected: the user chooses by category explicitly.
        selected: false,
        awProductId: item.awProductId,
        merchantProductId: item.merchantProductId,
        productId: matched.id,
        slug: matched.slug,
        name: item.name || matched.name || '',
        oldName: matched.name ?? null,
        description: item.description || matched.description || '',
        oldDescription: matched.description ?? null,
        imageUrl: item.imageUrl || matched.image_url || '',
        oldImageUrl: matched.image_url ?? null,
        category: categorySlug,
        categoryLabel: item.category || categorySlug,
        feedCategory,
        extraFeedCategories: extraBuckets,
        promo: promo ? toPreviewPromo(promo) : null,
        brand: item.brand,
        matchCandidates: [],
        prices: [previewPrice],
      });
    } else {
      // Similar existing products: an exact-name match (highest confidence)
      // plus fuzzy candidates. Classified per source (cross-store / internal).
      const candidateIds = new Set<number>();
      const candidates: MatchCandidate[] = [];
      if (nameMatched && !matchedProductIds.has(nameMatched.id)) {
        candidateIds.add(nameMatched.id);
        candidates.push(toCandidate(nameMatched, 1, 'strong'));
      }
      for (const p of products) {
        if (matchedProductIds.has(p.id) || candidateIds.has(p.id)) continue;
        const r = scoreSimilarity(item.name, p.name || p.slug);
        if (r.level === 'none') continue;
        candidateIds.add(p.id);
        candidates.push(toCandidate(p, r.score, r.level));
      }
      candidates.sort((a, b) => b.score - a.score);
      // Never pre-select: every merge requires an explicit user click.
      const best = candidates[0] ?? null;
      const kind: ChangeKind = best ? 'possible_match' : 'new';

      // New product. Generate a unique slug.
      const baseSlug = slugify(item.name) ||
        (item.merchantProductId ? slugify(item.merchantProductId) : '') ||
        `awin-${item.awProductId}`;
      let slug = baseSlug;
      let n = 2;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${n}`;
        n++;
      }
      usedSlugs.add(slug);
      entries.push({
        key: `n-${item.awProductId || slug}`,
        kind,
        selected: false,
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
        prices: [
          {
            priceId: null,
            storeId: targetStoreId,
            storeName: input.targetStoreName,
            region: targetRegion,
            oldPrice: null,
            newPrice: item.price,
            currency: item.currency,
            oldUrl: null,
            newUrl: item.deepLink || null,
            inStock: item.inStock,
          },
        ],
      });
    }
  }
  // Missing: products with an existing price at this store that were not in
  // the feed at all. These require a manual keep/hide decision.
  for (const [productId, rowList] of pricesByProduct) {
    if (matchedProductIds.has(productId)) continue;
    const product = products.find((p) => p.id === productId);
    if (!product) continue;
    const oldRow = rowList[0];
    entries.push({
      key: `m-${productId}`,
      kind: 'missing',
      selected: false,
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
          priceId: oldRow.id,
          storeId: targetStoreId,
          storeName: input.targetStoreName,
          region: targetRegion,
          oldPrice: toNumber(oldRow.current_price),
          newPrice: null,
          currency: oldRow.currency || 'USD',
          oldUrl: oldRow.product_url,
          newUrl: null,
          inStock: oldRow.in_stock ?? true,
        },
      ],
    });
  }
  const totals = { ...EMPTY_TOTALS };
  for (const e of entries) totals[e.kind]++;
  // Build category groups from feed-sourced entries (exclude 'missing').
  const groupOrder: string[] = [];
  const groupCount = new Map<string, number>();
  const groupPromo = new Map<string, number>();
  for (const e of entries) {
    if (e.kind === 'missing') continue;
    // Count the entry once per bucket it belongs to (canonical + extras), so a
    // product listed under several categories is reflected in every chip.
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
    targetRegion,
    unmappedCategories: Array.from(unmapped),
    categoryGroups,
    categoryOverrides: categoryOverrides ?? {},
    promoCount,
  };
}
