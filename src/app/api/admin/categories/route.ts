import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET all categories with translations
export async function GET(request: Request) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('categories')
      .select('*, category_translations(*)')
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`Fetch failed: ${error.message}`);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST create category with translations
export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { slug, icon, sort_order, is_active, translations } = body;

    const { data: category, error: catError } = await client
      .from('categories')
      .insert({ slug, icon, sort_order: sort_order || 0, is_active: is_active !== false })
      .select()
      .single();
    if (catError) throw new Error(`Create category failed: ${catError.message}`);

    if (translations && translations.length > 0) {
      const transRows = translations.map((t: { language: string; name: string }) => ({
        category_id: (category as Record<string, unknown>).id,
        language: t.language,
        name: t.name,
      }));
      const { error: transError } = await client.from('category_translations').insert(transRows);
      if (transError) throw new Error(`Create translations failed: ${transError.message}`);
    }

    return NextResponse.json({ success: true, data: category });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT update category
export async function PUT(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { id, slug, icon, sort_order, is_active, translations } = body;

    const { data: category, error: catError } = await client
      .from('categories')
      .update({ slug, icon, sort_order, is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (catError) throw new Error(`Update category failed: ${catError.message}`);

    // Update translations: delete old, insert new
    if (translations && translations.length > 0) {
      await client.from('category_translations').delete().eq('category_id', id);
      const transRows = translations.map((t: { language: string; name: string }) => ({
        category_id: id,
        language: t.language,
        name: t.name,
      }));
      const { error: transError } = await client.from('category_translations').insert(transRows);
      if (transError) throw new Error(`Update translations failed: ${transError.message}`);
    }

    return NextResponse.json({ success: true, data: category });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE category
export async function DELETE(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('Missing id parameter');

    const { error } = await client.from('categories').delete().eq('id', parseInt(id));
    if (error) throw new Error(`Delete category failed: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
