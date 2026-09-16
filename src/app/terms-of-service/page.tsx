import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { cleanRichText } from '@/lib/utils';
import { StaticPageView } from '@/components/static-page-view';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms and conditions for using VapeDeals360, including acceptable use, intellectual property, third-party links, limitation of liability, and governing law.',
  alternates: { canonical: 'https://www.vapedeals360.com/terms-of-service' },
};

export default async function TermsOfServicePage() {
  let content = '';
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data: rows } = await client
        .from('static_pages')
        .select('*, static_page_translations(*)')
        .eq('slug', 'terms-of-service');
      const page = rows?.[0];
      const translation = (page?.static_page_translations || []).find(
        (tr: { language: string }) => tr.language === 'en'
      );
      if (translation?.content) content = cleanRichText(translation.content);
    }
  } catch {
    // Render shell; client layer keeps language switching available
  }

  return <StaticPageView slug="terms-of-service" title="Terms of Service" initialContent={content} />;
}
