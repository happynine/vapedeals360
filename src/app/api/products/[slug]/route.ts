import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { fetchProductBySlug } from '@/lib/database';

// API routes for client-side fetching - allow ISR caching at page level
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const rl = checkRateLimit(_request, "public");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  try {
    const { slug } = await params;
    const language = _request.nextUrl.searchParams.get('language') || 'en';
    const region = _request.nextUrl.searchParams.get('region') || undefined;
    const product = await fetchProductBySlug(slug, language, region);

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
