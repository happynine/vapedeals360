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
        title,
        sort_order,
        is_active,
        translations:promotion_translations (
          id,
          name,
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

    // Get promotion products with their data
    const { data: promotionProducts, error: productsError } = await supabase
      .from('promotion_products')
      .select(`
        id,
        promotion_id,
        slug,
        category_id,
        image_key,
        image_url,
        is_active,
        is_featured,
        notes,
        translations:promotion_product_translations (
          id,
          name,
          description,
          language
        )
      `)
      .eq('promotion_id', promotion.id);

    if (productsError) {
      console.error('Error fetching promotion products:', productsError);
    }

    // Get store prices for each promotion product
    const productsWithPrices = await Promise.all(
      (promotionProducts || []).map(async (product) => {
        const { data: storePrices, error: pricesError } = await supabase
          .from('promotion_product_prices')
          .select(`
            id,
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
            countdown_action
          `)
          .eq('promotion_product_id', product.id);

        if (pricesError) {
          console.error('Error fetching store prices:', pricesError);
        }

        // Get store info for each price
        const pricesWithStores = await Promise.all(
          (storePrices || []).map(async (price) => {
            if (!price.store_id) return price;
            
            const { data: store, error: storeError } = await supabase
              .from('stores')
              .select('id, name, icon_url')
              .eq('id', price.store_id)
              .single();
            
            if (!storeError && store) {
              return { ...price, store };
            }
            return price;
          })
        );

        return {
          ...product,
          store_prices: pricesWithStores
        };
      })
    );

    // Combine all data
    const result = {
      ...promotion,
      promotion_products: productsWithPrices
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in promotion detail API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}