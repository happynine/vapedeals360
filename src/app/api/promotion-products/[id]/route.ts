import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

interface StoreTranslation {
  id: number;
  store_id: number;
  name: string;
  language: string;
}

interface PriceStore {
  id: number;
  slug: string;
  logo_url: string | null;
  website_url: string | null;
  store_type: string;
  is_active: boolean;
  translations?: StoreTranslation[];
}

interface StorePrice {
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
  promo_price?: number | null;
  store?: PriceStore;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();
    const productId = parseInt(id, 10);

    if (!productId) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const promotionSlug = searchParams.get('promotion');

    // 从 products + product_translations 获取产品信息
    const { data: product, error: productError } = await supabase
      .from('products')
      .select(`
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
          product_id,
          name,
          description,
          features,
          specs,
          language
        )
      `)
      .eq('id', productId)
      .eq('is_active', true)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // 查询该产品的促销价格（如果指定了 promotion slug，先找到 promotion_id）
    let promoPriceQuery = supabase
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
        promo_price,
        is_promotion_hidden,
        in_stock,
        promotion_id
      `)
      .eq('product_id', productId)
      .not('promotion_id', 'is', null)
      .eq('is_promotion_hidden', false);

    // 如果指定了 promotion slug，查找对应的 promotion_id
    let targetPromotionId: number | null = null;
    if (promotionSlug) {
      const { data: promo } = await supabase
        .from('promotions')
        .select('id')
        .eq('slug', promotionSlug)
        .eq('is_active', true)
        .single();
      if (promo) {
        targetPromotionId = promo.id;
        promoPriceQuery = promoPriceQuery.eq('promotion_id', promo.id);
      }
    }

    const { data: promoPrices, error: pricesError } = await promoPriceQuery;

    if (pricesError) {
      console.error('Error fetching prices:', pricesError);
    }

    // 过滤已过期的价格
    const now = new Date();
    const activePrices = (promoPrices || []).filter((p: any) => {
      if (!p.time_type || p.time_type === 'permanent') return true;
      if (!p.end_time) return true;
      return now <= new Date(p.end_time);
    });

    // 获取店铺信息
    let storePrices: StorePrice[] = [];
    if (activePrices.length > 0) {
      const storeIds = activePrices.map((p: any) => p.store_id).filter(Boolean);
      const uniqueStoreIds = [...new Set(storeIds)] as number[];

      if (uniqueStoreIds.length > 0) {
        const { data: stores } = await supabase
          .from('stores')
          .select('id, slug, logo_url, website_url, store_type, is_active, store_translations(id, store_id, name, language)')
          .in('id', uniqueStoreIds);

        const storesMap = new Map<number, any>();
        (stores || []).forEach((s: any) => storesMap.set(s.id, s));

        storePrices = activePrices.map((p: any) => {
          const store = p.store_id ? storesMap.get(p.store_id) : null;
          return {
            id: p.id,
            store_id: p.store_id,
            region: p.region,
            current_price: p.current_price,
            original_price: p.original_price,
            discount_percent: p.discount_percent,
            currency: p.currency,
            product_url: p.product_url,
            no_quote: p.no_quote,
            store_type: 'promotion' as const,
            time_type: p.time_type,
            start_time: p.start_time,
            end_time: p.end_time,
            countdown_action: p.countdown_action,
            promo_price: p.promo_price,
            store: store ? {
              id: store.id,
              slug: store.slug,
              logo_url: store.logo_url,
              website_url: store.website_url,
              store_type: store.store_type,
              is_active: store.is_active,
              translations: (store.store_translations || []).map((t: any) => ({
                id: t.id,
                store_id: t.store_id,
                name: t.name,
                language: t.language,
              })),
            } : undefined,
          };
        });
      } else {
        storePrices = activePrices.map((p: any) => ({
          ...p,
          store_type: 'promotion' as const,
          store: undefined,
        }));
      }
    }

    // 组装为前端期望的格式
    const productData = {
      id: product.id,
      promotion_id: targetPromotionId || (activePrices[0] as any)?.promotion_id || null,
      slug: product.slug,
      category_id: product.category_id,
      image_key: product.home_image_key,
      image_url: product.image_url,
      is_active: product.is_active,
      is_featured: product.is_featured,
      notes: null,
      promotion_product_translations: (product.product_translations || []).map((t: any) => ({
        id: t.id,
        promotion_product_id: product.id,
        name: t.name,
        description: t.description,
        features: t.features,
        specs: t.specs,
        language: t.language,
      })),
      store_prices: storePrices,
    };

    // 获取活动信息
    let promotion: any = null;
    const promoId = productData.promotion_id;
    if (promoId) {
      const { data: promo } = await supabase
        .from('promotions')
        .select(`
          id,
          slug,
          title,
          time_type,
          promotion_translations (
            id,
            promotion_id,
            name,
            cover_image_key,
            cover_image_url,
            language
          )
        `)
        .eq('id', promoId)
        .single();

      if (promo) {
        promotion = {
          ...promo,
          translations: promo.promotion_translations || [],
        };
      }
    }

    return NextResponse.json({
      product: productData,
      promotion,
    });
  } catch (error) {
    console.error('Error fetching promotion product:', error);
    return NextResponse.json(
      { error: 'Failed to fetch promotion product' },
      { status: 500 }
    );
  }
}
