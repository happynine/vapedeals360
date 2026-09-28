/**
 * Shared types for the Awin feed import preview + commit pipeline.
 */

export type ChangeKind =
  | 'new' // Not present in the database; will be created.
  | 'price_changed' // Existing product, current store price differs.
  | 'info_changed' // Existing product, name/description/image differs.
  | 'unchanged' // No meaningful difference.
  | 'missing'; // Existing Awin price row not present in the new feed.

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
  brand: string;

  /** Price rows touched for the Awin advertiser store (usually one). */
  prices: PreviewPrice[];
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
  /** Categories in the feed that could not be mapped automatically. */
  unmappedCategories: string[];
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
