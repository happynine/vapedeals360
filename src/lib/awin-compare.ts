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
// STUB for bisect
function scoreSimilarity(): { score: number; level: 'none' } {
  return { score: 0, level: 'none' };
}
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
}
export interface DbCategoryRow {
  id: number;
  slug: string;
  name?: string | null; // merged en translation
}
export interface CompareInput {
  advertiserId: string;
  advertiserName: string;
  targetStoreId: number;
  targetStoreName: string;
  feedItems: NormalizedFeedItem[];
  products: DbProductRow[];
  prices: DbPriceRow[];
  categories: DbCategoryRow[];
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
    feedItems,
    products,
    prices,
    categories,
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
  // Prices at the target advertiser store, grouped by product.
  const pricesByProduct = new Map<number, DbPriceRow[]>();
  for (const pr of prices) {
    if (pr.store_id !== targetStoreId) continue;
    const list = pricesByProduct.get(pr.product_id) ?? [];
    list.push(pr);
    pricesByProduct.set(pr.product_id, list);
  }
  const entries: PreviewEntry[] = [];
  const matchedProductIds = new Set<number>();
  const unmapped = new Set<string>();
  const usedSlugs = new Set<string>(products.map((p) => p.slug));
  for (const item of feedItems) {
    // Match with priority: merchant SKU -> Awin id -> exact name.
    const matched =
      (item.merchantProductId && byMerchantSku.get(normText(item.merchantProductId))) ||
      (item.awProductId && byAwId.get(normText(item.awProductId))) ||
      (item.name && byName.get(normText(item.name))) ||
      null;
    const feedCategory = topCategory(item.category);
    const promo =
      (promoMap && item.merchantUrl && promoMap.get(productPath(item.merchantUrl))) ||
      null;
    let categorySlug = mapCategory(item.category, categories, categoryOverrides);
    if (!categorySlug && item.category) {
      categorySlug = slugify(topCategory(item.category) || item.category);
      unmapped.add(item.category);
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
        promo: promo ? toPreviewPromo(promo) : null,
        brand: item.brand,
        matchCandidates: [],
        prices: [previewPrice],
      });
    } else {
      // Fuzzy candidates: compare the feed name against every existing product
      // not already claimed by a stronger key. Keep 'strong' + best 'possible'.
      const candidates: MatchCandidate[] = [];
      for (const p of products) {
        if (matchedProductIds.has(p.id)) continue;
        const r = scoreSimilarity(item.name, p.name || p.slug);
        if (r.level === 'none') continue;
        candidates.push({
          productId: p.id,
          slug: p.slug,
          name: p.name || p.slug,
          imageUrl: p.image_url,
          score: r.score,
          level: r.level,
        });
      }
      candidates.sort((a, b) => b.score - a.score);
      // strong candidate pre-fills productId, possible leaves it null; either
      // way the row is unselected — nothing merges without explicit approval.
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
        productId: best && best.level === 'strong' ? best.productId : null,
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
        promo: promo ? toPreviewPromo(promo) : null,
        brand: item.brand,
        matchCandidates: candidates.slice(0, 6),
        prices: [
          {
            priceId: null,
            storeId: targetStoreId,
            storeName: input.targetStoreName,
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
      promo: null,
      brand: '',
      matchCandidates: [],
      prices: [
        {
          priceId: oldRow.id,
          storeId: targetStoreId,
          storeName: input.targetStoreName,
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
    const g = e.feedCategory || 'Uncategorized';
    if (!groupCount.has(g)) {
      groupCount.set(g, 0);
      groupPromo.set(g, 0);
      groupOrder.push(g);
    }
    groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
    if (e.promo) groupPromo.set(g, (groupPromo.get(g) ?? 0) + 1);
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
