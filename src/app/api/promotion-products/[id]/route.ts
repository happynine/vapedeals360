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
  store_translations?: StoreTranslation[];
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
  countdown_action: 'close' | 'original_price';
  store?: PriceStore;
}

interface ProductTranslation {
  id: number;
  promotion_product_id: number;
  name: string | null;
  description: string | null;
  features: string | null;
  specs: string | null;
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
  promotion_product_translations: ProductTranslation[];
  store_prices: StorePrice[];
}

interface PromotionTranslation {
  id: number;
  promotion_id: number;
  name: string | null;
  cover_image_key: string | null;
  cover_image_url: string | null;
  language: string;
}

interface Promotion {
  id: number;
  slug: string;
  title: string | null;
  time_type: string | null;
  promotion_translations?: PromotionTranslation[];
  translations?: PromotionTranslation[];
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

    // Get promotion product with translations
    const { data: product, error: productError } = await supabase
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
        promotion_product_translations (
          id,
          promotion_product_id,
          name,
          description,
          features,
          specs,
          language
        )
      `)
      .eq('id', productId)
      .single() as { data: PromotionProduct | null; error: any };

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Get store prices for this product
    const { data: prices, error: pricesError } = await supabase
      .from('promotion_product_prices')
      .select(`
        id,
        promotion_product_id,
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
      `)
      .eq('promotion_product_id', productId) as { data: StorePrice[] | null; error: any };

    if (pricesError) {
      console.error('Error fetching prices:', pricesError);
    }

    // Get store info for each price
    if (prices && prices.length > 0) {
      const storeIds = prices.filter(p => p.store_id).map(p => p.store_id);
      if (storeIds.length > 0) {
        const { data: stores } = await supabase
          .from('stores')
          .select('id, slug, logo_url, website_url, store_type, is_active, store_translations(id, store_id, name, language)')
          .in('id', storeIds) as { data: (PriceStore & { store_translations?: StoreTranslation[] })[] | null; error: any };

        if (stores) {
          prices.forEach(price => {
            const store = stores.find(s => s.id === price.store_id);
            if (store) {
              price.store = {
                ...store,
                translations: store.store_translations || [],
              };
            }
          });
        }
      }
    }

    product.store_prices = prices || [];

    // Get promotion info if promotion_id exists
    let promotion: Promotion | null = null;
    if (product.promotion_id) {
      const { data: promo, error: promoError } = await supabase
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
        .eq('id', product.promotion_id)
        .single() as { data: Promotion | null; error: any };

      if (!promoError && promo) {
        // Rename promotion_translations to translations for frontend compatibility
        promo.translations = promo.promotion_translations || [];
        promotion = promo;
      }
    }

    return NextResponse.json({
      product,
      promotion
    });
  } catch (error) {
    console.error('Error fetching promotion product:', error);
    return NextResponse.json(
      { error: 'Failed to fetch promotion product' },
      { status: 500 }
    );
  }
}
