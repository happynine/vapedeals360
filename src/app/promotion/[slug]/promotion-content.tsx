import { getServiceRoleClient, isSupabaseConfigured } from '@/storage/database/supabase-client';
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
  countdown_action: 'close' | 'original_price';
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
  
  // Fetch promotion with products and store info
  const { data: promotions, error } = await supabase
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
      ),
      promotion_products (
        id,
        promotion_id,
        slug,
        category_id,
        image_key,
        image_url,
        is_active,
        is_featured,
        notes,
        promotion_product_translations (
          id,
          name,
          description,
          language
        ),
        promotion_product_prices (
          id,
          store_id,
          region,
          current_price,
          original_price,
          discount_percent,
          currency,
          product_url,
          no_quote,
          store_type,
          time_type,
          start_time,
          end_time,
          countdown_action
        )
      )
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .limit(1);

  const promotion = promotions?.[0] || null;

  if (error || !promotion) {
    console.error('Promotion fetch error:', error);
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Promotion Not Found
        </h1>
        <p className="text-gray-600 mb-6">
          This promotion may have ended or does not exist
        </p>
        <p className="text-gray-500 text-sm mb-4">
          Error: {error?.message || 'Unknown error'}
        </p>
        <a href="/" className="inline-flex items-center px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700">
          Back to Home
        </a>
      </div>
    );
  }

  // Transform data to match expected format
  const transformedPromotion: Promotion = {
    id: promotion.id,
    slug: promotion.slug,
    title: promotion.promotion_translations?.[0]?.title || null,
    sort_order: promotion.sort_order,
    is_active: promotion.is_active,
    translations: promotion.promotion_translations || [],
    promotion_products: (promotion.promotion_products || []).map((product: any) => ({
      ...product,
      promotion_product_translations: product.promotion_product_translations || [],
      store_prices: (product.promotion_product_prices || []).map((price: any) => ({
        ...price,
        store: null // Will be fetched separately if needed
      }))
    }))
  };

  // Fetch store info for all prices with store_id
  const allStoreIds = transformedPromotion.promotion_products
    .flatMap(p => p.store_prices)
    .filter(price => price.store_id)
    .map(price => price.store_id as number);

  if (allStoreIds.length > 0) {
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
      .in('id', allStoreIds);

    // Attach store info to prices
    if (stores) {
      transformedPromotion.promotion_products.forEach(product => {
        product.store_prices.forEach(price => {
          if (price.store_id) {
            const store = stores.find(s => s.id === price.store_id);
            if (store) {
              price.store = {
                id: store.id,
                slug: store.slug,
                logo_url: store.logo_url,
                is_active: store.is_active,
                store_translations: store.store_translations || []
              };
            }
          }
        });
      });
    }
  }

  return <PromotionClientContent promotion={transformedPromotion} />;
}