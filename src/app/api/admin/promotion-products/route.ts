import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET - Fetch all promotion products
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  try {
    // Fetch promotion products with translations and store prices
    const { data: promotionProducts, error: ppError } = await supabase
      .from('promotion_products')
      .select(`
        *,
        promotion_product_translations (*),
        promotion_product_prices (*)
      `)
      .order('id', { ascending: true });

    if (ppError) {
      return NextResponse.json({ success: false, error: ppError.message }, { status: 500 });
    }

    // Get unique promotion IDs and category IDs and store IDs
    const promotionIds = [...new Set(promotionProducts?.map(pp => pp.promotion_id) || [])];
    const categoryIds = [...new Set(promotionProducts?.map(pp => pp.category_id).filter(Boolean) || [])];
    const storeIds = [...new Set(promotionProducts?.flatMap(pp => (pp.promotion_product_prices as Array<{ store_id: number }>)?.map((sp: { store_id: number }) => sp.store_id) || []).filter(Boolean) || [])];

    // Fetch related data separately
    const [promotionsRes, categoriesRes, storesRes] = await Promise.all([
      supabase.from('promotions').select('id, slug, promotion_type, special_price, currency, promotion_translations (name, language)').in('id', promotionIds),
      categoryIds.length > 0 
        ? supabase.from('categories').select('id, slug, category_translations (name, language)').in('id', categoryIds)
        : { data: [], error: null },
      storeIds.length > 0
        ? supabase.from('stores').select('id, slug, store_translations (name, language)').in('id', storeIds)
        : { data: [], error: null }
    ]);

    if (promotionsRes.error || categoriesRes.error || storesRes.error) {
      return NextResponse.json({ success: false, error: 'Failed to fetch related data' }, { status: 500 });
    }

    // Combine data
    const combinedData = promotionProducts?.map(pp => ({
      ...pp,
      promotions: promotionsRes.data?.find(p => p.id === pp.promotion_id) || null,
      categories: pp.category_id ? categoriesRes.data?.find(c => c.id === pp.category_id) || null : null,
      stores: (pp.promotion_product_prices as Array<{ store_id: number; [key: string]: unknown }>)?.map((sp: { store_id: number; [key: string]: unknown }) => ({
        ...sp,
        store: storesRes.data?.find(s => s.id === sp.store_id) || null
      })) || []
    })) || [];

    return NextResponse.json({ success: true, data: combinedData });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// POST - Create a new promotion product
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  const body = await request.json();

  try {
    const {
      promotion_id,
      slug,
      category_id,
      image_key,
      image_url,
      is_active,
      is_featured,
      notes,
      translations,
      store_prices
    } = body;

    // Validate required fields
    if (!promotion_id || !slug) {
      return NextResponse.json({ success: false, error: 'Promotion ID and Slug are required' }, { status: 400 });
    }

    // Check if slug already exists
    const { data: existingSlug } = await supabase
      .from('promotion_products')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existingSlug) {
      return NextResponse.json({ success: false, error: 'Slug already exists' }, { status: 400 });
    }

    // Create promotion product
    const { data: promotionProduct, error: ppError } = await supabase
      .from('promotion_products')
      .insert({
        promotion_id,
        slug,
        category_id: category_id || null,
        image_key: image_key || null,
        image_url: image_url || null,
        is_active: is_active ?? true,
        is_featured: is_featured ?? false,
        notes: notes || null
      })
      .select()
      .single();

    if (ppError) {
      return NextResponse.json({ success: false, error: ppError.message }, { status: 500 });
    }

    // Create translations if provided
    if (translations && translations.length > 0 && promotionProduct) {
      const translationRecords = translations.map((t: { language: string; name: string; description: string | null; features: string | null; specs: string | null }) => ({
        promotion_product_id: promotionProduct.id,
        language: t.language,
        name: t.name,
        description: t.description || null,
        features: t.features || null,
        specs: t.specs || null
      }));

      const { error: transError } = await supabase
        .from('promotion_product_translations')
        .insert(translationRecords);

      if (transError) {
        // Rollback promotion product creation
        await supabase.from('promotion_products').delete().eq('id', promotionProduct.id);
        return NextResponse.json({ success: false, error: transError.message }, { status: 500 });
      }
    }

    // Create store prices if provided
    if (store_prices && store_prices.length > 0 && promotionProduct) {
      const storePriceRecords = store_prices.map((sp: { 
        store_id: number; 
        region: string; 
        current_price: string; 
        original_price: string; 
        discount_percent: string; 
        currency: string; 
        product_url: string; 
        no_quote: boolean;
        time_type: string;
        start_time: string | null;
        end_time: string | null;
        countdown_action: string;
      }) => ({
        promotion_product_id: promotionProduct.id,
        store_id: sp.store_id,
        region: sp.region || null,
        current_price: sp.current_price || null,
        original_price: sp.original_price || null,
        discount_percent: sp.discount_percent ? parseFloat(sp.discount_percent) : null,
        currency: sp.currency || '$',
        product_url: sp.product_url || null,
        no_quote: sp.no_quote ?? false,
        time_type: sp.time_type || 'permanent',
        start_time: sp.start_time || null,
        end_time: sp.end_time || null,
        countdown_action: sp.countdown_action || 'close'
      }));

      const { error: spError } = await supabase
        .from('promotion_product_prices')
        .insert(storePriceRecords);

      if (spError) {
        // Rollback promotion product creation
        await supabase.from('promotion_products').delete().eq('id', promotionProduct.id);
        return NextResponse.json({ success: false, error: spError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, data: promotionProduct });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// PUT - Update a promotion product
export async function PUT(request: NextRequest) {
  const supabase = getSupabaseClient();
  const body = await request.json();

  try {
    const {
      id,
      promotion_id,
      slug,
      category_id,
      image_key,
      image_url,
      is_active,
      is_featured,
      notes,
      translations,
      store_prices
    } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    // Update promotion product
    const { data: promotionProduct, error: ppError } = await supabase
      .from('promotion_products')
      .update({
        promotion_id,
        slug,
        category_id: category_id || null,
        image_key: image_key || null,
        image_url: image_url || null,
        is_active: is_active ?? true,
        is_featured: is_featured ?? false,
        notes: notes || null
      })
      .eq('id', id)
      .select()
      .single();

    if (ppError) {
      return NextResponse.json({ success: false, error: ppError.message }, { status: 500 });
    }

    // Update translations if provided
    if (translations && translations.length > 0 && promotionProduct) {
      // Delete existing translations
      await supabase.from('promotion_product_translations').delete().eq('promotion_product_id', promotionProduct.id);

      // Insert new translations
      const translationRecords = translations.map((t: { language: string; name: string; description: string | null; features: string | null; specs: string | null }) => ({
        promotion_product_id: promotionProduct.id,
        language: t.language,
        name: t.name,
        description: t.description || null,
        features: t.features || null,
        specs: t.specs || null
      }));

      const { error: transError } = await supabase
        .from('promotion_product_translations')
        .insert(translationRecords);

      if (transError) {
        return NextResponse.json({ success: false, error: transError.message }, { status: 500 });
      }
    }

    // Update store prices if provided
    if (store_prices && promotionProduct) {
      // Delete existing store prices
      await supabase.from('promotion_product_prices').delete().eq('promotion_product_id', promotionProduct.id);

      // Insert new store prices
      if (store_prices.length > 0) {
        const storePriceRecords = store_prices.map((sp: { 
          store_id: number; 
          region: string; 
          current_price: string; 
          original_price: string; 
          discount_percent: string; 
          currency: string; 
          product_url: string; 
          no_quote: boolean;
          time_type: string;
          start_time: string | null;
          end_time: string | null;
          countdown_action: string;
        }) => ({
          promotion_product_id: promotionProduct.id,
          store_id: sp.store_id,
          region: sp.region || null,
          current_price: sp.current_price || null,
          original_price: sp.original_price || null,
          discount_percent: sp.discount_percent ? parseFloat(sp.discount_percent) : null,
          currency: sp.currency || '$',
          product_url: sp.product_url || null,
          no_quote: sp.no_quote ?? false,
          time_type: sp.time_type || 'permanent',
          start_time: sp.start_time || null,
          end_time: sp.end_time || null,
          countdown_action: sp.countdown_action || 'close'
        }));

        const { error: spError } = await supabase
          .from('promotion_product_prices')
          .insert(storePriceRecords);

        if (spError) {
          return NextResponse.json({ success: false, error: spError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true, data: promotionProduct });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// DELETE - Delete a promotion product
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  // Get id from URL query parameter
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  try {
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    const productId = parseInt(id, 10);
    if (isNaN(productId)) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    // Delete translations first
    await supabase.from('promotion_product_translations').delete().eq('promotion_product_id', productId);

    // Delete store prices
    await supabase.from('promotion_product_prices').delete().eq('promotion_product_id', productId);

    // Delete promotion product
    const { error } = await supabase
      .from('promotion_products')
      .delete()
      .eq('id', productId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}