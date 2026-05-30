import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/admin/static-pages?slug=privacy-policy
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'slug parameter required' }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  const { data: page, error } = await supabase
    .from('static_pages')
    .select('*, static_page_translations(*)')
    .eq('slug', slug)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: page });
}

// PUT - Auto-save draft content (does NOT publish)
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { slug, translations } = body;

  const supabase = getSupabaseClient();

  // Get page id
  const { data: page } = await supabase
    .from('static_pages')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  // Update timestamp
  await supabase
    .from('static_pages')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', page.id);

  // Save translations as draft
  if (translations) {
    for (const t of translations) {
      if (t.id) {
        await supabase
          .from('static_page_translations')
          .update({ draft_content: t.content })
          .eq('id', t.id);
      } else {
        await supabase
          .from('static_page_translations')
          .insert({ page_id: page.id, language: t.language, draft_content: t.content, content: '' });
      }
    }
  }

  return NextResponse.json({ success: true });
}

// POST - Publish: copy draft_content to content and set is_published = true
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { slug } = body;

  const supabase = getSupabaseClient();

  // Get page
  const { data: page, error: pageError } = await supabase
    .from('static_pages')
    .select('id, static_page_translations(*)')
    .eq('slug', slug)
    .single();

  if (pageError || !page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  // Copy draft_content → content for all translations
  for (const t of page.static_page_translations) {
    const draftContent = t.draft_content ?? '';
    await supabase
      .from('static_page_translations')
      .update({ content: draftContent })
      .eq('id', t.id);
  }

  // Mark as published
  await supabase
    .from('static_pages')
    .update({ is_published: true, updated_at: new Date().toISOString() })
    .eq('id', page.id);

  return NextResponse.json({ success: true });
}
