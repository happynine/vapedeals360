import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteHeader } from '@/components/site-header';
import { PromotionContent } from './promotion-content';
import { PromotionSkeleton } from './promotion-skeleton';
import { getServiceRoleClient, isSupabaseConfigured } from '@/storage/database/supabase-client';
import { metaDescription } from '@/lib/seo';

// Disable ISR caching for promotion pages to avoid stale data
export const dynamic = 'force-dynamic';

async function getPromotionMeta(rawSlug: string) {
  if (!isSupabaseConfigured()) return null;
  let slug = rawSlug;
  try { slug = decodeURIComponent(rawSlug); } catch { slug = rawSlug; }
  try {
    const supabase = getServiceRoleClient();
    const { data } = await supabase
      .from('promotions')
      .select(`slug, is_active, promotion_translations(name, title, description, cover_image_url, language)`)
      .eq('slug', slug)
      .eq('is_active', true)
      .limit(1)
      .single();
    if (!data) return null;
    const tr =
      (data.promotion_translations || []).find((t: any) => t.language === 'en') ||
      (data.promotion_translations || [])[0];
    return { slug: data.slug, tr };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const meta = await getPromotionMeta(slug);
  if (!meta) return { title: 'Promotion Not Found', robots: { index: false, follow: false } };

  const name: string = meta.tr?.name || meta.tr?.title || 'Vape Deal';
  const title = meta.tr?.title || `${name} — Vape Deals & Discounts`;
  const fallback = `Shop the ${name} promotion on VapeDeals360. Compare live discounted prices across authorized vape retailers.`;
  const description = metaDescription(meta.tr?.description, fallback, 158);
  const url = `https://www.vapedeals360.com/promotion/${encodeURI(meta.slug)}`;
  const image = meta.tr?.cover_image_url || '';

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      images: image ? [{ url: image, alt: name }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : [],
    },
  };
}

// Server Component - fetches data on the server
export default async function PromotionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<PromotionSkeleton />}>
          <PromotionContent slug={slug} />
        </Suspense>
      </main>
    </div>
  );
}
