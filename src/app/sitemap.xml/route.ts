import { NextResponse } from 'next/server';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.vapedeals360.com';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
}

async function buildSitemapXml(): Promise<string> {
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  // --- Static pages ---
  const staticPages = [
    { url: `${BASE_URL}/`, changefreq: 'daily', priority: '1.0' },
    { url: `${BASE_URL}/about`, changefreq: 'monthly', priority: '0.5' },
    { url: `${BASE_URL}/contact`, changefreq: 'monthly', priority: '0.5' },
    { url: `${BASE_URL}/privacy`, changefreq: 'yearly', priority: '0.3' },
    { url: `${BASE_URL}/terms-of-service`, changefreq: 'yearly', priority: '0.3' },
    { url: `${BASE_URL}/affiliate-disclosure`, changefreq: 'yearly', priority: '0.3' },
    { url: `${BASE_URL}/disclaimer`, changefreq: 'yearly', priority: '0.3' },
    { url: `${BASE_URL}/product`, changefreq: 'daily', priority: '0.8' },
    { url: `${BASE_URL}/promotion`, changefreq: 'daily', priority: '0.8' },
    { url: `${BASE_URL}/news`, changefreq: 'daily', priority: '0.7' },
    { url: `${BASE_URL}/best-vapes`, changefreq: 'weekly', priority: '0.7' },
  ];

  for (const page of staticPages) {
    xml += `  <url>\n`;
    xml += `    <loc>${escapeXml(page.url)}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  // If Supabase not configured, return static pages only
  if (!isSupabaseConfigured()) {
    xml += `</urlset>\n`;
    return xml;
  }

  try {
    const client = getSupabaseClient();

    // --- Products ---
    try {
      const { data: products } = await client
        .from('products')
        .select('slug, updated_at')
        .eq('is_active', true);
      if (products) {
        for (const p of products) {
          const slug = encodeURIComponent(p.slug);
          xml += `  <url>\n`;
          xml += `    <loc>${escapeXml(`${BASE_URL}/product/${slug}`)}</loc>\n`;
          xml += `    <lastmod>${formatDate(p.updated_at)}</lastmod>\n`;
          xml += `    <changefreq>weekly</changefreq>\n`;
          xml += `    <priority>0.8</priority>\n`;
          xml += `  </url>\n`;
        }
      }
    } catch (e) {
      console.error('Sitemap: failed to fetch products', e);
    }

    // --- Promotions ---
    try {
      const { data: promos } = await client
        .from('promotions')
        .select('slug, updated_at')
        .eq('is_active', true);
      if (promos) {
        for (const p of promos) {
          const slug = encodeURIComponent(p.slug);
          xml += `  <url>\n`;
          xml += `    <loc>${escapeXml(`${BASE_URL}/promotion/${slug}`)}</loc>\n`;
          xml += `    <lastmod>${formatDate(p.updated_at)}</lastmod>\n`;
          xml += `    <changefreq>daily</changefreq>\n`;
          xml += `    <priority>0.8</priority>\n`;
          xml += `  </url>\n`;
        }
      }
    } catch (e) {
      console.error('Sitemap: failed to fetch promotions', e);
    }

    // --- News ---
    try {
      const { data: newsPages } = await client
        .from('content_pages')
        .select('slug, updated_at')
        .eq('type', 'news');
      if (newsPages) {
        for (const p of newsPages) {
          const slug = encodeURIComponent(p.slug);
          xml += `  <url>\n`;
          xml += `    <loc>${escapeXml(`${BASE_URL}/news/${slug}`)}</loc>\n`;
          xml += `    <lastmod>${formatDate(p.updated_at)}</lastmod>\n`;
          xml += `    <changefreq>weekly</changefreq>\n`;
          xml += `    <priority>0.6</priority>\n`;
          xml += `  </url>\n`;
        }
      }
    } catch (e) {
      console.error('Sitemap: failed to fetch news', e);
    }

    // --- Best Vapes ---
    try {
      const { data: bestVapes } = await client
        .from('content_pages')
        .select('slug, updated_at')
        .eq('type', 'best_vapes');
      if (bestVapes) {
        for (const p of bestVapes) {
          const slug = encodeURIComponent(p.slug);
          xml += `  <url>\n`;
          xml += `    <loc>${escapeXml(`${BASE_URL}/best-vapes/${slug}`)}</loc>\n`;
          xml += `    <lastmod>${formatDate(p.updated_at)}</lastmod>\n`;
          xml += `    <changefreq>weekly</changefreq>\n`;
          xml += `    <priority>0.6</priority>\n`;
          xml += `  </url>\n`;
        }
      }
    } catch (e) {
      console.error('Sitemap: failed to fetch best-vapes', e);
    }
  } catch (e) {
    console.error('Sitemap generation failed, returning static pages only', e);
  }

  xml += `</urlset>\n`;
  return xml;
}

export async function GET() {
  const xml = await buildSitemapXml();
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
