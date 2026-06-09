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
  sales_region: string | null;
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
  sales_region?: string;
  sort_by?: string;
  sort_order?: string;
}) {
  const client = getClient();
  const { category_id, language = 'en', search, limit = 20, offset = 0, featured, sales_region, sort_by = 'id', sort_order = 'desc' } = options || {};

  // If search keyword provided, find matching product IDs from translations table first
  let matchingProductIds: number[] | null = null;
  if (search && search.trim()) {
    const q = search.trim();
    const { data: transData, error: transError } = await client
      .from('product_translations')
      .select('product_id')
      .ilike('name', `%${q}%`);
    if (transError) throw new Error(`Search translations failed: ${transError.message}`);
    matchingProductIds = [...new Set((transData || []).map((t: Record<string, unknown>) => t.product_id as number))];
    // No matching products found
    if (matchingProductIds.length === 0) return [];
  }

  let query = client
    .from('products')
    .select('*, product_translations(*), product_prices(*, stores(*, store_translations(*)))')
    .eq('is_active', true)
    .order(sort_by, { ascending: sort_order === 'asc' })
    .range(offset, offset + limit - 1);

  if (matchingProductIds) {
    query = query.in('id', matchingProductIds);
  }
  if (category_id) {
    query = query.eq('category_id', category_id);
  }
  if (featured) {
    query = query.eq('is_featured', true);
  }
  if (sales_region && sales_region !== '不限地区' && sales_region !== 'All Regions') {
    // Find store IDs that have this region in their regions array
    const { data: storeData, error: storeError } = await client
      .from('stores')
      .select('id')
      .contains('regions', [{ region: sales_region }]);
    if (storeError) throw new Error(`Filter stores by region failed: ${storeError.message}`);
    const storeIds = (storeData || []).map((s: Record<string, unknown>) => s.id as number);
    if (storeIds.length === 0) return [];
    // Find product IDs that have prices from these stores
    const { data: priceData, error: priceError } = await client
      .from('product_prices')
      .select('product_id')
      .in('store_id', storeIds);
    if (priceError) throw new Error(`Filter prices by store failed: ${priceError.message}`);
    const productIds = [...new Set((priceData || []).map((p: Record<string, unknown>) => p.product_id as number))];
    if (productIds.length === 0) return [];
    query = query.in('id', productIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Fetch products failed: ${error.message}`);

  return (data || []).map((product: Record<string, unknown>) => ({
    ...product,
    translations: product.product_translations as ProductTranslation[],
    prices: (product.product_prices as Record<string, unknown>[] || []).map((p) => {
      const storeData = (p as Record<string, unknown>).stores as Record<string, unknown> | null;
      return {
        ...p,
        store: storeData
          ? {
              ...storeData,
              translations: (storeData.store_translations || []) as StoreTranslation[],
            }
          : undefined,
      };
    }),
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
    prices: (product.product_prices as Record<string, unknown>[] || []).map((p) => {
      const storeData = (p as Record<string, unknown>).stores as Record<string, unknown> | null;
      return {
        ...(p as Record<string, unknown>),
        store: storeData
          ? {
              ...storeData,
              translations: (storeData.store_translations || []) as StoreTranslation[],
            }
          : undefined,
      };
    }),
    category: (() => {
      const catData = product.categories as Record<string, unknown> | null;
      if (!catData) return null;
      return {
        ...catData,
        translations: (catData.category_translations || []) as CategoryTranslation[],
      };
    })(),
  };
}

// Count products
export async function countProducts(category_id?: number, sales_region?: string, search?: string) {
  const client = getClient();

  // If search keyword provided, find matching product IDs first
  let matchingProductIds: number[] | null = null;
  if (search && search.trim()) {
    const q = search.trim();
    const { data: transData, error: transError } = await client
      .from('product_translations')
      .select('product_id')
      .ilike('name', `%${q}%`);
    if (transError) throw new Error(`Search translations failed: ${transError.message}`);
    matchingProductIds = [...new Set((transData || []).map((t: Record<string, unknown>) => t.product_id as number))];
    if (matchingProductIds.length === 0) return 0;
  }

  let query = client.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true);
  if (matchingProductIds) {
    query = query.in('id', matchingProductIds);
  }
  if (category_id) {
    query = query.eq('category_id', category_id);
  }
  if (sales_region && sales_region !== '不限地区' && sales_region !== 'All Regions') {
    const { data: storeData, error: storeError } = await client
      .from('stores')
      .select('id')
      .contains('regions', [{ region: sales_region }]);
    if (storeError) throw new Error(`Filter stores by region failed: ${storeError.message}`);
    const storeIds = (storeData || []).map((s: Record<string, unknown>) => s.id as number);
    if (storeIds.length === 0) return 0;
    const { data: priceData, error: priceError } = await client
      .from('product_prices')
      .select('product_id')
      .in('store_id', storeIds);
    if (priceError) throw new Error(`Filter prices by store failed: ${priceError.message}`);
    const productIds = [...new Set((priceData || []).map((p: Record<string, unknown>) => p.product_id as number))];
    if (productIds.length === 0) return 0;
    query = query.in('id', productIds);
  }
  const { count, error } = await query;
  if (error) throw new Error(`Count products failed: ${error.message}`);
  return count || 0;
}

// Get translation helper
export function getTranslation<T extends { language: string }>(
  translations: T[] | undefined | null,
  language: string,
  fallback: string = 'en'
): T | undefined {
  if (!translations || translations.length === 0) return undefined;
  return translations.find((t) => t.language === language) || translations.find((t) => t.language === fallback) || translations[0];
}

// Get store name from price record
export function getStoreName(price: ProductPrice, language: string = 'en'): string {
  if (!price.store) return 'Unknown Store';
  const store = price.store as Store;
  const translation = getTranslation(store.translations, language);
  return translation?.name || 'Unknown Store';
}

// Banner types
export interface Banner {
  id: number;
  image_key: string | null;
  mobile_image_key: string | null;
  link_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  translations: BannerTranslation[];
}

export interface BannerTranslation {
  id: number;
  banner_id: number;
  language: string;
  image_key: string | null;
  mobile_image_key: string | null;
  title: string | null;
  subtitle: string | null;
}

// Fetch active banners with translations
export async function fetchBanners(language: string = 'en') {
  const client = getClient();
  const { data, error } = await client
    .from('banners')
    .select('*, banner_translations(*)')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`Fetch banners failed: ${error.message}`);
  return (data || []).map((banner: Record<string, unknown>) => ({
    ...banner,
    translations: (banner.banner_translations || []) as BannerTranslation[],
  }));
}

// Calculate discount percent
export function calcDiscount(current: string, original: string | null): number | null {
  if (!original) return null;
  const curr = parseFloat(current);
  const orig = parseFloat(original);
  if (orig <= 0) return null;
  return Math.round(((orig - curr) / orig) * 100);
}
