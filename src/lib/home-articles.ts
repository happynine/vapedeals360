import { getSupabaseClient } from '@/storage/database/supabase-client';
import { makeExcerpt } from '@/lib/excerpt';
import type { ContentCardItem } from '@/components/article-card';

/**
 * Server-side fetch of latest published articles for homepage rows.
 * Always returns an array (empty on any failure).
 */
export async function fetchHomeArticles(
  type: 'news' | 'best_vapes',
  limit = 5,
  language = 'en',
): Promise<ContentCardItem[]> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data: pages, error } = await supabase
      .from('content_pages')
      .select('*, content_page_translations(*, authors(*))')
      .eq('type', type)
      .eq('is_published', true)
      .eq('content_page_translations.language', language)
      .order('sort_order', { ascending: true })
      .limit(limit);

    if (error) return [];

    return (pages || []).map((p: Record<string, unknown>) => {
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
  } catch {
    return [];
  }
}
