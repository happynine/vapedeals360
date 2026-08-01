import { MetadataRoute } from 'next';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.vapedeals360.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();

  // --- Static pages ---
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms-of-service`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/affiliate-disclosure`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/disclaimer`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/product`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/promotion`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/news`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE_URL}/best-vapes`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
  ];

  // If Supabase not configured (e.g. during build), return static pages only
  if (!isSupabaseConfigured()) {
    return staticPages;
  }

  try {
    const client = getSupabaseClient();
    const dynamicPages: MetadataRoute.Sitemap = [];

    // --- Products (slug from products table) ---
    try {
      const { data: products } = await client
        .from('products')
        .select('slug, updated_at')
        .eq('is_active', true);

      if (products) {
        for (const p of products) {
          dynamicPages.push({
            url: `${BASE_URL}/product/${encodeURIComponent(p.slug)}`,
            lastModified: p.updated_at || now,
            changeFrequency: 'weekly',
            priority: 0.8,
          });
        }
      }
    } catch (e) {
      console.error('Sitemap: failed to fetch products', e);
    }

    // --- Promotions (slug from promotions table) ---
    try {
      const { data: promos } = await client
        .from('promotions')
        .select('slug, updated_at')
        .eq('is_active', true);

      if (promos) {
        for (const p of promos) {
          dynamicPages.push({
            url: `${BASE_URL}/promotion/${encodeURIComponent(p.slug)}`,
            lastModified: p.updated_at || now,
            changeFrequency: 'daily',
            priority: 0.8,
          });
        }
      }
    } catch (e) {
      console.error('Sitemap: failed to fetch promotions', e);
    }

    // --- News (slug from content_pages table, type=news) ---
    try {
      const { data: newsPages } = await client
        .from('content_pages')
        .select('slug, updated_at')
        .eq('type', 'news');

      if (newsPages) {
        for (const p of newsPages) {
          dynamicPages.push({
            url: `${BASE_URL}/news/${encodeURIComponent(p.slug)}`,
            lastModified: p.updated_at || now,
            changeFrequency: 'weekly',
            priority: 0.6,
          });
        }
      }
    } catch (e) {
      console.error('Sitemap: failed to fetch news', e);
    }

    // --- Best Vapes (slug from content_pages table, type=best_vapes) ---
    try {
      const { data: bestVapes } = await client
        .from('content_pages')
        .select('slug, updated_at')
        .eq('type', 'best_vapes');

      if (bestVapes) {
        for (const p of bestVapes) {
          dynamicPages.push({
            url: `${BASE_URL}/best-vapes/${encodeURIComponent(p.slug)}`,
            lastModified: p.updated_at || now,
            changeFrequency: 'weekly',
            priority: 0.6,
          });
        }
      }
    } catch (e) {
      console.error('Sitemap: failed to fetch best-vapes', e);
    }

    return [...staticPages, ...dynamicPages];
  } catch (e) {
    console.error('Sitemap generation failed, returning static pages only', e);
    return staticPages;
  }
}
