import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/static-pages?slug=privacy-policy&language=en
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  const language = searchParams.get('language') || 'en';

  if (!slug) {
    return NextResponse.json({ error: 'slug parameter required' }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  const { data: page, error } = await supabase
    .from('static_pages')
    .select('*, static_page_translations(*)')
    .eq('slug', slug)
    .eq('static_page_translations.language', language)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const translation = Array.isArray(page.static_page_translations) ? page.static_page_translations[0] : page.static_page_translations;

  return NextResponse.json({
    success: true,
    data: {
      id: page.id,
      slug: page.slug,
      content: translation?.content || '',
    },
  });
}
