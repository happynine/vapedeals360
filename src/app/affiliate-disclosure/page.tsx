import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { cleanRichText } from '@/lib/utils';
import { StaticPageView } from '@/components/static-page-view';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Affiliate Disclosure',
  description:
    'FTC affiliate disclosure: VapeDeals360 may earn a commission when you buy through links on our site, at no extra cost to you. Learn how this works.',
  alternates: { canonical: 'https://www.vapedeals360.com/affiliate-disclosure' },
};

export default async function AffiliateDisclosurePage() {
  let content = '';
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data: rows } = await client
        .from('static_pages')
        .select('*, static_page_translations(*)')
        .eq('slug', 'affiliate-disclosure');
      const page = rows?.[0];
      const translation = (page?.static_page_translations || []).find(
        (tr: { language: string }) => tr.language === 'en'
      );
      if (translation?.content) content = cleanRichText(translation.content);
    }
  } catch {
    // Render shell; client layer keeps language switching available
  }

  return <StaticPageView slug="affiliate-disclosure" title="Affiliate Disclosure" initialContent={content} />;
}
