import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { cleanRichText } from '@/lib/utils';
import { StaticPageView } from '@/components/static-page-view';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Privacy Policy - VapeDeals360',
  description:
    'How VapeDeals360 collects, uses, and protects your personal information, including cookies, analytics, advertising partners, and your privacy choices.',
  alternates: { canonical: 'https://www.vapedeals360.com/privacy' },
};

export default async function PrivacyPolicyPage() {
  let content = '';
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data } = await client
        .from('static_pages')
        .select('content')
        .eq('slug', 'privacy-policy')
        .eq('language', 'en')
        .maybeSingle();
      if (data?.content) content = cleanRichText(data.content);
    }
  } catch {
    // Render shell; client layer keeps language switching available
  }

  return <StaticPageView slug="privacy-policy" title="Privacy Policy" initialContent={content} />;
}
