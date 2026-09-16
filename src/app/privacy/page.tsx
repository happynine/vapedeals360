import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { cleanRichText } from '@/lib/utils';
import { StaticPageView } from '@/components/static-page-view';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How VapeDeals360 collects, uses, and protects your personal information, including cookies, analytics, advertising partners, and your privacy choices.',
  alternates: { canonical: 'https://www.vapedeals360.com/privacy' },
};

export default async function PrivacyPolicyPage() {
  let content = '';
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data: rows } = await client
        .from('static_pages')
        .select('*, static_page_translations(*)')
        .eq('slug', 'privacy-policy');
      const page = rows?.[0];
      const translation = (page?.static_page_translations || []).find(
        (tr: { language: string }) => tr.language === 'en'
      );
      if (translation?.content) content = cleanRichText(translation.content);
    }
  } catch {
    // Render shell; client layer keeps language switching available
  }

  return <StaticPageView slug="privacy-policy" title="Privacy Policy" initialContent={content} />;
}
