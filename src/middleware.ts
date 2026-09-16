import { NextRequest, NextResponse } from 'next/server';

// Permanent (308) apex -> www redirect so the canonical host is consistent.
// Next.js config redirects cannot inspect the Host header, so this runs at
// the edge. www requests and all internal hosts fall through untouched.
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const naked = host.split(':')[0];

  if (naked === 'vapedeals360.com') {
    const url = request.nextUrl.clone();
    url.host = 'www.vapedeals360.com';
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every request; the redirect itself is a cheap host comparison.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
