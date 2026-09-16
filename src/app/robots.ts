import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Default: allow all crawlers. This also permits AI crawlers/search
        // agents — GPTBot, OAI-SearchBot, CCBot, PerplexityBot, ClaudeBot,
        // Claude-SearchBot, Amazonbot, Google-Extended, Applebot-Extended and
        // meta-externalagent — so product pages can surface in AI answers.
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/_next/', '/static/', '/admin', '/*?_rsc=*'],
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
  };
}
