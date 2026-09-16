import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { cleanRichText } from '@/lib/utils';
import { StaticPageView } from '@/components/static-page-view';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Disclaimer - VapeDeals360',
  description:
    'VapeDeals360 provides product and price information for general informational purposes only. We are an independent comparison site, not a retailer; read the full disclaimer.',
  alternates: { canonical: 'https://www.vapedeals360.com/disclaimer' },
};

export default async function DisclaimerPage() {
  let content = '';
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data } = await client
        .from('static_pages')
        .select('content')
        .eq('slug', 'disclaimer')
        .eq('language', 'en')
        .maybeSingle();
      if (data?.content) content = cleanRichText(data.content);
    }
  } catch {
    // Render shell; client layer keeps language switching available
  }

  return <StaticPageView slug="disclaimer" title="Disclaimer" initialContent={content} />;
}
