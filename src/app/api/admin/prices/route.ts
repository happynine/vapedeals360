import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET all prices (optionally filter by product_id)
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');

    let query = client
      .from('product_prices')
      .select('*, stores(*, store_translations(*))')
      .order('current_price', { ascending: true });

    if (productId) {
      query = query.eq('product_id', parseInt(productId));
    }

    const { data, error } = await query;
    if (error) throw new Error(`Fetch failed: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST create price
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { product_id, store_id, current_price, original_price, product_url, in_stock, discount_percent } = body;

    const { data, error } = await client
      .from('product_prices')
      .insert({
        product_id,
        store_id,
        current_price,
        original_price: original_price || null,
        product_url,
        in_stock: in_stock !== false,
        discount_percent: discount_percent || null,
      })
      .select()
      .single();
    if (error) throw new Error(`Create price failed: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT update price
export async function PUT(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { id, product_id, store_id, current_price, original_price, product_url, in_stock, discount_percent } = body;

    const { data, error } = await client
      .from('product_prices')
      .update({
        product_id,
        store_id,
        current_price,
        original_price: original_price || null,
        product_url,
        in_stock,
        discount_percent: discount_percent || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Update price failed: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE price
export async function DELETE(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('Missing id parameter');

    const { error } = await client.from('product_prices').delete().eq('id', parseInt(id));
    if (error) throw new Error(`Delete price failed: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
