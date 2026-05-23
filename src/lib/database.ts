import { getSupabaseClient } from '@/storage/database/supabase-client';

// Type definitions
export interface Category {
  id: number;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  translations: CategoryTranslation[];
}

export interface CategoryTranslation {
  id: number;
  category_id: number;
  language: string;
  name: string;
}

export interface Store {
  id: number;
  slug: string;
  logo_url: string | null;
  website_url: string | null;
  is_active: boolean;
  translations: StoreTranslation[];
}

export interface StoreTranslation {
  id: number;
  store_id: number;
  language: string;
  name: string;
}

export interface Product {
  id: number;
  slug: string;
  category_id: number | null;
  image_url: string | null;
  images: string | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string | null;
  translations: ProductTranslation[];
  prices: ProductPrice[];
  category?: Category;
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

export interface ProductPrice {
  id: number;
  product_id: number;
  store_id: number;
  current_price: string;
  original_price: string | null;
  product_url: string;
  in_stock: boolean;
  discount_percent: number | null;
  updated_at: string | null;
  store?: Store;
}

// Helper: get client
function getClient() {
  return getSupabaseClient();
}

// Fetch all active categories with translations
export async function fetchCategories(language: string = 'en') {
  const client = getClient();
  const { data, error } = await client
    .from('categories')
    .select('*, category_translations(*)')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`Fetch categories failed: ${error.message}`);
  return (data || []).map((cat: Record<string, unknown>) => ({
    ...cat,
    translations: cat.category_translations as CategoryTranslation[],
  }));
}

// Fetch all active stores with translations
export async function fetchStores(language: string = 'en') {
  const client = getClient();
  const { data, error } = await client
    .from('stores')
    .select('*, store_translations(*)')
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (error) throw new Error(`Fetch stores failed: ${error.message}`);
  return (data || []).map((store: Record<string, unknown>) => ({
    ...store,
    translations: store.store_translations as StoreTranslation[],
  }));
}

// Fetch products with translations and prices
export async function fetchProducts(options?: {
  category_id?: number;
  language?: string;
  search?: string;
  limit?: number;
  offset?: number;
  featured?: boolean;
}) {
  const client = getClient();
  const { category_id, language = 'en', limit = 20, offset = 0, featured } = options || {};

  let query = client
    .from('products')
    .select('*, product_translations(*), product_prices(*, stores(*, store_translations(*)))')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category_id) {
    query = query.eq('category_id', category_id);
  }
  if (featured) {
    query = query.eq('is_featured', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Fetch products failed: ${error.message}`);

  return (data || []).map((product: Record<string, unknown>) => ({
    ...product,
    translations: product.product_translations as ProductTranslation[],
    prices: (product.product_prices as Record<string, unknown>[] || []).map((p) => ({
      ...p,
      store: p.stores as Store,
    })),
  }));
}

// Fetch single product by slug
export async function fetchProductBySlug(slug: string, language: string = 'en') {
  const client = getClient();
  const { data, error } = await client
    .from('products')
    .select('*, product_translations(*), product_prices(*, stores(*, store_translations(*))), categories(*, category_translations(*))')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`Fetch product failed: ${error.message}`);
  if (!data) return null;

  const product = data as Record<string, unknown>;
  return {
    ...product,
    translations: product.product_translations as ProductTranslation[],
    prices: (product.product_prices as Record<string, unknown>[] || []).map((p) => ({
      ...(p as Record<string, unknown>),
      store: (p as Record<string, unknown>).stores as Store,
    })),
    category: product.categories as Category | null,
  };
}

// Count products
export async function countProducts(category_id?: number) {
  const client = getClient();
  let query = client.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true);
  if (category_id) {
    query = query.eq('category_id', category_id);
  }
  const { count, error } = await query;
  if (error) throw new Error(`Count products failed: ${error.message}`);
  return count || 0;
}

// Get translation helper
export function getTranslation<T extends { language: string }>(
  translations: T[],
  language: string,
  fallback: string = 'en'
): T {
  return translations.find((t) => t.language === language) || translations.find((t) => t.language === fallback) || translations[0];
}

// Get store name from price record
export function getStoreName(price: ProductPrice, language: string = 'en'): string {
  if (!price.store) return 'Unknown Store';
  const store = price.store as Store;
  const translation = getTranslation(store.translations || [], language);
  return translation?.name || 'Unknown Store';
}

// Calculate discount percent
export function calcDiscount(current: string, original: string | null): number | null {
  if (!original) return null;
  const curr = parseFloat(current);
  const orig = parseFloat(original);
  if (orig <= 0) return null;
  return Math.round(((orig - curr) / orig) * 100);
}
