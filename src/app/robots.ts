import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Default: allow all crawlers including AI crawlers/search agents so
        // product pages can surface in AI answers. Rendering resources under
        // /_next/ must NOT be blocked — Google needs the JS/CSS to render the
        // interactive product grid, and _rsc URLs are part of App Router.
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin'],
      },
      {
        // ByteDance crawler (Douyin / Doubao): blocked — no CN-market focus.
        userAgent: 'Bytespider',
        disallow: '/',
      },
      {
        // Internal Cloudflare browser-rendering service, not a traffic-driving crawler.
        userAgent: 'CloudflareBrowserRenderingCrawler',
        disallow: '/',
      },
    ],
    sitemap: 'https://www.vapedeals360.com/sitemap.xml',
    host: 'https://www.vapedeals360.com',
  };
}
