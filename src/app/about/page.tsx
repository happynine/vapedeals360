import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { cleanRichText } from '@/lib/utils';
import { StaticPageView } from '@/components/static-page-view';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'About Us - VapeDeals360',
  description:
    'VapeDeals360 is an independent vape price comparison platform that tracks deals across trusted retailers in real time. Learn who we are and how we work.',
  alternates: { canonical: 'https://www.vapedeals360.com/about' },
};

export default async function AboutPage() {
  let content = '';
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data } = await client
        .from('static_pages')
        .select('content')
        .eq('slug', 'about-us')
        .eq('language', 'en')
        .maybeSingle();
      if (data?.content) content = cleanRichText(data.content);
    }
  } catch {
    // Render shell; client layer keeps language switching available
  }

  return <StaticPageView slug="about-us" title="About Us" initialContent={content} />;
}
