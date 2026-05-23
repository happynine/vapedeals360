import { NextRequest, NextResponse } from 'next/server';
import { fetchProductBySlug } from '@/lib/database';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const language = _request.nextUrl.searchParams.get('language') || 'en';
    const product = await fetchProductBySlug(slug, language);

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
