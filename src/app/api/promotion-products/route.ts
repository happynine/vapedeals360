import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET - 获取活动产品列表（前端展示，仅返回活跃活动的活跃产品）
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') || 'en';
    const region = searchParams.get('region') || 'USA';

    // 检查促销活动全局开关
    const { data: siteSettings } = await client
      .from('site_settings')
      .select('promotions_enabled')
      .single();

    if (siteSettings && !siteSettings.promotions_enabled) {
      return NextResponse.json({ success: true, data: { products: [] } });
    }

    // 获取所有活跃的促销活动
    const now = new Date().toISOString();
    const { data: activePromotions, error: promoError } = await client
      .from('promotions')
      .select('id, slug, promotion_translations(id, language, name, cover_image_url)')
      .eq('is_active', true)
      .or(`time_type.eq.permanent,and(time_type.eq.time_range,start_time.lte.${now},end_time.gte.${now}),and(time_type.eq.countdown,end_time.gte.${now})`);

    if (promoError) {
      return NextResponse.json({ error: promoError.message }, { status: 500 });
    }

    if (!activePromotions || activePromotions.length === 0) {
      return NextResponse.json({ success: true, data: { products: [] } });
    }

    const promotionIds = activePromotions.map((p: { id: number }) => p.id);
    const promotionMap = new Map(activePromotions.map((p: { id: number; slug: string; promotion_translations: Array<{ language: string; name: string | null; cover_image_url: string | null }> }) => [p.id, p]));

    // 获取这些活动下的活跃产品
    const { data: promotionProducts, error: ppError } = await client
      .from('promotion_products')
      .select(`
        id,
        promotion_id,
        slug,
        image_key,
        image_url,
        is_active,
        is_featured,
        special_price,
        notes,
        promotion_product_translations (
          id,
          name,
          description,
          language
        )
      `)
      .in('promotion_id', promotionIds)
      .eq('is_active', true);

    if (ppError) {
      return NextResponse.json({ error: ppError.message }, { status: 500 });
    }

    if (!promotionProducts || promotionProducts.length === 0) {
      return NextResponse.json({ success: true, data: { products: [] } });
    }

    // 获取每个产品的价格
    const ppIds = promotionProducts.map((pp: { id: number }) => pp.id);
    const { data: ppPrices, error: pricesError } = await client
      .from('promotion_product_prices')
      .select(`
        id,
        promotion_product_id,
        store_id,
        current_price,
        original_price,
        currency,
        region,
        no_quote,
        special_price,
        store_type,
        time_type,
        start_time,
        end_time,
        countdown_action,
        product_url
      `)
      .in('promotion_product_id', ppIds);

    if (pricesError) {
      console.error('Error fetching promotion product prices:', pricesError);
    }

    // 获取店铺信息
    const storeIds = [...new Set((ppPrices || []).map((p: { store_id: number | null }) => p.store_id).filter(Boolean))] as number[];
    let storesMap: Record<number, { id: number; slug: string; logo_url: string | null; is_active: boolean; store_translations: Array<{ id: number; store_id: number; language: string; name: string }> }> = {};
    if (storeIds.length > 0) {
      const { data: storesData } = await client
        .from('stores')
        .select('id, slug, logo_url, is_active, store_translations(id, store_id, language, name)')
        .in('id', storeIds);
      (storesData || []).forEach((s: { id: number }) => { storesMap[s.id] = s as typeof storesMap[0]; });
    }

    // 组装数据
    const products = promotionProducts.map((pp: {
      id: number;
      promotion_id: number;
      slug: string | null;
      image_key: string | null;
      image_url: string | null;
      is_active: boolean | null;
      is_featured: boolean | null;
      special_price: string | number | null;
      notes: string | null;
      promotion_product_translations: Array<{ id: number; name: string | null; description: string | null; language: string }>;
    }) => {
      const prices = (ppPrices || [])
        .filter((p: { promotion_product_id: number }) => p.promotion_product_id === pp.id)
        .map((p: {
          id: number;
          promotion_product_id: number;
          store_id: number | null;
          current_price: string | number | null;
          original_price: string | number | null;
          currency: string | null;
          region: string | null;
          no_quote: boolean | null;
          special_price: string | number | null;
          store_type: string;
          time_type: string;
          start_time: string | null;
          end_time: string | null;
          countdown_action: string;
          product_url: string | null;
        }) => ({
          ...p,
          store: p.store_id ? storesMap[p.store_id] || null : null,
        }));

      const promo = promotionMap.get(pp.promotion_id);

      return {
        ...pp,
        store_prices: prices,
        promotion: promo ? {
          slug: promo.slug,
          translations: promo.promotion_translations || [],
        } : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: { products },
    });
  } catch (error) {
    console.error('Error fetching promotion products:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
