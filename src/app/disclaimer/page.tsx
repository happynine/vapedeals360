import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { cleanRichText } from '@/lib/utils';
import { StaticPageView } from '@/components/static-page-view';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Disclaimer',
  description:
    'VapeDeals360 provides product and price information for general informational purposes only. We are an independent comparison site, not a retailer; read the full disclaimer.',
  alternates: { canonical: 'https://www.vapedeals360.com/disclaimer' },
};

export default async function DisclaimerPage() {
  let content = '';
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data: rows } = await client
        .from('static_pages')
        .select('*, static_page_translations(*)')
        .eq('slug', 'disclaimer');
      const page = rows?.[0];
      const translation = (page?.static_page_translations || []).find(
        (tr: { language: string }) => tr.language === 'en'
      );
      if (translation?.content) content = cleanRichText(translation.content);
    }
  } catch {
    // Render shell; client layer keeps language switching available
  }

  return <StaticPageView slug="disclaimer" title="Disclaimer" initialContent={content} />;
}
