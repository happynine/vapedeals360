import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { cleanRichText } from '@/lib/utils';
import { StaticPageView } from '@/components/static-page-view';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Terms of Service - VapeDeals360',
  description:
    'The terms and conditions for using VapeDeals360, including acceptable use, intellectual property, third-party links, limitation of liability, and governing law.',
  alternates: { canonical: 'https://www.vapedeals360.com/terms-of-service' },
};

export default async function TermsOfServicePage() {
  let content = '';
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data } = await client
        .from('static_pages')
        .select('content')
        .eq('slug', 'terms-of-service')
        .eq('language', 'en')
        .maybeSingle();
      if (data?.content) content = cleanRichText(data.content);
    }
  } catch {
    // Render shell; client layer keeps language switching available
  }

  return <StaticPageView slug="terms-of-service" title="Terms of Service" initialContent={content} />;
}
