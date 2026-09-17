import { NextRequest, NextResponse } from 'next/server';

// Permanent (308) apex -> www redirect so the canonical host is consistent.
// Next.js config redirects cannot inspect the Host header, so this runs at
// the edge. www requests and all internal hosts fall through untouched.

// 301 redirects for legacy news slugs that were normalized (spaces/punctuation
// removed). The old URLs currently soft-404 (200 + homepage canonical), so we
// 301 them to the clean slugs to consolidate signals and avoid duplicate URLs.
const NEWS_SLUG_REDIRECTS: Record<string, string> = {
  'e-cigarette-flavorings-affect 3,000+gene-activities-fruit-flavors-show-most-significant-changes':
    'e-cigarette-flavorings-affect-3000-gene-activities-fruit-flavors',
  'alaska-warns-over-1,500-tobacco-retailers-and-distributors':
    'alaska-warns-over-1500-tobacco-retailers-and-distributors',
  'electronics-sector-trade-friction-remains-at-elevated-levels:-vape-exports-face-new-challenges':
    'electronics-sector-trade-friction-vape-exports-face-new-challenges',
  "from-product-regulation-to-channel-control:-reform-uk's-new-vape-retail-proposal-draws-industry-attention":
    'uk-vape-retail-reform-product-regulation-to-channel-control',
};

function normalizeSlug(value: string): string {
  return value.toLowerCase().replace(/\u2019/g, "'");
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const naked = host.split(':')[0];

  if (naked === 'vapedeals360.com') {
    const url = request.nextUrl.clone();
    url.host = 'www.vapedeals360.com';
    return NextResponse.redirect(url, 308);
  }

  // 301 legacy news slug -> clean slug.
  // Match on the raw pathname and decode first so both percent-encoded
  // (%2C/%3A/%27) and literal-comma variants reach the redirect map.
  const newsMatch = request.nextUrl.pathname.match(/^\/news\/(.+?)\/?$/);
  if (newsMatch) {
    const decoded = (() => {
      try { return decodeURIComponent(newsMatch[1]); } catch { return newsMatch[1]; }
    })();
    const target = NEWS_SLUG_REDIRECTS[normalizeSlug(decoded)];
    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = `/news/${target}`;
      return NextResponse.redirect(url, 301);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on every request; the redirect itself is a cheap host/map comparison.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
