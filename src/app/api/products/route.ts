import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { fetchCategories, fetchProducts, countProducts } from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "public");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');
    const language = searchParams.get('language') || 'en';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const featured = searchParams.get('featured') === 'true';
    const search = searchParams.get('search') || undefined;
    const salesRegion = searchParams.get('sales_region') || undefined;
    const sortBy = searchParams.get('sort_by') || 'id';
    const sortOrder = searchParams.get('sort_order') || 'desc';
    const offset = (page - 1) * limit;

    const [categories, products, total] = await Promise.all([
      fetchCategories(language),
      fetchProducts({
        category_id: categoryId ? parseInt(categoryId) : undefined,
        language,
        search,
        limit,
        offset,
        featured,
        sales_region: salesRegion,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
      countProducts(categoryId ? parseInt(categoryId) : undefined, salesRegion, search),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        categories,
        products,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
