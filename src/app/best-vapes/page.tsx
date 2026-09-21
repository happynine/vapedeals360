import type { Metadata } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ContentListView } from '@/components/content-list-view';
import { makeExcerpt } from '@/lib/excerpt';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Best Vapes',
  description:
    'Expert-curated best vapes guides, reviews, and buying recommendations compared by price across trusted retailers.',
  alternates: { canonical: 'https://www.vapedeals360.com/best-vapes' },
};

interface ContentPageItem {
  id: number;
  type: string;
  slug: string;
  cover_image: string | null;
  sort_order: number;
  title: string;
  created_at: string | null;
  excerpt: string;
  author: { id: number; name: string; avatar_url: string | null } | null;
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
        .eq('category_key', 'best_vapes')
        .eq('language', 'en')
        .single(),
      supabase
        .from('content_pages')
        .select('*, content_page_translations(*, authors(*))')
        .eq('type', 'best_vapes')
        .eq('is_published', true)
        .eq('content_page_translations.language', 'en')
        .order('sort_order', { ascending: true }),
    ]);

    if (error) return empty;

    const formattedPages: ContentPageItem[] = (pages || []).map((p: Record<string, unknown>) => {
      const rawTranslations = p.content_page_translations as
        | Array<Record<string, unknown>>
        | Record<string, unknown>
        | null;
      const translation = Array.isArray(rawTranslations) ? rawTranslations[0] : rawTranslations;
      const author = (translation?.authors as
        | { id?: number; name?: string; avatar_url?: string | null }
        | null
        | undefined) ?? null;
      return {
        id: p.id as number,
        type: p.type as string,
        slug: p.slug as string,
        cover_image: (p.cover_image as string | null) ?? null,
        sort_order: (p.sort_order as number) ?? 0,
        title: (translation?.title as string) || '',
        created_at: (p.created_at as string | null) ?? null,
        excerpt: makeExcerpt(translation?.content as string | null | undefined),
        author: author ? {
          id: author.id as number,
          name: author.name as string,
          avatar_url: (author.avatar_url as string | null) ?? null,
        } : null,
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

export default async function BestVapesPage() {
  const { pages, description } = await fetchInitialData();

  return (
    <ContentListView
      type="best_vapes"
      activeTab="best-vapes"
      heading="Best Vapes"
      basePath="/best-vapes"
      gridClassName="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-5"
      emptyText="No content yet. Stay tuned!"
      initialPages={pages}
      initialDescription={description}
    />
  );
}
