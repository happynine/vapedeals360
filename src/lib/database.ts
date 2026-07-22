import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';

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
  image_url_small: string | null;
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
  no_quote?: boolean;
  store?: Store;
}

// Helper: get client, returns null when Supabase is not configured (e.g. during build)
function getClient() {
  if (!isSupabaseConfigured()) return null;
  try {
    return getSupabaseClient();
  } catch {
    return null;
  }
}

// Fetch all active categories with translations
export async function fetchCategories(language: string = 'en') {
  const client = getClient();
  if (!client) return [];
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
  if (!client) return [];
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
  currency?: string;
  sort_by?: string;
  sort_order?: string;
}) {
  const client = getClient();
  if (!client) return [];
  const { category_id, language = 'en', search, limit = 20, offset = 0, featured, sales_region, currency, sort_by = 'id', sort_order = 'desc' } = options || {};

  // If search keyword provided, find matching product IDs from translations table first
  let matchingProductIds: number[] | null = null;
  if (search && search.trim()) {
    const q = search.trim();
    const { data: transData, error: transError } = await client
      .from('product_translations')
      .select('product_id')
      .ilike('name', `%${q}%`);
    if (transError) throw new Error(`Search translations failed: ${transError.message}`);
    matchingProductIds = [...new Set(((transData || []) as Array<Record<string, unknown>>).map((t) => t.product_id as number))];
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
  // Track the active sales_region for price filtering
  const activeRegion = (sales_region && sales_region !== '不限地区' && sales_region !== 'All Regions') ? sales_region : null;

  // Fetch stores for region filtering if needed (reused later for storeRegionMap)
  let allStores: Record<string, unknown>[] | null = null;
  if (activeRegion) {
    // Note: Also filter by is_active to exclude disabled stores
    const { data: storeData, error: storeError } = await client
      .from('stores')
      .select('id, regions, store_type, is_active');
    if (storeError) throw new Error(`Filter stores by region failed: ${storeError.message}`);
    allStores = (storeData || []) as Record<string, unknown>[];
    const storeIds = allStores
      .filter((s: Record<string, unknown>) => {
        // Exclude inactive stores
        if (s.is_active === false) return false;
        
        const regions = s.regions as { region: string; currency: string }[] | null;
        const storeType = s.store_type as string | null;
        // Official类型的商城视为Global，包含在所有region中
        if (storeType === 'official') return true;
        // regions为空或包含"Global"的store也包含在所有region中
        if (!regions || regions.length === 0) return true;
        if (regions.some(r => r.region === 'Global')) return true;
        // 否则检查是否包含当前region
        return regions.some(r => r.region === activeRegion);
      })
      .map((s: Record<string, unknown>) => s.id as number);
    if (storeIds.length === 0) return [];
    
    // Get prices from these stores with region and currency filter
    const { data: priceData, error: priceError } = await client
      .from('product_prices')
      .select('product_id, region, currency')
      .in('store_id', storeIds);
    if (priceError) throw new Error(`Filter prices by store failed: ${priceError.message}`);
    
    // Filter product IDs that have matching prices (same logic as countProducts)
    let productIds: number[];
    if (currency && activeRegion !== 'Global') {
      // When currency is specified and not Global region:
      // Product must have either:
      // 1. Prices matching the region with matching currency, OR
      // 2. Global region prices (currency not filtered for Global)
      const matchingProductIdsSet = new Set<number>();
      for (const p of (priceData || [])) {
        const pRegion = (p as Record<string, unknown>).region as string | null;
        const pCurrency = (p as Record<string, unknown>).currency as string | null;
        const pProductId = (p as Record<string, unknown>).product_id as number;
        
        // Global prices always count when specific region is selected
        if (pRegion === 'Global') {
          matchingProductIdsSet.add(pProductId);
        } else if (pRegion === activeRegion && pCurrency === currency) {
          // Region prices must match currency
          matchingProductIdsSet.add(pProductId);
        }
      }
      productIds = [...matchingProductIdsSet];
    } else {
      // No currency filter, just get unique product IDs
      productIds = [...new Set(((priceData || []) as Array<Record<string, unknown>>).map((p) => p.product_id as number))];
    }
    
    if (productIds.length === 0) return [];
    query = query.in('id', productIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Fetch products failed: ${error.message}`);

  // Build a map of store regions for currency filtering
  // Official和Store类型都应该遵循其设置的regions
  let storeRegionMap: Record<number, { region: string; currency: string }[]> = {};
  if (activeRegion && allStores) {
    for (const s of allStores) {
      const regions = s.regions as { region: string; currency: string }[] | null;
      const storeId = s.id as number;
      // 检查store是否匹配当前region
      if (Array.isArray(regions) && regions.length > 0) {
        // 如果store设置了regions，只有匹配时才包含
        if (regions.some(r => r.region === activeRegion)) {
          storeRegionMap[storeId] = regions;
        } else if (regions.some(r => r.region === 'Global')) {
          // 如果store设置了Global region，在所有region下都显示
          storeRegionMap[storeId] = regions;
        }
        // 否则不包含该store（不添加到storeRegionMap）
      } else {
        // 没有设置regions的store在所有region下都显示（向后兼容）
        storeRegionMap[storeId] = [];
      }
    }
  }

  // Process and filter products
  const processedProducts = (data || []).map((product: Record<string, unknown>) => ({
    ...product,
    translations: product.product_translations as ProductTranslation[],
    prices: (product.product_prices as Record<string, unknown>[] || [])
      .filter((p) => {
        if (!activeRegion) return true;
        const pStoreId = (p as Record<string, unknown>).store_id as number;
        const pRegion = (p as Record<string, unknown>).region as string | null;
        // Include prices that match the region, Global region, or have no region set (backward compat)
        if (pRegion === activeRegion || pRegion === 'Global') return true;
        if (!pRegion) {
          // For prices without region, check if the store matches the region
          const storeRegions = storeRegionMap[pStoreId];
          // 如果store在storeRegionMap中，说明它匹配当前region
          return storeRegions !== undefined;
        }
        return false;
      })
      .map((p) => {
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

  // If currency is specified, filter products that have matching prices
  // Logic: 
  // - For Global region: filter all prices by currency
  // - For specific region: show region prices filtered by currency + Global prices (not filtered by currency)
  if (currency && activeRegion) {
    return processedProducts.filter((product: Record<string, unknown>) => {
      const prices = product.prices as Record<string, unknown>[] || [];
      const hasMatchingPrice = prices.some((p) => {
        const pRegion = (p as Record<string, unknown>).region as string | null;
        const pCurrency = (p as Record<string, unknown>).currency as string | null;
        
        // Global prices are always included when specific region is selected
        if (pRegion === 'Global' && activeRegion !== 'Global') return true;
        
        // Region prices must match both region AND currency
        return pRegion === activeRegion && pCurrency === currency;
      });
      return hasMatchingPrice;
    });
  }

  return processedProducts;
}

// Fetch single product by slug
export async function fetchProductBySlug(slug: string, language: string = 'en', activeRegion?: string) {
  const client = getClient();
  if (!client) return null;
  const { data, error } = await client
    .from('products')
    .select('*, product_translations(*), product_prices(*, stores(*, store_translations(*))), categories(*, category_translations(*))')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`Fetch product failed: ${error.message}`);
  if (!data) return null;

  const product = data as Record<string, unknown>;
  const allPrices = product.product_prices as Record<string, unknown>[] || [];

  // Build store region map for filtering
  let storeRegionMap: Record<number, { region: string; currency: string }[]> = {};
  if (activeRegion) {
    for (const p of allPrices) {
      const storeData = p.stores as Record<string, unknown> | null;
      if (storeData) {
        const storeId = storeData.id as number;
        const regions = storeData.regions as { region: string; currency: string }[] | null;
        if (Array.isArray(regions) && regions.length > 0) {
          // 如果store设置了regions，只有匹配时才包含
          if (regions.some(r => r.region === activeRegion)) {
            storeRegionMap[storeId] = regions;
          } else if (regions.some(r => r.region === 'Global')) {
            storeRegionMap[storeId] = regions;
          }
        } else {
          // 没有设置regions的store在所有region下都显示
          storeRegionMap[storeId] = [];
        }
      }
    }
  }

  // Filter prices by region
  const filteredPrices = activeRegion
    ? allPrices.filter((p) => {
        const pStoreId = (p as Record<string, unknown>).store_id as number;
        const pRegion = (p as Record<string, unknown>).region as string | null;
        // Include prices that match the region, Global region, or have no region set
        if (pRegion === activeRegion || pRegion === 'Global') return true;
        if (!pRegion) {
          const storeRegions = storeRegionMap[pStoreId];
          return storeRegions !== undefined;
        }
        return false;
      })
    : allPrices;

  return {
    ...product,
    translations: product.product_translations as ProductTranslation[],
    prices: filteredPrices.map((p) => {
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
export async function countProducts(category_id?: number, sales_region?: string, search?: string, currency?: string) {
  const client = getClient();
  if (!client) return 0;
  
  // Debug log
  console.log('[countProducts] params:', { category_id, sales_region, search, currency });

  // If search keyword provided, find matching product IDs first
  let matchingProductIds: number[] | null = null;
  if (search && search.trim()) {
    const q = search.trim();
    const { data: transData, error: transError } = await client
      .from('product_translations')
      .select('product_id')
      .ilike('name', `%${q}%`);
    if (transError) throw new Error(`Search translations failed: ${transError.message}`);
    matchingProductIds = [...new Set(((transData || []) as Array<Record<string, unknown>>).map((t) => t.product_id as number))];
    if (matchingProductIds.length === 0) return 0;
  }

  let query = client.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true);
  if (matchingProductIds) {
    query = query.in('id', matchingProductIds);
  }
  if (category_id) {
    query = query.eq('category_id', category_id);
  }
  
  // Track active region for currency filtering
  const activeRegion = (sales_region && sales_region !== '不限地区' && sales_region !== 'All Regions') ? sales_region : null;
  
  if (activeRegion) {
    // Cannot use .contains() or .like() on jsonb column, fetch and filter in JS
    // Note: Also filter by is_active to exclude disabled stores
    const { data: storeData, error: storeError } = await client
      .from('stores')
      .select('id, regions, store_type, is_active');
    if (storeError) throw new Error(`Filter stores by region failed: ${storeError.message}`);
    
    // Filter stores that match the region or are Global, and are active
    const storeIds = (storeData || [])
      .filter((s: Record<string, unknown>) => {
        // Exclude inactive stores
        if (s.is_active === false) return false;
        
        const regions = s.regions as { region: string; currency: string }[] | null;
        const storeType = s.store_type as string | null;
        // Official类型的商城视为Global，包含在所有region中
        if (storeType === 'official') return true;
        // regions为空或包含"Global"的store也包含在所有region中
        if (!regions || regions.length === 0) return true;
        if (regions.some(r => r.region === 'Global')) return true;
        // 否则检查是否包含当前region
        return regions.some(r => r.region === activeRegion);
      })
      .map((s: Record<string, unknown>) => s.id as number);
    if (storeIds.length === 0) return 0;
    
    // Get prices from these stores with region filter
    const { data: priceData, error: priceError } = await client
      .from('product_prices')
      .select('product_id, region, currency')
      .in('store_id', storeIds);
    if (priceError) throw new Error(`Filter prices by store failed: ${priceError.message}`);
    
    // Filter product IDs that have matching prices
    let productIds: number[];
    if (currency && activeRegion !== 'Global') {
      // When currency is specified and not Global region:
      // Product must have either:
      // 1. Prices matching the region with matching currency, OR
      // 2. Global region prices (currency not filtered for Global)
      const matchingProductIdsSet = new Set<number>();
      for (const p of (priceData || [])) {
        const pRegion = (p as Record<string, unknown>).region as string | null;
        const pCurrency = (p as Record<string, unknown>).currency as string | null;
        const pProductId = (p as Record<string, unknown>).product_id as number;
        
        // Global prices always count when specific region is selected
        if (pRegion === 'Global') {
          matchingProductIdsSet.add(pProductId);
        } else if (pRegion === activeRegion && pCurrency === currency) {
          // Region prices must match currency
          matchingProductIdsSet.add(pProductId);
        }
      }
      productIds = [...matchingProductIdsSet];
    } else {
      // No currency filter, just get unique product IDs
      productIds = [...new Set(((priceData || []) as Array<Record<string, unknown>>).map((p) => p.product_id as number))];
    }
    
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
  if (!client) return [];
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
