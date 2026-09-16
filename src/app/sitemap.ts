import { MetadataRoute } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const baseUrl = 'https://www.vapedeals360.com';

// Fixed, honest last-modified dates for pages whose content changes rarely.
const STATIC_LASTMOD: Record<string, string> = {
  '/': '2026-09-16',
  '/about': '2026-08-08',
  '/contact': '2026-08-08',
  '/privacy': '2026-08-08',
  '/terms-of-service': '2026-08-08',
  '/affiliate-disclosure': '2026-08-08',
  '/disclaimer': '2026-08-08',
  '/news': '2026-09-16',
  '/best-vapes': '2026-09-16',
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = getSupabaseClient();

  // Static pages with stable lastmod instead of a single build timestamp.
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(STATIC_LASTMOD['/']), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/about`, lastModified: new Date(STATIC_LASTMOD['/about']), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/contact`, lastModified: new Date(STATIC_LASTMOD['/contact']), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(STATIC_LASTMOD['/privacy']), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms-of-service`, lastModified: new Date(STATIC_LASTMOD['/terms-of-service']), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/affiliate-disclosure`, lastModified: new Date(STATIC_LASTMOD['/affiliate-disclosure']), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/disclaimer`, lastModified: new Date(STATIC_LASTMOD['/disclaimer']), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/news`, lastModified: new Date(STATIC_LASTMOD['/news']), changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/best-vapes`, lastModified: new Date(STATIC_LASTMOD['/best-vapes']), changeFrequency: 'weekly', priority: 0.7 },
  ];

  // Product pages with primary image
  let productPages: MetadataRoute.Sitemap = [];
  try {
    const { data: products } = await supabase
      .from('products')
      .select('slug, updated_at, created_at, home_image_url, image_url');
    productPages = (products || []).map((p) => {
      const img = p.home_image_url || p.image_url;
      return {
        url: `${baseUrl}/product/${encodeURI(p.slug)}`,
        lastModified: new Date(p.updated_at || p.created_at || Date.now()),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
        images: img ? [img] : undefined,
      };
    });
  } catch (e) {
    console.error('Failed to fetch products for sitemap:', e);
  }

  // News + best-vapes articles with cover image
  let contentPages: MetadataRoute.Sitemap = [];
  try {
    const { data: contentPagesData } = await supabase
      .from('content_pages')
      .select('type, slug, updated_at, created_at, cover_image');
    contentPages = (contentPagesData || []).map((p) => {
      const prefix = p.type === 'news' ? 'news' : 'best-vapes';
      return {
        url: `${baseUrl}/${prefix}/${encodeURI(p.slug)}`,
        lastModified: new Date(p.updated_at || p.created_at || Date.now()),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
        images: p.cover_image ? [p.cover_image] : undefined,
      };
    });
  } catch (e) {
    console.error('Failed to fetch content_pages for sitemap:', e);
  }

  // Promotion pages with cover image
  let promotionPages: MetadataRoute.Sitemap = [];
  try {
    const { data: promotions } = await supabase
      .from('promotions')
      .select('slug, updated_at, created_at, promotion_translations(cover_image_url, language)');
    promotionPages = (promotions || []).map((p) => {
      const trs = p.promotion_translations || [];
      const cover = trs.find((t: any) => t.language === 'en')?.cover_image_url || trs[0]?.cover_image_url;
      return {
        url: `${baseUrl}/promotion/${encodeURI(p.slug)}`,
        lastModified: new Date(p.updated_at || p.created_at || Date.now()),
        changeFrequency: 'daily' as const,
        priority: 0.8,
        images: cover ? [cover] : undefined,
      };
    });
  } catch (e) {
    console.error('Failed to fetch promotions for sitemap:', e);
  }

  return [...staticPages, ...productPages, ...contentPages, ...promotionPages];
}
