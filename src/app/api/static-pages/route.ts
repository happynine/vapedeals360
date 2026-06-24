import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/static-pages?slug=privacy-policy&language=en
// Allow ISR caching at page level

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "public");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  const language = searchParams.get('language') || 'en';

  if (!slug) {
    return NextResponse.json({ error: 'slug parameter required' }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  const { data: pages, error } = await supabase
    .from('static_pages')
    .select('*, static_page_translations(*)')
    .eq('slug', slug);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pages || pages.length === 0) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  const page = pages[0];
  const translation = (page.static_page_translations || []).find(
    (t: { language: string }) => t.language === language
  );

  return NextResponse.json({
    success: true,
    data: {
      id: page.id,
      slug: page.slug,
      content: translation?.content || '',
    },
  });
}
