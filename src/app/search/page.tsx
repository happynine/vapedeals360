import type { Metadata } from 'next';
import { SearchResultsClient } from '@/components/search-results-client';
import { runSearch } from '@/lib/server-search';
import { getServerCurrency } from '@/lib/server-currency';

export const revalidate = 0;

async function getInitialData(query: string) {
  // Language lives in localStorage so SSR always renders English; the client
  // re-fetches in the visitor's chosen language on mount.
  const { symbol } = await getServerCurrency();
  return runSearch(query, 'en', symbol, 200);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q = '' } = await searchParams;
  const term = q.trim();
  return {
    title: term ? `Search Results For: ${term}` : 'Search Results',
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = '' } = await searchParams;
  const query = q.trim();
  const initialData = query ? await getInitialData(query) : { products: [], news: [], best_vapes: [] };

  return <SearchResultsClient initialQuery={query} initialData={initialData} />;
}
