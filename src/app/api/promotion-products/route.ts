import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET - 获取活动产品列表（前端展示，从 product_prices 按 promotion_id 查询）
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') || 'en';

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
    const promotionMap = new Map<number, { id: number; slug: string; promotion_translations: Array<{ language: string; name: string | null; cover_image_url: string | null }> }>(
      activePromotions.map((p: { id: number; slug: string; promotion_translations: Array<{ language: string; name: string | null; cover_image_url: string | null }> }) => [p.id, p])
    );

    // 从 product_prices 查询关联了活动的价格行
    const { data: promoPrices, error: pricesError } = await client
      .from('product_prices')
      .select(`
        id,
        product_id,
        promotion_id,
        store_id,
        current_price,
        original_price,
        currency,
        region,
        no_quote,
        product_url,
        time_type,
        start_time,
        end_time,
        countdown_action,
        standard_price,
        is_promotion_hidden,
        is_featured_in_promotion,
        in_stock,
        discount_percent,
        products (
          id,
          slug,
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
      .in('promotion_id', promotionIds)
      .eq('is_promotion_hidden', false);

    if (pricesError) {
      return NextResponse.json({ error: pricesError.message }, { status: 500 });
    }

    if (!promoPrices || promoPrices.length === 0) {
      return NextResponse.json({ success: true, data: { products: [] } });
    }

    // 过滤已过期的价格行
    const nowDate = new Date();
    const activePrices = promoPrices.filter((p: { time_type?: string; end_time?: string | null }) => {
      if (!p.time_type || p.time_type === 'permanent') return true;
      if (!p.end_time) return true;
      return nowDate <= new Date(p.end_time);
    });

    if (activePrices.length === 0) {
      return NextResponse.json({ success: true, data: { products: [] } });
    }

    // 获取店铺信息
    const storeIds = [...new Set(activePrices.map((p: { store_id: number | null }) => p.store_id).filter(Boolean))] as number[];
    let storesMap: Record<number, { id: number; slug: string; logo_url: string | null; is_active: boolean; store_translations: Array<{ id: number; store_id: number; language: string; name: string }> }> = {};
    if (storeIds.length > 0) {
      const { data: storesData } = await client
        .from('stores')
        .select('id, slug, logo_url, is_active, store_translations(id, store_id, language, name)')
        .in('id', storeIds);
      (storesData || []).forEach((s: { id: number }) => { storesMap[s.id] = s as typeof storesMap[0]; });
    }

    // 按 product_id + promotion_id 分组
    const grouped = new Map<string, { product: Record<string, unknown>; promotion_id: number; prices: Array<Record<string, unknown>>; is_featured: boolean }>();

    for (const price of activePrices) {
      const product = price.products as Record<string, unknown> | null;
      if (!product || product.is_active === false) continue;

      const key = `${price.product_id}_${price.promotion_id}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          product,
          promotion_id: price.promotion_id,
          prices: [],
          is_featured: !!price.is_featured_in_promotion,
        });
      }
      const entry = grouped.get(key)!;
      entry.prices.push({
        id: price.id,
        store_id: price.store_id,
        current_price: price.current_price,
        original_price: price.original_price,
        currency: price.currency,
        region: price.region,
        no_quote: price.no_quote,
        product_url: price.product_url,
        time_type: price.time_type,
        start_time: price.start_time,
        end_time: price.end_time,
        countdown_action: price.countdown_action,
        standard_price: price.standard_price,
        discount_percent: price.discount_percent,
        store_type: 'promotion',
        store: price.store_id ? storesMap[price.store_id] || null : null,
      });
    }

    // 组装为前端期望的格式
    const products = Array.from(grouped.values()).map(({ product, promotion_id, prices, is_featured }) => {
      const translations = (product.product_translations || []) as Array<{ language: string; name: string | null; description: string | null }>;
      const enTrans = translations.find((t) => t.language === 'en');
      const promo = promotionMap.get(promotion_id);

      return {
        id: product.id,
        promotion_id,
        product_id: product.id,
        slug: product.slug,
        image_key: product.home_image_key,
        image_url: product.image_url,
        is_active: true,
        is_featured,
        special_price: null,
        notes: null,
        promotion_product_translations: translations.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          language: t.language,
        })),
        store_prices: prices,
        promotion: promo ? {
          slug: promo.slug,
          translations: promo.promotion_translations || [],
        } : null,
      };
    }).filter((p: { store_prices: unknown[] }) => p.store_prices.length > 0);

    return NextResponse.json({
      success: true,
      data: { products },
    });
  } catch (error) {
    console.error('Error fetching promotion products:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
