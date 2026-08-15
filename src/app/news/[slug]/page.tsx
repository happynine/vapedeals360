import { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NewsDetailClient } from './NewsDetailClient';

interface ContentPageDetail {
  id: number;
  type: string;
  slug: string;
  cover_image: string | null;
  title: string;
  content: string;
}

interface GlobalDisclaimer {
  disclaimer: string;
  disclaimer_hidden: boolean;
  ai_disclosure: string;
  ai_disclosure_hidden: boolean;
}

async function getGlobalDisclaimer(language: string = 'en'): Promise<GlobalDisclaimer | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('site_settings')
      .select('*, site_setting_translations(*)')
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const translations = data.site_setting_translations || [];
    const translation = translations.find((t: { language: string }) => t.language === language)
      || translations.find((t: { language: string }) => t.language === 'en')
      || translations[0];

    if (!translation) return null;

    return {
      disclaimer: translation.disclaimer || '',
      disclaimer_hidden: translation.disclaimer_hidden ?? false,
      ai_disclosure: translation.ai_disclosure || '',
      ai_disclosure_hidden: translation.ai_disclosure_hidden ?? false,
    };
  } catch {
    return null;
  }
}

async function getNewsArticle(slug: string, language: string = 'en'): Promise<ContentPageDetail | null> {
  try {
    const supabase = getSupabaseClient();
    const { data: pages, error } = await supabase
      .from('content_pages')
      .select('*, content_page_translations(*)')
      .eq('slug', slug)
      .eq('is_published', true)
      .eq('content_page_translations.language', language)
      .limit(1);

    if (error || !pages || pages.length === 0) return null;

    const page = pages[0];
    const translation = page.content_page_translations?.[0];
    return {
      id: page.id,
      type: page.type,
      slug: page.slug,
      cover_image: page.cover_image,
      title: translation?.title || '',
      content: translation?.content || '',
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getNewsArticle(slug);
  if (!article) return { title: 'Article Not Found' };

  const url = `https://www.vapedeals360.com/news/${slug}`;
  const description = article.content
    ? article.content.replace(/<[^>]*>/g, '').substring(0, 160)
    : `Read ${article.title} on VapeDeals360`;

  return {
    title: article.title || slug,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: article.title || slug,
      description,
      images: article.cover_image ? [{ url: article.cover_image }] : [],
      url,
      type: 'article',
    },
  };
}

export default async function NewsDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [article, disclaimer] = await Promise.all([
    getNewsArticle(slug),
    getGlobalDisclaimer(),
  ]);

  return <NewsDetailClient slug={slug} initialArticle={article} disclaimer={disclaimer} />;
}

