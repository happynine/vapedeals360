'use client';

import Link from 'next/link';
import { getImageUrl } from '@/lib/image-url';
import { getMatchRanges } from '@/lib/word-match';

function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = getMatchRanges(query, text);
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([start, end], i) => {
    if (start > pos) parts.push(text.slice(pos, start));
    parts.push(
      <span key={`hl-${i}`} className="text-purple-600 font-semibold">
        {text.slice(start, end)}
      </span>,
    );
    pos = end;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

export interface ProductHit {
  slug: string;
  name: string;
  image_url: string | null;
  price: string | null;
}
export interface ArticleHit {
  slug: string;
  title: string;
  cover_image?: string | null;
}
export interface SearchData {
  products: ProductHit[];
  news: ArticleHit[];
  best_vapes: ArticleHit[];
}

interface SearchDropdownContentProps {
  loading: boolean;
  data: SearchData;
  query: string;
  zh: boolean;
  onNavigate: () => void;
}

export function SearchDropdownContent({
  loading,
  data,
  query,
  zh,
  onNavigate,
}: SearchDropdownContentProps) {
  const { products, news, best_vapes } = data;
  const total = products.length + news.length + best_vapes.length;

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="px-5 pt-4 pb-1 text-[18px] leading-tight font-bold text-gray-900">
      {children}
    </div>
  );

  return (
    <div className="text-left">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="ml-2 text-sm text-gray-500">
            {zh ? '匹配中…' : 'Matching…'}
          </span>
        </div>
      ) : total === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-gray-500">
          {zh ? '未找到相关结果' : 'No matching results'}
        </div>
      ) : (
        <>
          {products.length > 0 && (
            <div>
              <SectionTitle>{zh ? '产品' : 'Product'}</SectionTitle>
              <div className="px-2">
                {products.map((product) => (
                  <Link
                    key={`p-${product.slug}`}
                    href={`/product/${product.slug}`}
                    onClick={onNavigate}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="h-[58px] w-[58px] flex-shrink-0 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center">
                      {product.image_url ? (
                        <img
                          src={getImageUrl(product.image_url)}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-400">No img</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] leading-snug font-medium text-gray-900 line-clamp-2">
                        <Highlight text={product.name} query={query} />
                      </div>
                      {product.price && (
                        <div className="mt-0.5 flex items-baseline gap-1.5">
                          <span className="text-[13px] text-gray-400">
                            {zh ? '起' : 'From'}
                          </span>
                          <span className="text-[17px] font-bold text-emerald-600 tabular-nums">
                            {(() => {
                              const priceStr = String(product.price);
                              return priceStr.startsWith('$') ||
                                priceStr.startsWith('CA$') ||
                                priceStr.startsWith('£') ||
                                priceStr.startsWith('€')
                                ? priceStr
                                : `$${priceStr}`;
                            })()}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {best_vapes.length > 0 && (
            <div>
              <SectionTitle>Best Vapes</SectionTitle>
              <div className="px-2">
                {best_vapes.map((article) => (
                  <Link
                    key={`bv-${article.slug}`}
                    href={`/best-vapes/${article.slug}`}
                    onClick={onNavigate}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="h-[58px] w-[58px] flex-shrink-0 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center">
                      {article.cover_image ? (
                        <img
                          src={getImageUrl(article.cover_image)}
                          alt={article.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-400">No img</span>
                      )}
                    </div>
                    <span className="flex-1 min-w-0 text-[15px] leading-snug font-medium text-gray-900 line-clamp-2">
                      <Highlight text={article.title} query={query} />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {news.length > 0 && (
            <div>
              <SectionTitle>News</SectionTitle>
              <div className="px-2">
                {news.map((article) => (
                  <Link
                    key={`n-${article.slug}`}
                    href={`/news/${article.slug}`}
                    onClick={onNavigate}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="h-[58px] w-[58px] flex-shrink-0 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center">
                      {article.cover_image ? (
                        <img
                          src={getImageUrl(article.cover_image)}
                          alt={article.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-400">No img</span>
                      )}
                    </div>
                    <span className="flex-1 min-w-0 text-[15px] leading-snug font-medium text-gray-900 line-clamp-2">
                      <Highlight text={article.title} query={query} />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* View More -> dedicated search results page */}
          <div className="mt-1 border-t border-gray-200">
            <Link
              href={`/search?q=${encodeURIComponent(query.trim())}`}
              onClick={onNavigate}
              className="block px-5 py-3.5 text-center text-[17px] font-medium text-purple-600 hover:text-purple-800 transition-colors"
            >
              {zh ? '查看更多' : 'View More'}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
