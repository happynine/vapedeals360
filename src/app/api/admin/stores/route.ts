import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET all stores
export async function GET() {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('stores')
      .select('*, store_translations(*)')
      .order('id', { ascending: true });
    if (error) throw new Error(`Fetch failed: ${error.message}`);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST create store
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { slug, logo_url, website_url, is_active, translations } = body;

    const { data: store, error: storeError } = await client
      .from('stores')
      .insert({ slug, logo_url, website_url, is_active: is_active !== false })
      .select()
      .single();
    if (storeError) throw new Error(`Create store failed: ${storeError.message}`);

    if (translations && translations.length > 0) {
      const transRows = translations.map((t: { language: string; name: string }) => ({
        store_id: (store as Record<string, unknown>).id,
        language: t.language,
        name: t.name,
      }));
      const { error: transError } = await client.from('store_translations').insert(transRows);
      if (transError) throw new Error(`Create translations failed: ${transError.message}`);
    }

    return NextResponse.json({ success: true, data: store });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT update store
export async function PUT(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { id, slug, logo_url, website_url, is_active, translations } = body;

    const { data: store, error: storeError } = await client
      .from('stores')
      .update({ slug, logo_url, website_url, is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (storeError) throw new Error(`Update store failed: ${storeError.message}`);

    if (translations && translations.length > 0) {
      await client.from('store_translations').delete().eq('store_id', id);
      const transRows = translations.map((t: { language: string; name: string }) => ({
        store_id: id,
        language: t.language,
        name: t.name,
      }));
      const { error: transError } = await client.from('store_translations').insert(transRows);
      if (transError) throw new Error(`Update translations failed: ${transError.message}`);
    }

    return NextResponse.json({ success: true, data: store });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE store
export async function DELETE(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('Missing id parameter');

    const { error } = await client.from('stores').delete().eq('id', parseInt(id));
    if (error) throw new Error(`Delete store failed: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
