import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET - 获取活动列表（前端展示）
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    
    // 检查促销活动全局开关
    const { data: siteSettings, error: settingsError } = await client
      .from('site_settings')
      .select('promotions_enabled')
      .single();
    
    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Error fetching site settings:', settingsError);
    }
    
    // 如果促销活动被禁用，返回空数据
    if (siteSettings && !siteSettings.promotions_enabled) {
      return NextResponse.json({
        success: true,
        data: {
          promotions: [],
          message: 'Promotions are currently disabled'
        }
      });
    }
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') || 'en';
    const region = searchParams.get('region') || 'USA';
    const slug = searchParams.get('slug');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const now = new Date().toISOString();

    // 构建查询条件 - 过滤有效的活动
    const buildPromotionFilter = (query: any) => {
      return query
        .eq('is_active', true)
        .or(`time_type.eq.permanent,and(time_type.eq.time_range,start_time.lte.${now},end_time.gte.${now}),and(time_type.eq.countdown,end_time.gte.${now})`);
    };

    if (slug) {
      // 获取单个活动及其产品
      const { data: promotions, error: promotionError } = await client
        .from('promotions')
        .select(`
          *,
          promotion_translations!inner (
            id,
            language,
            name,
            title,
            description,
            cover_image_key,
            cover_image_url
          )
        `)
        .eq('slug', slug)
        .eq('promotion_translations.language', language)
        .eq('is_active', true)
        .limit(1);

      const promotion = promotions?.[0] || null;

      if (promotionError || !promotion) {
        return NextResponse.json({ error: 'Promotion not found' }, { status: 404 });
      }

      // 获取活动关联的产品
      const { data: promotionProducts, error: productsError } = await client
        .from('promotion_products')
        .select(`
          *,
          products (
            id,
            slug,
            image_url,
            is_active,
            product_translations!inner (
              id,
              language,
              name,
              description
            ),
            product_prices (
              id,
              current_price,
              original_price,
              currency,
              region,
              discount_percentage,
              no_quote,
              stores (
                id,
                slug,
                is_active,
                store_translations!inner (
                  id,
                  language,
                  name
                )
              )
            )
          )
        `)
        .eq('promotion_id', promotion.id)
        .range(offset, offset + limit - 1);

      if (productsError) {
        return NextResponse.json({ error: productsError.message }, { status: 500 });
      }

      // 过滤和格式化产品数据
      const formattedProducts = (promotionProducts || [])
        .filter((pp: { products?: { is_active?: boolean } }) => pp.products?.is_active)
        .map((pp: { 
          products?: { 
            id?: number; 
            slug?: string; 
            image_url?: string | null; 
            product_translations?: Array<{ name?: string; description?: string }>; 
            product_prices?: Array<{
              current_price?: number;
              original_price?: number | null;
              currency?: string;
              region?: string;
              discount_percentage?: number | null;
              no_quote?: boolean;
              stores?: { 
                is_active?: boolean; 
                store_translations?: Array<{ name?: string }> 
              };
            }>;
          };
          special_price?: number | null;
        }) => {
          const product = pp.products;
          if (!product) return null;

          const translation = product.product_translations?.[0] || {};
          
          // 过滤价格
          const filteredPrices = (product.product_prices || [])
            .filter((price: { 
              no_quote?: boolean; 
              stores?: { is_active?: boolean }; 
              region?: string;
            }) => {
              if (price.no_quote) return false;
              if (price.stores && !price.stores.is_active) return false;
              return price.region === region || price.region === 'Global';
            })
            .map((price: { 
              current_price?: number; 
              original_price?: number | null; 
              currency?: string; 
              discount_percentage?: number | null;
              stores?: { 
                id?: number; 
                slug?: string; 
                store_translations?: Array<{ name?: string }> 
              };
            }) => ({
              ...price,
              store: price.stores ? {
                id: price.stores.id,
                slug: price.stores.slug,
                name: price.stores.store_translations?.[0]?.name || ''
              } : null,
              stores: undefined,
              // 如果活动有特惠价，则使用特惠价
              current_price: pp.special_price || promotion.special_price || price.current_price,
              original_price: price.original_price,
              discount_percentage: price.discount_percentage,
              has_promotion: true,
              promotion_price: pp.special_price || promotion.special_price,
              end_time: promotion.end_time,
              countdown_action: promotion.countdown_action
            }));

          return {
            id: product.id,
            slug: product.slug,
            image_url: product.image_url,
            name: translation.name || '',
            description: translation.description || '',
            prices: filteredPrices,
            promotion_price: pp.special_price || promotion.special_price,
            promotion_end_time: promotion.end_time,
            promotion_countdown_action: promotion.countdown_action
          };
        })
        .filter((p) => p !== null);

      // 获取产品总数
      const { count: totalProducts } = await client
        .from('promotion_products')
        .select('*', { count: 'exact', head: true })
        .eq('promotion_id', promotion.id);

      // 计算倒计时
      let countdown = null;
      if (promotion.time_type === 'countdown' && promotion.end_time) {
        const endTime = new Date(promotion.end_time);
        const diff = endTime.getTime() - Date.now();
        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          countdown = { days, hours, minutes, seconds };
        }
      }

      // 处理翻译中的图片 URL
      const translations = (promotion.promotion_translations || []).map((t: any) => {
        let coverImageUrl = t.cover_image_url;
        if (!coverImageUrl && t.cover_image_key) {
          if (t.cover_image_key.startsWith('http')) {
            coverImageUrl = t.cover_image_key;
          }
        }
        return {
          ...t,
          cover_image_url: coverImageUrl,
        };
      });

      return NextResponse.json({
        success: true,
        data: {
          promotion: {
            ...promotion,
            translations,
            countdown
          },
          products: formattedProducts,
          pagination: {
            page,
            limit,
            total: totalProducts || 0,
            totalPages: Math.ceil((totalProducts || 0) / limit)
          }
        }
      });
    } else {
      // 获取活动列表
      const { data: promotions, error: promotionsError } = await client
        .from('promotions')
        .select(`
          *,
          promotion_translations!inner (
            id,
            language,
            name,
            title,
            description,
            cover_image_key,
            cover_image_url
          )
        `)
        .eq('promotion_translations.language', language)
        .eq('is_active', true)
        .or(`time_type.eq.permanent,and(time_type.eq.time_range,start_time.lte.${now},end_time.gte.${now}),and(time_type.eq.countdown,end_time.gte.${now})`)
        .order('sort_order', { ascending: true });

      if (promotionsError) {
        return NextResponse.json({ error: promotionsError.message }, { status: 500 });
      }

      // 为每个活动添加倒计时和产品数量
      const promotionsWithDetails = await Promise.all(
        (promotions || []).map(async (promotion) => {
          // 计算倒计时
          let countdown = null;
          if (promotion.time_type === 'countdown' && promotion.end_time) {
            const endTime = new Date(promotion.end_time);
            const diff = endTime.getTime() - Date.now();
            if (diff > 0) {
              const days = Math.floor(diff / (1000 * 60 * 60 * 24));
              const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
              const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
              const seconds = Math.floor((diff % (1000 * 60)) / 1000);
              countdown = { days, hours, minutes, seconds };
            }
          }

          // 获取产品数量
          const { count: productCount } = await client
            .from('promotion_products')
            .select('*', { count: 'exact', head: true })
            .eq('promotion_id', promotion.id);

          // 处理翻译中的图片 URL
          const translations = (promotion.promotion_translations || []).map((t: any) => {
            let coverImageUrl = t.cover_image_url;
            if (!coverImageUrl && t.cover_image_key) {
              // 如果 cover_image_key 已经是完整 URL，直接使用
              if (t.cover_image_key.startsWith('http')) {
                coverImageUrl = t.cover_image_key;
              }
              // 否则保持原样（需要 getPresignedUrl 转换，但 API 层不做异步处理）
            }
            return {
              ...t,
              cover_image_url: coverImageUrl,
            };
          });

          return {
            ...promotion,
            translations,
            countdown,
            product_count: productCount || 0
          };
        })
      );

      return NextResponse.json({
        success: true,
        data: {
          promotions: promotionsWithDetails
        }
      });
    }
  } catch (error) {
    console.error('Error fetching promotions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}