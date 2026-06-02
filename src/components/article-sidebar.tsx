'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface RelatedArticle {
  id: number;
  slug: string;
  cover_image: string | null;
  title: string;
}

interface ArticleSidebarProps {
  type: string; // 'best_vapes' | 'news'
  currentSlug: string;
  language: string;
}

export function ArticleSidebar({ type, currentSlug, language }: ArticleSidebarProps) {
  const [articles, setArticles] = useState<RelatedArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/content-pages?type=${type}&language=${language}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          // Exclude current article, limit to 10
          const related = data.data
            .filter((a: RelatedArticle) => a.slug !== currentSlug)
            .slice(0, 10);
          setArticles(related);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type, currentSlug, language]);

  if (loading) {
    return (
      <aside className="w-full">
        <div className="sticky top-24">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-1 pb-2 border-b-2 border-purple-600">
            {type === 'news' ? 'Latest News' : 'Latest Reviews'}
          </h3>
          <div className="mt-3 space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div className="w-full bg-gray-200 rounded-md" style={{ aspectRatio: '16/9' }} />
                <div className="mt-1.5 h-3 bg-gray-200 rounded w-4/5" />
              </div>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  if (articles.length === 0) return null;

  const basePath = type === 'news' ? '/news' : '/best-vapes';
  const sectionTitle = type === 'news' ? 'Latest News' : 'Latest Reviews';

  return (
    <aside className="w-full">
      <div className="sticky top-24">
        {/* Section title */}
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-1 pb-2 border-b-2 border-purple-600">
          {sectionTitle}
        </h3>

        {/* Article list - vertical stack: image on top, title below */}
        <div className="mt-3 space-y-3">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`${basePath}/${encodeURIComponent(article.slug)}`}
              className="group block rounded-lg overflow-hidden hover:bg-gray-50 transition-colors duration-150"
            >
              {/* Thumbnail - 16:9 ratio */}
              <div className="w-full rounded-md overflow-hidden bg-gray-100" style={{ aspectRatio: '16/9' }}>
                {article.cover_image ? (
                  <img
                    src={article.cover_image.startsWith('http') ? article.cover_image : `/api/image?key=${encodeURIComponent(article.cover_image)}`}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                  </div>
                )}
              </div>
              {/* Title - 16px bold, 2 lines max */}
              <p className="mt-1.5 text-base leading-snug text-purple-700 group-hover:text-purple-900 font-bold line-clamp-2">
                {article.title || article.slug}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
