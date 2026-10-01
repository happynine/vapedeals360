/**
 * Shared types for the Awin feed import preview + commit pipeline.
 */
export type ChangeKind =
  | 'new' // Not present in the database; will be created.
  | 'price_changed' // Existing product, current store price differs.
  | 'info_changed' // Existing product, name/description/image differs.
  | 'unchanged' // No meaningful difference.
  | 'possible_match' // Fuzzy candidate: may be the same product, manual confirm.
  | 'missing'; // Existing Awin price row not present in the new feed.

/** A fuzzy match candidate for one feed item. */
export interface MatchCandidate {
  productId: number;
  slug: string;
  name: string;
  imageUrl: string | null;
  score: number;
  level: 'strong' | 'possible';
  /**
   * Where the similar product lives:
   * - 'cross_store': the same product is already sold by another store.
   * - 'internal':   an existing VapeDeals360 catalog product not from a store.
   */
  source: 'cross_store' | 'internal';
  /** Other stores currently selling this product (ids + names), cross_store. */
  sellingStores: Array<{ id: number; name: string }>;
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
  oldPrice: number | null;
  newPrice: number | null;
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
  /** Top-level feed category used for grouping/filtering, e.g. "Disposable Vapes". */
  feedCategory: string;
  /**
   * Other top-level feed buckets the same SKU is listed under (deduped from
   * duplicate feed rows). Lets one entry show under several category chips.
   */
  extraFeedCategories: string[];
  /** Promotion info matched from a landing page, when any. */
  promo: PreviewPromo | null;
  brand: string;
  /**
   * Fuzzy candidates for a 'new' / 'possible_match' item, best first. For a
   * 'possible_match' entry the chosen candidate is productId; the full list is
   * kept so the user can switch or reject it.
   */
  matchCandidates: MatchCandidate[];
  /** Price rows touched for the Awin advertiser store (usually one). */
  prices: PreviewPrice[];
}
/** One group in the category filter bar. */
export interface CategoryGroup {
  key: string; // Stable key, '' for blank.
  label: string;
  count: number;
  promoCount: number;
}
export interface PreviewResponse {
  success: boolean;
  advertiserId: string;
  advertiserName: string;
  storeId: number | null;
  storeName: string;
  generatedAt: string;
  totals: Record<ChangeKind, number>;
  entries: PreviewEntry[];
  /** Category groups present in the feed. */
  categoryGroups: CategoryGroup[];
  /** Count of entries annotated with a promotion. */
  promoCount: number;
  /** Categories in the feed that could not be mapped automatically. */
  unmappedCategories: string[];
  /** Non-fatal problems while fetching/parsing promotion pages. */
  promoErrors: string[];
  /**
   * User-defined feed-category → internal-slug mapping in effect for this
   * preview. Persisted client-side per site and echoed back.
   */
  categoryOverrides: Record<string, string>;
  /** Internal categories (slug + English name) usable as mapping targets. */
  internalCategories: Array<{ slug: string; name: string }>;
  error?: string;
}
/** Payload for a single committed entry after the user reviews it. */
export interface CommitEntry {
  kind: ChangeKind;
  selected: boolean;
  awProductId: string;
  merchantProductId: string;
  productId: number | null;
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
  category: string;
  brand: string;
  /**
   * When the user confirmed a fuzzy merge, the existing product id to merge
   * into; null means create as new / no merge.
   */
  mergeProductId: number | null;
  prices: Array<{
    priceId: number | null;
    storeId: number | null;
    newPrice: number | null;
    currency: string;
    newUrl: string | null;
    inStock: boolean;
  }>;
}
export interface CommitRequest {
  advertiserId: string;
  storeId: number;
  entries: CommitEntry[];
}
export interface CommitResponse {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  hidden: number;
  errors: string[];
}
