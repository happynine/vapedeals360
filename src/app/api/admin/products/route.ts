import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET all products (admin view, including inactive)
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;
    const { data, error } = await client
      .from('products')
      .select('*, product_translations(*), product_prices(*, stores(*, store_translations(*))), categories(*, category_translations(*))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Fetch failed: ${error.message}`);
    // Get total count
    const { count, error: countError } = await client
      .from('products')
      .select('*', { count: 'exact', head: true });
    if (countError) throw new Error(`Count failed: ${countError.message}`);
    return NextResponse.json({
      success: true,
      data: { products: data, total: count, page, limit },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST create product
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { slug, category_id, image_url, image_url_small, images, is_active, is_featured, sales_region, notes, translations, prices } = body;
    // Create product
    const { data: product, error: prodError } = await client
      .from('products')
      .insert({
        slug,
        category_id,
        image_url,
        image_url_small,
        images: images ? JSON.stringify(images) : null,
        is_active: is_active !== false,
        is_featured: is_featured || false,
        sales_region: sales_region || '不限地区',
        notes: notes || '',
      })
      .select()
      .single();
    if (prodError) throw new Error(`Create product failed: ${prodError.message}`);
    const productId = (product as Record<string, unknown>).id as number;
    // Create translations
    if (translations && translations.length > 0) {
      const transRows = translations.map((t: Record<string, unknown>) => ({
        product_id: productId,
        language: t.language,
        name: t.name,
        description: t.description || null,
        features: t.features ? (typeof t.features === 'string' ? t.features : JSON.stringify(t.features)) : null,
        specs: t.specs ? (typeof t.specs === 'string' ? t.specs : JSON.stringify(t.specs)) : null,
      }));
      const { error: transError } = await client.from('product_translations').insert(transRows);
      if (transError) throw new Error(`Create translations failed: ${transError.message}`);
    }
    // Create prices
    if (prices && prices.length > 0) {
      const priceRows = prices.map((p: Record<string, unknown>) => ({
        product_id: productId,
        store_id: p.store_id,
        current_price: p.current_price,
        original_price: p.original_price || null,
        product_url: p.product_url,
        in_stock: p.in_stock !== false,
        discount_percent: p.discount_percent || null,
        currency: p.currency || '$',
        region: p.region || '',
        no_quote: p.no_quote || false,
      }));
      const { error: priceError } = await client.from('product_prices').insert(priceRows);
      if (priceError) throw new Error(`Create prices failed: ${priceError.message}`);
    }
    return NextResponse.json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT update product
export async function PUT(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { id, slug, category_id, image_url, image_url_small, images, is_active, is_featured, sales_region, notes, translations, prices } = body;
    const { data: product, error: prodError } = await client
      .from('products')
      .update({
        slug,
        category_id,
        image_url,
        image_url_small,
        images: images ? (typeof images === 'string' ? images : JSON.stringify(images)) : null,
        is_active,
        is_featured,
        sales_region: sales_region || '不限地区',
        notes: notes || '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (prodError) throw new Error(`Update product failed: ${prodError.message}`);
    // Update translations
    if (translations && translations.length > 0) {
      await client.from('product_translations').delete().eq('product_id', id);
      const transRows = translations.map((t: Record<string, unknown>) => ({
        product_id: id,
        language: t.language,
        name: t.name,
        description: t.description || null,
        features: t.features ? (typeof t.features === 'string' ? t.features : JSON.stringify(t.features)) : null,
        specs: t.specs ? (typeof t.specs === 'string' ? t.specs : JSON.stringify(t.specs)) : null,
      }));
      const { error: transError } = await client.from('product_translations').insert(transRows);
      if (transError) throw new Error(`Update translations failed: ${transError.message}`);
    }
    // Update prices
    if (prices && prices.length > 0) {
      await client.from('product_prices').delete().eq('product_id', id);
      const priceRows = prices.map((p: Record<string, unknown>) => ({
        product_id: id,
        store_id: p.store_id,
        current_price: p.current_price,
        original_price: p.original_price || null,
        product_url: p.product_url,
        in_stock: p.in_stock !== false,
        discount_percent: p.discount_percent || null,
        currency: p.currency || '$',
        region: p.region || '',
        no_quote: p.no_quote || false,
      }));
      const { error: priceError } = await client.from('product_prices').insert(priceRows);
      if (priceError) throw new Error(`Update prices failed: ${priceError.message}`);
    }
    return NextResponse.json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE product
export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('Missing id parameter');
    const { error } = await client.from('products').delete().eq('id', parseInt(id));
    if (error) throw new Error(`Delete product failed: ${error.message}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
