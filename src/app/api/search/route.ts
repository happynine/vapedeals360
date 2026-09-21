import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { runSearch } from '@/lib/server-search';
import { getDisplayPrice } from '@/lib/product-utils';

// GET /api/search?q=...&language=en&currency=$
// Unified global search: up to 10 products, 10 news and 10 best-vapes.
// Matching is by word spelling order (prefix), applied after a 2s client debounce.
// Pass view=dropdown to flatten products into {slug,name,image_url,price} for
// the header dropdown; the default response keeps full product objects.
export const runtime = 'nodejs';

function priceValue(raw: unknown): number {
  const n = parseFloat(String(raw));
  return Number.isNaN(n) ? Infinity : n;
}

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, 'public');
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const language = searchParams.get('language') || 'en';
  const currency = searchParams.get('currency') || '$';
  const flatten = searchParams.get('view') === 'dropdown';

  if (!q) {
    return NextResponse.json({
      success: true,
      data: { products: [], news: [], best_vapes: [] },
    });
  }

  try {
    const data = await runSearch(q, language, currency, flatten ? 10 : 200);

    if (flatten) {
      const products = data.products.map((product) => {
        const t =
          product.translations.find((x) => x.language === language) ||
          product.translations.find((x) => x.language === 'en') ||
          product.translations[0];
        // Lowest finite price in the requested currency.
        const priced = product.prices.filter(
          (p) =>
            !p.no_quote &&
            (!p.store || p.store.is_active) &&
            (p.currency || '$') === currency &&
            priceValue(getDisplayPrice(p)) !== Infinity,
        );
        let lowest: (typeof priced)[number] | null = null;
        if (priced.length > 0) {
          lowest = priced.reduce(
            (min, p) =>
              priceValue(getDisplayPrice(p)) < priceValue(getDisplayPrice(min)) ? p : min,
            priced[0],
          );
        }
        return {
          slug: product.slug,
          name: t?.name || '',
          image_url: product.image_url ?? null,
          price: lowest ? String(getDisplayPrice(lowest)) : null,
        };
      });
      return NextResponse.json({
        success: true,
        data: { ...data, products },
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
