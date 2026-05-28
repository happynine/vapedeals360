import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/content-pages?type=best_vapes&language=en
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'best_vapes' | 'news'
  const language = searchParams.get('language') || 'en';
  const slug = searchParams.get('slug');

  const supabase = getSupabaseClient();

  if (slug) {
    // Get single content page detail
    const { data: page, error: pageError } = await supabase
      .from('content_pages')
      .select('*, content_page_translations(*)')
      .eq('slug', slug)
      .eq('content_page_translations.language', language)
      .single();

    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 500 });
    }

    const translation = page.content_page_translations?.[0] || page.content_page_translations;

    return NextResponse.json({
      success: true,
      data: {
        id: page.id,
        type: page.type,
        slug: page.slug,
        cover_image: page.cover_image,
        sort_order: page.sort_order,
        is_published: page.is_published,
        created_at: page.created_at,
        title: translation?.title || '',
        content: translation?.content || '',
      },
    });
  }

  if (!type) {
    return NextResponse.json({ error: 'type or slug parameter required' }, { status: 400 });
  }

  // Get category description
  const { data: descData } = await supabase
    .from('category_descriptions')
    .select('description')
    .eq('category_key', type)
    .eq('language', language)
    .single();

  // Get content pages list
  const { data: pages, error } = await supabase
    .from('content_pages')
    .select('*, content_page_translations(*)')
    .eq('type', type)
    .eq('is_published', true)
    .eq('content_page_translations.language', language)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const formattedPages = (pages || []).map((p: Record<string, unknown>) => {
    const translation = Array.isArray(p.content_page_translations) ? p.content_page_translations[0] : p.content_page_translations;
    return {
      id: p.id,
      type: p.type,
      slug: p.slug,
      cover_image: p.cover_image,
      sort_order: p.sort_order,
      title: translation?.title || '',
    };
  });

  return NextResponse.json({
    success: true,
    description: descData?.description || '',
    data: formattedPages,
  });
}
