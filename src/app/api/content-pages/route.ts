import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { makeExcerpt } from '@/lib/excerpt';

// GET /api/content-pages?type=best_vapes&language=en
// Allow ISR caching at page level

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "public");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'best_vapes' | 'news'
  const language = searchParams.get('language') || 'en';
  const slug = searchParams.get('slug');

  const supabase = getSupabaseClient();

  if (slug) {
    // Get single content page detail (only published)
    const { data: pages, error: pageError } = await supabase
      .from('content_pages')
      .select('*, content_page_translations(*, authors(*))')
      .eq('slug', slug)
      .eq('is_published', true)
      .eq('content_page_translations.language', language)
      .limit(1);

    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 500 });
    }

    const page = pages?.[0];
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const translation = page.content_page_translations?.[0] || page.content_page_translations;
    const author = translation?.authors;
    const authorData = author ? {
      id: author.id,
      name: author.name,
      avatar_url: author.avatar_url,
      bio: author.bio,
    } : null;

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
        author: authorData,
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
    .select('*, content_page_translations(*, authors(*))')
    .eq('type', type)
    .eq('is_published', true)
    .eq('content_page_translations.language', language)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const formattedPages = (pages || []).map((p: Record<string, unknown>) => {
    const rawTranslation = p.content_page_translations;
    const translation = Array.isArray(rawTranslation) ? rawTranslation[0] : rawTranslation;
    const author = (translation as { authors?: unknown } | null)?.authors as
      | { id?: number; name?: string; avatar_url?: string | null }
      | null
      | undefined;
    return {
      id: p.id,
      type: p.type,
      slug: p.slug,
      cover_image: p.cover_image,
      sort_order: p.sort_order,
      created_at: p.created_at,
      title: translation?.title || '',
      excerpt: makeExcerpt((translation as { content?: string } | null)?.content),
      author: author ? { id: author.id, name: author.name, avatar_url: author.avatar_url } : null,
    };
  });

  return NextResponse.json({
    success: true,
    description: descData?.description || '',
    data: formattedPages,
  });
}

