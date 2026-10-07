/**
 * Per-store analysis profiles.
 *
 * Each Awin store gets its OWN profile recording exactly how to read a
 * complete, correct catalog from its feed, because the data-quality problems
 * differ by store (missing images, empty categories, noisy taxonomy, ...).
 * Profiles are keyed by Awin advertiser id and are the single source of truth
 * consulted by the preview route before falling back to generic handling.
 * Weekly/monthly change monitoring reuses the same profile, so every
 * comparison always applies the store's proven method.
 */
export type StoreEnrichMethod =
  | 'none' // Feed is complete; no enrichment needed.
  | 'woo_store_api' // Public WooCommerce Store API; feed merchant_product_id == WC id.
  | 'custom'; // Reserved for store-specific logic.

export interface StoreProfile {
  advertiserId: string;
  name: string;
  /** Store's own site origin (scheme + host), used to build enrichment URLs. */
  origin: string;
  method: StoreEnrichMethod;
  /** What was wrong with the feed and how the profile fixes it. */
  notes: string;
  /** When this method was last verified against the live store. */
  verifiedAt: string;
}

const PROFILES: StoreProfile[] = [
  {
    advertiserId: '86487',
    name: 'EightVape',
    origin: 'https://www.eightvape.com',
    method: 'woo_store_api',
    notes:
      'Native Awin feed (data_feed_id 112665): aw_image_url all noimage.gif, category_id/category_name/brand_name empty (merchant never submitted them). Enrich from public WooCommerce Store API /wp-json/wc/store/v1/products; feed merchant_product_id equals the WC product id. Pull real image + WC categories, map WC slugs to internal categories, drop marketing tags. Best-effort; failures fall back to feed data.',
    verifiedAt: '2026-10-07',
  },
];

const BY_ADV = new Map(PROFILES.map((p) => [p.advertiserId, p]));

/** Look up one store's proven analysis method. */
export function getStoreProfile(advertiserId: string): StoreProfile | undefined {
  return BY_ADV.get(advertiserId);
}

/** Every store with a recorded method (used for status / monitoring lists). */
export function allStoreProfiles(): StoreProfile[] {
  return PROFILES;
}
