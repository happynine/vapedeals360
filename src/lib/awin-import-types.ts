/**
 * Shared types for the Awin feed import preview + commit pipeline.
 * Supports feeds containing multiple advertisers.
 */
export type ChangeKind =
  | 'new' // Not present in the database; will be created.
  | 'price_changed' // Existing product, current store/region price differs.
  | 'info_changed' // Existing product, name/description/image differs.
  | 'unchanged' // No meaningful difference.
  | 'possible_match' // Fuzzy candidate: may be the same product, manual confirm.
  | 'missing'; // Existing price row (store+region) not present in the new feed.

/** Product-level fields whose source can be picked in the compare modal. */
export type FieldChoiceKey = 'image' | 'name' | 'description';
/** 'feed' = new Awin value; 'canonical' = current VapeDeals360 value. */
export type FieldChoiceSource = 'feed' | 'canonical';
export type FieldChoices = Record<FieldChoiceKey, FieldChoiceSource>;

/** One store's current offer shown in the compare modal (column B). */
export interface CandidateStorePrice {
  storeId: number;
  storeName: string;
  logoUrl?: string | null;
  region: string;
  price: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  currency: string;
  inStock: boolean;
  productUrl: string | null;
  /** This store's own SKU for the product (external identity), when known. */
  sku?: string | null;
}

/** A fuzzy match candidate for one feed item. */
export interface MatchCandidate {
  productId: number;
  slug: string;
  name: string;
  imageUrl: string | null;
  /** Current canonical English description, for field-by-field comparison. */
  description: string | null;
  score: number;
  level: 'strong' | 'possible';
  /**
   * Where the similar product lives:
   * - 'cross_store': the same product is already sold by another store.
   * - 'internal':   an existing VapeDeals360 catalog product not from a store.
   */
  source: 'cross_store' | 'internal';
  /** Other stores currently selling this product (ids + names), cross_store. */
  sellingStores: Array<{ id: number; name: string; logoUrl?: string | null }>;
  /** Existing per-store offers for this product (all stores). */
  storePrices: CandidateStorePrice[];
}

export interface PreviewPromo {
  currentPrice: number | null;
  originalPrice: number | null;
  couponCode: string | null;
  sourceUrl: string;
}

export interface PreviewPrice {
  /** Database price row id, when this price already exists. */
  priceId: number | null;
  storeId: number | null;
  storeName: string;
  /** Region this price row belongs to (e.g. USA / UK), multi-region stores. */
  region: string;
  oldPrice: number | null;
  newPrice: number | null;
  /** Old / new original (RRP) price, when known. */
  oldOriginalPrice: number | null;
  newOriginalPrice: number | null;
  currency: string;
  oldUrl: string | null;
  newUrl: string | null;
  inStock: boolean;
}

export interface PreviewEntry {
  /** Stable client-side key. */
  key: string;
  kind: ChangeKind;
  /** Whether the row is selected for import (user can toggle). */
  selected: boolean;
  // Advertiser this row came from (multi-merchant feeds).
  advertiserId: string;
  advertiserName: string;
  // Identity
  awProductId: string;
  merchantProductId: string;
  productId: number | null; // Existing product id when matched.
  slug: string;
  // Editable fields (for new / changed products).
  name: string;
  oldName: string | null;
  description: string;
  oldDescription: string | null;
  imageUrl: string;
  oldImageUrl: string | null;
  category: string; // Mapped internal category slug.
  categoryLabel: string; // Human label / original feed category.
  /** Normalized top-level bucket used for filter chips, e.g. "Disposable Vapes". */
  feedCategory: string;
  /** Store's own raw top-level feed category (mapping is keyed by this). */
  rawFeedCategory: string;
  /** Other normalized buckets the same SKU is listed under (deduped). */
  extraFeedCategories: string[];
  /** Other raw top-level categories the same SKU is listed under (deduped). */
  extraRawFeedCategories: string[];
  /** Promotion info matched from a landing page, when any. */
  promo: PreviewPromo | null;
  brand: string;
  /** Fuzzy candidates for a 'new' / 'possible_match' item, best first. */
  matchCandidates: MatchCandidate[];
  /** Compare-modal field sources; undefined until the modal is applied. */
  fieldChoices?: FieldChoices;
  /** Price rows touched (one per mapped store+region; usually one). */
  prices: PreviewPrice[];
}

/** One group in the category filter bar. */
export interface CategoryGroup {
  key: string; // Stable key, '' for blank.
  label: string;
  count: number;
  promoCount: number;
}

/** Mapping chosen for one Awin advertiser. */
export interface AdvertiserMapping {
  storeId: number;
  region: string;
  currency: string;
}

/** Per-advertiser info returned after parsing a feed (before/after mapping). */
export interface AdvertiserInfo {
  advertiserId: string;
  advertiserName: string;
  productCount: number;
  suggestedCurrency: string;
  /** Existing/known mapping when present (DB default or user choice). */
  mapping: AdvertiserMapping | null;
}

/** Minimal store info the panel renders in dropdowns. */
export interface StoreInfo {
  id: number;
  slug: string;
  name: string;
  logoUrl?: string | null;
  regions: string[];
  currencies: string[];
}

export interface PreviewResponse {
  success: boolean;
  /** Advertisers discovered in the uploaded file. */
  advertisers: AdvertiserInfo[];
  /** Internal stores available as mapping targets. */
  stores: StoreInfo[];
  generatedAt: string;
  totals: Partial<Record<ChangeKind, number>>;
  entries: PreviewEntry[];
  /** Category groups present across the mapped entries. */
  categoryGroups: CategoryGroup[];
  promoCount: number;
  /** Feed categories that could not be mapped automatically. */
  unmappedCategories: string[];
  /** Non-fatal problems while fetching/parsing promotion pages. */
  promoErrors: string[];
  /** User-defined feed-category → internal-slug mapping in effect. */
  categoryOverrides: Record<string, string>;
  /** Internal categories (slug + English name) usable as mapping targets. */
  internalCategories: Array<{ slug: string; name: string }>;
  /** Persisted category mappings loaded from DB (advertiser null = global). */
  savedCategoryMappings: Array<{
    advertiser_id: string | null;
    feed_category: string;
    category_slug: string;
  }>;
  /** True when entries were built (all advertisers mapped); false = list only. */
  ready: boolean;
  error?: string;
}

/** Payload for a single committed entry after the user reviews it. */
export interface CommitEntry {
  kind: ChangeKind;
  selected: boolean;
  advertiserId: string;
  awProductId: string;
  merchantProductId: string;
  productId: number | null;
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
  category: string;
  brand: string;
  /** Confirmed fuzzy merge target; null = create new / no merge. */
  mergeProductId: number | null;
  /**
   * Field sources picked in the compare modal (only used when merging):
   * 'feed' overwrites the canonical product-level field; 'canonical' keeps it.
   */
  fieldChoices?: FieldChoices;
  prices: Array<{
    priceId: number | null;
    storeId: number | null;
    region: string;
    newPrice: number | null;
    newOriginalPrice: number | null;
    currency: string;
    newUrl: string | null;
    inStock: boolean;
  }>;
}

export interface CommitRequest {
  fileName?: string;
  /** Ensure mappings exist server-side before applying. */
  mappings: Record<string, AdvertiserMapping>;
  entries: CommitEntry[];
}

export interface CommitResponse {
  success: boolean;
  batchId: number | null;
  created: number;
  updated: number;
  skipped: number;
  hidden: number;
  errors: string[];
}
