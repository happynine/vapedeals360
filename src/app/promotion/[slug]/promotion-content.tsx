import { getServiceRoleClient, isSupabaseConfigured } from '@/storage/database/supabase-client';
import { getPresignedUrl } from '@/lib/storage';
import { PromotionClientContent } from './promotion-client-content';

// ISR: 每 60 秒重新验证，但跳过构建时预渲染（避免连接海外 Supabase 超时）
export const revalidate = 60;

interface StoreTranslation {
  id: number;
  store_id: number;
  language: string;
  name: string;
}

interface PromotionProductPrice {
  id: number;
  store_id: number | null;
  region: string | null;
  current_price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  currency: string | null;
  product_url: string | null;
  no_quote: boolean | null;
  store_type: 'promotion' | 'standard';
  time_type: 'permanent' | 'time_range' | 'countdown';
  start_time: string | null;
  end_time: string | null;
  countdown_action: 'convert_to_standard' | 'hide';
  standard_price?: number | null;
  store?: {
    id: number;
    slug: string;
    logo_url: string | null;
    is_active: boolean;
    store_translations?: StoreTranslation[];
  } | null;
}

interface PromotionProductTranslation {
  id: number;
  name: string | null;
  description: string | null;
  language: string;
}

interface PromotionProduct {
  id: number;
  promotion_id: number | null;
  slug: string | null;
  category_id: number | null;
  image_key: string | null;
  image_url: string | null;
  home_image_key: string | null;
  home_image_url: string | null;
  is_active: boolean | null;
  is_featured: boolean | null;
  notes: string | null;
  promotion_product_translations: PromotionProductTranslation[];
  store_prices: PromotionProductPrice[];
}

interface PromotionTranslation {
  id: number;
  name: string | null;
  title: string | null;
  description: string | null;
  cover_image_key: string | null;
  cover_image_url: string | null;
  mobile_cover_image_key: string | null;
  mobile_cover_image_url: string | null;
  language: string;
}

interface Promotion {
  id: number;
  slug: string;
  title: string | null;
  sort_order: number;
  is_active: boolean;
  translations: PromotionTranslation[];
  promotion_products: PromotionProduct[];
}

// Server Component - fetches data
export async function PromotionContent({ slug }: { slug: string }) {
  const supabase = getServiceRoleClient();
  
  // Decode URL-encoded slug
  const decodedSlug = decodeURIComponent(slug);
  
  // Fetch promotion with translations (with retry)
  let promotion: any = null;
  let error: any = null;
  
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await supabase
      .from('promotions')
      .select(`
        id,
        slug,
        sort_order,
        is_active,
        promotion_translations (
          id,
          name,
          title,
          description,
          cover_image_key,
          cover_image_url,
          language
        )
      `)
      .eq('slug', decodedSlug)
      .eq('is_active', true)
      .limit(1)
      .single();
    
    if (!result.error) {
      promotion = result.data;
      error = null;
      break;
    }
    
    error = result.error;
    promotion = null;
    
    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  if (!promotion) {
    console.error('Promotion not found:', decodedSlug, 'Error:', error);
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Promotion Not Found
        </h1>
        <p className="text-gray-600 mb-6">
          This promotion may have ended or does not exist
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Slug: {decodedSlug}
        </p>
        <a href="/" className="inline-flex items-center px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700">
          Back to Home
        </a>
      </div>
    );
  }

  // 从 product_prices 查询该活动下的价格行（统一架构）
  const now = new Date();
  const { data: promoPrices, error: pricesError } = await supabase
    .from('product_prices')
    .select(`
      id,
      product_id,
      store_id,
      region,
      current_price,
      original_price,
      discount_percent,
      currency,
      product_url,
      no_quote,
      time_type,
      start_time,
      end_time,
      countdown_action,
      standard_price,
      is_promotion_hidden,
      is_featured_in_promotion,
      in_stock,
      products (
        id,
        slug,
        category_id,
        image_url,
        image_url_small,
        home_image_key,
        is_active,
        is_featured,
        product_translations (
          id,
          name,
          description,
          language
        )
      )
    `)
    .eq('promotion_id', promotion.id)
    .eq('is_promotion_hidden', false);

  if (pricesError) {
    console.error('Error fetching promotion prices:', pricesError);
  }

  // 过滤已过期的价格
  const activePrices = (promoPrices || []).filter((p: any) => {
    if (!p.time_type || p.time_type === 'permanent') return true;
    if (!p.end_time) return true;
    return now <= new Date(p.end_time);
  });

  // 获取店铺信息
  const allStoreIds = activePrices
    .map((p: any) => p.store_id)
    .filter(Boolean) as number[];
  const uniqueStoreIds = [...new Set(allStoreIds)];

  let storesMap: Record<number, any> = {};
  if (uniqueStoreIds.length > 0) {
    const { data: stores } = await supabase
      .from('stores')
      .select(`
        id,
        slug,
        logo_url,
        is_active,
        store_translations (
          id,
          store_id,
          name,
          language
        )
      `)
      .in('id', uniqueStoreIds);

    if (stores) {
      for (const s of stores) {
        storesMap[s.id] = s;
      }
    }
  }

  // 按 product_id 分组
  const grouped = new Map<number, any>();
  for (const price of activePrices) {
    const product = price.products;
    if (!product || product.is_active === false) continue;

    if (!grouped.has(product.id)) {
      grouped.set(product.id, {
        id: product.id,
        promotion_id: promotion.id,
        product_id: product.id,
        slug: product.slug,
        category_id: product.category_id || null,
        image_key: product.home_image_key,
        image_url: product.image_url,
        home_image_key: product.home_image_key,
        is_active: true,
        is_featured: !!price.is_featured_in_promotion,
        notes: null,
        promotion_product_translations: (product.product_translations || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          language: t.language,
        })),
        store_prices: [],
      });
    }

    const entry = grouped.get(product.id);
    entry.store_prices.push({
      id: price.id,
      store_id: price.store_id,
      region: price.region,
      current_price: price.current_price,
      original_price: price.original_price,
      discount_percent: price.discount_percent,
      currency: price.currency,
      product_url: price.product_url,
      no_quote: price.no_quote,
      store_type: 'promotion' as const,
      time_type: price.time_type,
      start_time: price.start_time,
      end_time: price.end_time,
      countdown_action: price.countdown_action,
      standard_price: price.standard_price,
      store: price.store_id ? {
        id: storesMap[price.store_id]?.id || price.store_id,
        slug: storesMap[price.store_id]?.slug || String(price.store_id),
        logo_url: storesMap[price.store_id]?.logo_url || null,
        is_active: storesMap[price.store_id]?.is_active ?? true,
        store_translations: storesMap[price.store_id]?.store_translations || [],
      } : null,
    });
  }

  // 生成 presigned URLs
  const promotionProducts = await Promise.all(
    Array.from(grouped.values()).map(async (product) => {
      const homeImageKey = product.home_image_key;
      const homeImageUrl = homeImageKey ? await getPresignedUrl(homeImageKey) : null;
      return {
        ...product,
        home_image_url: homeImageUrl,
      };
    })
  );

  const transformedPromotion: Promotion = {
    id: promotion.id,
    slug: promotion.slug,
    title: promotion.promotion_translations?.[0]?.title || null,
    sort_order: promotion.sort_order,
    is_active: promotion.is_active,
    translations: promotion.promotion_translations || [],
    promotion_products: promotionProducts,
  };

  return <PromotionClientContent promotion={transformedPromotion as any} />;
}
