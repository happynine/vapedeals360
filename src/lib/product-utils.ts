// Server-safe product types + pure helpers.
// Safe to import from API routes and server components (no React / 'use client').
// The client-facing product-card.tsx re-exports these so existing imports keep working.

export interface StoreTranslation {
  id: number;
  store_id: number;
  language: string;
  name: string;
}

export interface Store {
  id: number;
  slug: string;
  logo_url: string | null;
  website_url: string | null;
  store_type: string;
  is_active: boolean;
  translations: StoreTranslation[];
  regions?: Array<{ region: string; currency: string }>;
}

export interface ProductPrice {
  id: number;
  product_id: number;
  store_id: number;
  current_price: string;
  original_price: string | null;
  product_url: string;
  in_stock: boolean;
  discount_percent: number | null;
  currency?: string;
  region?: string;
  no_quote?: boolean;
  store?: Store;
  promotion_id?: number | null;
  promo_price?: string | null;
}

export interface ProductTranslation {
  id: number;
  product_id: number;
  language: string;
  name: string;
  description: string | null;
  features: string | null;
  specs: string | null;
}

export interface Product {
  id: number;
  slug: string;
  category_id: number | null;
  image_url: string | null;
  image_url_small: string | null;
  home_image_url: string | null;
  images: string | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string | null;
  translations: ProductTranslation[];
  prices: ProductPrice[];
}

export function getTranslation<T extends { language: string }>(
  translations: T[] | undefined | null,
  language: string,
): T | undefined {
  if (!translations || translations.length === 0) return undefined;
  return (
    translations.find((t) => t.language === language) ||
    translations.find((t) => t.language === 'en') ||
    translations[0]
  );
}

/** Display price: active promotion uses promo_price, otherwise current_price */
export function getDisplayPrice(p: ProductPrice): string {
  if (p.promotion_id != null && p.promo_price != null && p.promo_price !== '') {
    return p.promo_price;
  }
  return p.current_price;
}

export function getLowestPrice(prices: ProductPrice[]): ProductPrice | null {
  if (!prices || prices.length === 0) return null;
  const numeric = (p: ProductPrice): number => {
    const n = parseFloat(getDisplayPrice(p));
    return Number.isNaN(n) ? Infinity : n;
  };
  return prices.reduce<ProductPrice>(
    (min, p) => (numeric(p) < numeric(min) ? p : min),
    prices[0],
  );
}
