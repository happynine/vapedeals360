import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { cleanRichText } from '@/lib/utils';
import { StaticPageView } from '@/components/static-page-view';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'VapeDeals360 is an independent vape price comparison platform that tracks deals across trusted retailers in real time. Learn who we are and how we work.',
  alternates: { canonical: 'https://www.vapedeals360.com/about' },
};

export default async function AboutPage() {
  let content = '';
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data: rows } = await client
        .from('static_pages')
        .select('*, static_page_translations(*)')
        .eq('slug', 'about-us');
      const page = rows?.[0];
      const translation = (page?.static_page_translations || []).find(
        (tr: { language: string }) => tr.language === 'en'
      );
      if (translation?.content) content = cleanRichText(translation.content);
    }
  } catch {
    // Render shell; client layer keeps language switching available
  }

  return <StaticPageView slug="about-us" title="About Us" initialContent={content} />;
}
