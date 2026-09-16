import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ContentListView } from '@/components/content-list-view';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Vape News',
  description:
    'Latest vaping news, industry updates, regulation highlights, and product announcements curated by VapeDeals360.',
  alternates: { canonical: 'https://www.vapedeals360.com/news' },
};

interface ContentPageItem {
  id: number;
  type: string;
  slug: string;
  cover_image: string | null;
  sort_order: number;
  title: string;
}

async function fetchInitialData(): Promise<{ pages: ContentPageItem[]; description: string }> {
  const empty = { pages: [], description: '' };
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return empty;

    const [{ data: descData }, { data: pages, error }] = await Promise.all([
      supabase
        .from('category_descriptions')
        .select('description')
        .eq('category_key', 'news')
        .eq('language', 'en')
        .single(),
      supabase
        .from('content_pages')
        .select('*, content_page_translations(*)')
        .eq('type', 'news')
        .eq('is_published', true)
        .eq('content_page_translations.language', 'en')
        .order('sort_order', { ascending: true }),
    ]);

    if (error) return empty;

    const formattedPages: ContentPageItem[] = (pages || []).map((p: Record<string, unknown>) => {
      const translations = p.content_page_translations as Array<{ title?: string }> | { title?: string } | null;
      const translation = Array.isArray(translations) ? translations[0] : translations;
      return {
        id: p.id as number,
        type: p.type as string,
        slug: p.slug as string,
        cover_image: (p.cover_image as string | null) ?? null,
        sort_order: (p.sort_order as number) ?? 0,
        title: translation?.title || '',
      };
    });

    return {
      pages: formattedPages,
      description: (descData?.description as string) || '',
    };
  } catch {
    return empty;
  }
}

export default async function NewsPage() {
  const { pages, description } = await fetchInitialData();

  return (
    <ContentListView
      type="news"
      activeTab="news"
      heading="News"
      basePath="/news"
      gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      emptyText="No news yet. Stay tuned!"
      initialPages={pages}
      initialDescription={description}
    />
  );
}
