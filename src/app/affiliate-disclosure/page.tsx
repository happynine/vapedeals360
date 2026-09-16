import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { cleanRichText } from '@/lib/utils';
import { StaticPageView } from '@/components/static-page-view';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Affiliate Disclosure - VapeDeals360',
  description:
    'FTC affiliate disclosure: VapeDeals360 may earn a commission when you buy through links on our site, at no extra cost to you. Learn how this works.',
  alternates: { canonical: 'https://www.vapedeals360.com/affiliate-disclosure' },
};

export default async function AffiliateDisclosurePage() {
  let content = '';
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data } = await client
        .from('static_pages')
        .select('content')
        .eq('slug', 'affiliate-disclosure')
        .eq('language', 'en')
        .maybeSingle();
      if (data?.content) content = cleanRichText(data.content);
    }
  } catch {
    // Render shell; client layer keeps language switching available
  }

  return <StaticPageView slug="affiliate-disclosure" title="Affiliate Disclosure" initialContent={content} />;
}
