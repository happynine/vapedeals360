import { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NewsDetailClient } from './NewsDetailClient';
import { PopularProducts } from '@/components/popular-products';
import { metaDescription } from '@/lib/seo';

interface ContentPageDetail {
  id: number;
  type: string;
  slug: string;
  cover_image: string | null;
  title: string;
  content: string;
  created_at: string | null;
  updated_at: string | null;
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

async function getNewsArticle(rawSlug: string, language: string = 'en'): Promise<ContentPageDetail | null> {
  // Route params may arrive percent-encoded (slugs in DB can contain spaces);
  // decode so the lookup matches the stored slug.
  let slug = rawSlug;
  try { slug = decodeURIComponent(rawSlug); } catch { slug = rawSlug; }
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
      created_at: page.created_at || null,
      updated_at: page.updated_at || page.created_at || null,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  let slug = rawSlug;
  try { slug = decodeURIComponent(rawSlug); } catch { slug = rawSlug; }
  const article = await getNewsArticle(slug);
  if (!article) return { title: 'Article Not Found' };

  const url = `https://www.vapedeals360.com/news/${encodeURI(slug)}`;
  const description = metaDescription(
    article.content,
    `Read ${article.title} and the latest vape industry news on VapeDeals360.`,
    158,
  );
  const title = article.title || slug;
  const images = article.cover_image ? [{ url: article.cover_image, alt: title }] : [];

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      images,
      url,
      type: 'article',
      publishedTime: article.created_at || undefined,
      modifiedTime: article.updated_at || undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: article.cover_image ? [article.cover_image] : [],
    },
  };
}

export default async function NewsDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  let slug = rawSlug;
  try { slug = decodeURIComponent(rawSlug); } catch { slug = rawSlug; }
  const [article, disclaimer] = await Promise.all([
    getNewsArticle(slug),
    getGlobalDisclaimer(),
  ]);

  const canonical = `https://www.vapedeals360.com/news/${encodeURI(slug)}`;
  const articleTitle = article?.title || slug;
  const articleJsonLd = article
    ? {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: articleTitle,
        description: metaDescription(article.content, undefined, 300),
        image: article.cover_image ? [article.cover_image] : undefined,
        datePublished: article.created_at || undefined,
        dateModified: article.updated_at || article.created_at || undefined,
        author: { '@type': 'Organization', name: 'VapeDeals360' },
        publisher: {
          '@type': 'Organization',
          name: 'VapeDeals360',
          logo: { '@type': 'ImageObject', url: 'https://www.vapedeals360.com/favicon.ico' },
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      }
    : null;
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.vapedeals360.com/' },
      { '@type': 'ListItem', position: 2, name: 'News', item: 'https://www.vapedeals360.com/news' },
      { '@type': 'ListItem', position: 3, name: articleTitle, item: canonical },
    ],
  };

  return (
    <>
      {articleJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <NewsDetailClient slug={slug} initialArticle={article} disclaimer={disclaimer} />
      <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 bg-white">
        <PopularProducts limit={10} />
      </div>
    </>
  );
}

