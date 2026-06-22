import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET - Fetch all promotion products
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  try {
    // Fetch promotion products
    const { data: promotionProducts, error: ppError } = await supabase
      .from('promotion_products')
      .select('*')
      .order('id', { ascending: true });

    if (ppError) {
      return NextResponse.json({ success: false, error: ppError.message }, { status: 500 });
    }

    // Get unique product IDs, promotion IDs, and store IDs
    const productIds = [...new Set(promotionProducts?.map(pp => pp.product_id) || [])];
    const promotionIds = [...new Set(promotionProducts?.map(pp => pp.promotion_id) || [])];
    const storeIds = [...new Set(promotionProducts?.map(pp => pp.store_id).filter(Boolean) || [])];

    // Fetch related data separately
    const [productsRes, promotionsRes, storesRes] = await Promise.all([
      supabase.from('products').select('id, slug, product_translations (name, language)').in('id', productIds),
      supabase.from('promotions').select('id, slug, promotion_type, special_price, currency, promotion_translations (name, language)').in('id', promotionIds),
      storeIds.length > 0 
        ? supabase.from('stores').select('id, slug, store_translations (name, language)').in('id', storeIds)
        : { data: [], error: null }
    ]);

    if (productsRes.error || promotionsRes.error || storesRes.error) {
      return NextResponse.json({ success: false, error: 'Failed to fetch related data' }, { status: 500 });
    }

    // Combine data
    const combinedData = promotionProducts?.map(pp => ({
      ...pp,
      products: productsRes.data?.find(p => p.id === pp.product_id) || null,
      promotions: promotionsRes.data?.find(p => p.id === pp.promotion_id) || null,
      stores: pp.store_id ? storesRes.data?.find(s => s.id === pp.store_id) || null : null
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
      product_id,
      store_id,
      special_price,
      currency,
      time_type,
      start_time,
      end_time,
      countdown_action,
      is_active
    } = body;

    // Validate required fields
    if (!promotion_id || !product_id) {
      return NextResponse.json({ success: false, error: 'Promotion ID and Product ID are required' }, { status: 400 });
    }

    // Check if this promotion-product combination already exists
    const { data: existing } = await supabase
      .from('promotion_products')
      .select('id')
      .eq('promotion_id', promotion_id)
      .eq('product_id', product_id)
      .eq('store_id', store_id || null)
      .single();

    if (existing) {
      return NextResponse.json({ success: false, error: 'This product is already added to this promotion' }, { status: 400 });
    }

    // Create promotion product
    const { data, error } = await supabase
      .from('promotion_products')
      .insert({
        promotion_id,
        product_id,
        store_id: store_id || null,
        special_price: special_price || null,
        currency: currency || '$',
        time_type: time_type || 'permanent',
        start_time: start_time || null,
        end_time: end_time || null,
        countdown_action: countdown_action || 'close',
        is_active: is_active ?? true
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
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
      product_id,
      store_id,
      special_price,
      currency,
      time_type,
      start_time,
      end_time,
      countdown_action,
      is_active
    } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    // Update promotion product
    const { data, error } = await supabase
      .from('promotion_products')
      .update({
        promotion_id,
        product_id,
        store_id: store_id || null,
        special_price: special_price || null,
        currency: currency || '$',
        time_type: time_type || 'permanent',
        start_time: start_time || null,
        end_time: end_time || null,
        countdown_action: countdown_action || 'close',
        is_active: is_active ?? true
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// DELETE - Delete a promotion product
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('promotion_products')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}