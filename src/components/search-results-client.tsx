'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/hooks/use-language';
import { useCurrency } from '@/hooks/use-currency';
import { SiteHeader } from '@/components/site-header';
import { ArticleCard } from '@/components/article-card';
import { ProductCard, type Product } from '@/components/product-card';
import type { FullSearchResults } from '@/lib/server-search';

const EMPTY_DATA: FullSearchResults = { products: [], news: [], best_vapes: [] };
const PAGE_SIZE = 10;

export function SearchResultsClient({
  initialQuery,
  initialData,
}: {
  initialQuery: string;
  initialData: FullSearchResults;
}) {
  const { language } = useLanguage();
  const { currencySymbol } = useCurrency();
  const searchParams = useSearchParams();
  const router = useRouter();

  const query = searchParams.get('q') || initialQuery;
  const urlPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const [data, setData] = useState<FullSearchResults>(initialData);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(urlPage);

  const fetchResults = useCallback(async () => {
    if (!query) {
      setData(EMPTY_DATA);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&language=${language}&currency=${encodeURIComponent(currencySymbol)}`,
      );
      const json = await res.json();
      if (json.success) {
        setData({
          products: json.data.products || [],
          news: json.data.news || [],
          best_vapes: json.data.best_vapes || [],
        });
      }
    } catch {
      // keep previous data on network error
    } finally {
      setLoading(false);
    }
  }, [query, language, currencySymbol]);

  useEffect(() => {
    setPage(1);
    fetchResults();
  }, [fetchResults]);

  const totalProducts = data.products.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = data.products.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const goToPage = (newPage: number) => {
    const target = Math.min(Math.max(1, newPage), totalPages);
    setPage(target);
    const params = new URLSearchParams({ q: query });
    if (target > 1) params.set('page', target.toString());
    router.replace(`/search?${params.toString()}`, { scroll: false });
  };

  const sectionTitle = "text-[30px] leading-tight font-bold text-gray-900";

  return (
    <div className="min-h-screen">
      <SiteHeader activeTab="" />
      <main className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm text-gray-500">
          <Link href="/" className="hover:text-purple-700 transition-colors">
            Home
          </Link>
          <span className="mx-2 text-gray-400">/</span>
          <span>
            {language === 'zh' ? '搜索结果：' : 'Search Results For:'} {query}
          </span>
        </nav>

        {/* Products heading */}
        <h2 className={`mb-4 ${sectionTitle}`}>
          {language === 'zh' ? '产品' : 'Product'}
        </h2>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 bg-white p-3 animate-pulse"
              >
                <div className="aspect-square w-full rounded-xl bg-gray-100" />
                <div className="mt-3 h-4 w-3/4 rounded bg-gray-100" />
                <div className="mt-2 h-6 w-1/2 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : totalProducts === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg
              className="h-16 w-16 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 0 00-.707.293l-2.414 2.414a1 0 01-.707.293h-3.172a1 0 01-.707-.293l-2.414-2.414A1 0 006.586 13H4"
              />
            </svg>
            <p className="mt-4 text-lg text-gray-400">
              {language === 'zh' ? '没有找到匹配的结果' : 'No matching results'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {pagedProducts.map((product, idx) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  language={language}
                  currencySymbol={currencySymbol}
                  index={idx}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalProducts > 0 && (
              <div className="mt-8 flex items-center justify-center gap-1 select-none">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="flex items-center justify-center w-8 h-8 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                {Array.from({ length: totalPages }).map((_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      onClick={() => goToPage(p)}
                      className={`flex items-center justify-center w-8 h-8 rounded text-sm font-medium transition-colors ${
                        currentPage === p
                          ? 'bg-purple-600 text-white border border-purple-600'
                          : 'border border-gray-200 bg-white text-gray-700 hover:bg-purple-50 hover:text-purple-600'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="flex items-center justify-center w-8 h-8 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <span className="ml-3 text-sm text-gray-400">{totalProducts} items</span>
              </div>
            )}
          </>
        )}

        {/* Best Vapes section */}
        {data.best_vapes.length > 0 && (
          <section className="mt-12">
            <h2 className={`mb-5 ${sectionTitle}`}>Best Vapes</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-5">
              {data.best_vapes.map((item) => (
                <ArticleCard key={item.id} page={item} basePath="/best-vapes" type="best_vapes" />
              ))}
            </div>
          </section>
        )}

        {/* News section */}
        {data.news.length > 0 && (
          <section className="mt-12">
            <h2 className={`mb-5 ${sectionTitle}`}>News</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-5">
              {data.news.map((item) => (
                <ArticleCard key={item.id} page={item} basePath="/news" type="news" />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
