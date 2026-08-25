import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = getSupabaseClient();
    
    // Get promotion by slug
    const { data: promotion, error: promotionError } = await supabase
      .from('promotions')
      .select(`
        id,
        slug,
        sort_order,
        is_active,
        time_type,
        start_time,
        end_time,
        translations:promotion_translations (
          id,
          name,
          title,
          description,
          cover_image_key,
          cover_image_url,
          language
        )
      `)
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (promotionError) {
      console.error('Promotion query error:', promotionError);
      return NextResponse.json({ error: 'Promotion not found', details: promotionError.message }, { status: 404 });
    }
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found - no data returned' }, { status: 404 });
    }

    // 从 product_prices 查询该活动下的价格行
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

    // 过滤已过期的价格行
    const now = new Date();
    const activePrices = (promoPrices || []).filter((p: { time_type?: string; end_time?: string | null }) => {
      if (!p.time_type || p.time_type === 'permanent') return true;
      if (!p.end_time) return true;
      return now <= new Date(p.end_time);
    });

    // 获取店铺信息
    const storeIds = [...new Set(activePrices.map((p: { store_id: number | null }) => p.store_id).filter(Boolean))] as number[];
    let storesMap: Record<number, Record<string, unknown>> = {};
    if (storeIds.length > 0) {
      const { data: storesData } = await supabase
        .from('stores')
        .select('id, slug, logo_url, is_active, store_translations(id, store_id, language, name)')
        .in('id', storeIds);
      (storesData || []).forEach((s: { id: number }) => { storesMap[s.id] = s; });
    }

    // 按 product_id 分组
    const grouped = new Map<number, { product: Record<string, unknown>; prices: Array<Record<string, unknown>>; is_featured: boolean }>();

    for (const price of activePrices) {
      const product = price.products as Record<string, unknown> | null;
      if (!product || product.is_active === false) continue;

      const pid = product.id as number;
      if (!grouped.has(pid)) {
        grouped.set(pid, { product, prices: [], is_featured: !!price.is_featured_in_promotion });
      }
      const entry = grouped.get(pid)!;
      entry.prices.push({
        id: price.id,
        store_id: price.store_id,
        region: price.region,
        current_price: price.current_price,
        original_price: price.original_price,
        discount_percent: price.discount_percent,
        currency: price.currency,
        product_url: price.product_url,
        no_quote: price.no_quote,
        store_type: 'promotion',
        time_type: price.time_type,
        start_time: price.start_time,
        end_time: price.end_time,
        countdown_action: price.countdown_action,
        standard_price: price.standard_price,
        store: price.store_id ? storesMap[price.store_id] || null : null,
      });
    }

    // 组装为前端期望的格式
    const promotionProducts = Array.from(grouped.values()).map(({ product, prices, is_featured }) => ({
      id: product.id,
      promotion_id: promotion.id,
      product_id: product.id,
      slug: product.slug,
      category_id: product.category_id || null,
      image_key: product.home_image_key,
      image_url: product.image_url,
      home_image_key: product.home_image_key,
      home_image_url: null,
      is_active: true,
      is_featured,
      notes: null,
      translations: (product.product_translations || []).map((t: Record<string, unknown>) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        language: t.language,
      })),
      store_prices: prices,
    }));

    // Combine all data
    const result = {
      ...promotion,
      promotion_products: promotionProducts,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in promotion detail API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
