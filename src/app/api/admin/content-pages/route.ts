import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/admin/content-pages?type=best_vapes
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');

  const supabase = getSupabaseClient();

  if (id) {
    // Get single page with all translations
    const { data: page, error } = await supabase
      .from('content_pages')
      .select('*, content_page_translations(*)')
      .eq('id', parseInt(id))
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: page });
  }

  if (!type) {
    return NextResponse.json({ error: 'type parameter required' }, { status: 400 });
  }

  // Get category description
  const { data: descData } = await supabase
    .from('category_descriptions')
    .select('*')
    .eq('category_key', type);

  // Get all pages of this type
  const { data: pages, error } = await supabase
    .from('content_pages')
    .select('*, content_page_translations(*)')
    .eq('type', type)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    description: descData || [],
    data: pages || [],
  });
}

// POST - Create new content page
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { type, slug, cover_image, sort_order, is_published, translations } = body;

  const supabase = getSupabaseClient();

  // Check for duplicate slug
  const { data: existing } = await supabase
    .from('content_pages')
    .select('id')
    .eq('slug', slug)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'A page with this slug already exists' }, { status: 409 });
  }

  const { data: page, error: pageError } = await supabase
    .from('content_pages')
    .insert({ type, slug, cover_image, sort_order: sort_order || 0, is_published: is_published !== false })
    .select()
    .single();

  if (pageError) {
    return NextResponse.json({ error: pageError.message }, { status: 500 });
  }

  if (translations && translations.length > 0) {
    const translationRows = translations.map((t: { language: string; title: string; content: string }) => ({
      page_id: page.id,
      language: t.language,
      title: t.title,
      content: t.content,
    }));

    const { error: transError } = await supabase
      .from('content_page_translations')
      .insert(translationRows);

    if (transError) {
      return NextResponse.json({ error: transError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, data: page });
}

// PUT - Update content page
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, slug, cover_image, sort_order, is_published, translations } = body;

  const supabase = getSupabaseClient();

  const { error: pageError } = await supabase
    .from('content_pages')
    .update({ slug, cover_image, sort_order, is_published, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (pageError) {
    return NextResponse.json({ error: pageError.message }, { status: 500 });
  }

  if (translations) {
    for (const t of translations) {
      if (t.id) {
        await supabase
          .from('content_page_translations')
          .update({ title: t.title, content: t.content })
          .eq('id', t.id);
      } else {
        await supabase
          .from('content_page_translations')
          .insert({ page_id: id, language: t.language, title: t.title, content: t.content });
      }
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE - Delete content page
export async function DELETE(request: NextRequest) {
  let id: string | null;
  
  // Try to get id from query params first, then from body
  const { searchParams } = new URL(request.url);
  id = searchParams.get('id');
  
  if (!id) {
    const body = await request.json();
    id = body.id?.toString();
  }

  if (!id) {
    return NextResponse.json({ error: 'id parameter required' }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('content_pages')
    .delete()
    .eq('id', parseInt(id));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
