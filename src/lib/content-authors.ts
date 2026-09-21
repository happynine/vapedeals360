import type { SupabaseClient } from '@supabase/supabase-js';

type TranslationRow = Record<string, unknown> & { author_id?: number | null };
type PageRow = Record<string, unknown>;
type AuthorRow = Record<string, unknown>;

function asTranslations(value: unknown): TranslationRow[] {
  if (Array.isArray(value)) return value as TranslationRow[];
  if (value && typeof value === 'object') return [value as TranslationRow];
  return [];
}

/**
 * Attach the linked `authors` record onto each translation row in place.
 *
 * PostgREST on this project fails to resolve the new
 * content_page_translations -> authors foreign key from its schema cache,
 * so we perform the join manually: collect every author_id, fetch those
 * authors in one query, and set `translation.authors` exactly like the
 * embedded resource would have appeared.
 *
 * Safe to call on any shape: list or single page, array or object embed.
 */
export async function attachAuthors(
  supabase: SupabaseClient,
  pages: PageRow[] | PageRow | null | undefined,
): Promise<void> {
  if (!pages) return;
  const pageList = Array.isArray(pages) ? pages : [pages];
  if (pageList.length === 0) return;

  const translations: TranslationRow[] = [];
  for (const page of pageList) {
    translations.push(...asTranslations(page.content_page_translations));
  }

  const authorIds = Array.from(
    new Set(
      translations
        .map((t) => t.author_id)
        .filter((id): id is number => typeof id === 'number'),
    ),
  );

  let byId = new Map<number, AuthorRow>();
  if (authorIds.length > 0) {
    const { data: authors, error } = await supabase
      .from('authors')
      .select('*')
      .in('id', authorIds);
    if (!error && Array.isArray(authors)) {
      byId = new Map(
        (authors as AuthorRow[]).map((a) => [a.id as number, a]),
      );
    }
  }

  for (const translation of translations) {
    const id = translation.author_id;
    translation.authors = typeof id === 'number' ? (byId.get(id) ?? null) : null;
  }
}
