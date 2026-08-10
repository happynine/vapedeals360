import { MetadataRoute } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = getSupabaseClient();
  const baseUrl = 'https://www.vapedeals360.com';

  // 静态页面
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms-of-service`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/affiliate-disclosure`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/disclaimer`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/product`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/news`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/promotion`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/best-vapes`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  ];

  // 产品页面
  let productPages: MetadataRoute.Sitemap = [];
  try {
    const { data: products } = await supabase
      .from('products')
      .select('slug, updated_at');
    productPages = (products || []).map((p) => ({
      url: `${baseUrl}/product/${p.slug}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch (e) {
    console.error('Failed to fetch products for sitemap:', e);
  }

  // 新闻 + 推荐页面
  let contentPages: MetadataRoute.Sitemap = [];
  try {
    const { data: contentPagesData } = await supabase
      .from('content_pages')
      .select('type, slug, updated_at');
    contentPages = (contentPagesData || []).map((p) => {
      const prefix = p.type === 'news' ? 'news' : 'best-vapes';
      return {
        url: `${baseUrl}/${prefix}/${p.slug}`,
        lastModified: new Date(p.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      };
    });
  } catch (e) {
    console.error('Failed to fetch content_pages for sitemap:', e);
  }

  // Promotion 页面
  let promotionPages: MetadataRoute.Sitemap = [];
  try {
    const { data: promotions } = await supabase
      .from('promotions')
      .select('slug, updated_at');
    promotionPages = (promotions || []).map((p) => ({
      url: `${baseUrl}/promotion/${p.slug}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
  } catch (e) {
    console.error('Failed to fetch promotions for sitemap:', e);
  }

  return [...staticPages, ...productPages, ...contentPages, ...promotionPages];
}
