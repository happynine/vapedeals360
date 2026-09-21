'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { ArticleCard, ContentCardItem } from '@/components/article-card';

interface HomeArticleRowProps {
  type: 'news' | 'best_vapes';
  basePath: string;
  initialPages: ContentCardItem[];
}

export function HomeArticleRow({ type, basePath, initialPages }: HomeArticleRowProps) {
  const { language } = useLanguage();
  const zh = language === 'zh';
  const heading = type === 'best_vapes'
    ? (zh ? '最佳电子烟' : 'Best Vapes')
    : (zh ? '行业新闻' : 'News');
  const viewAllText = zh ? '查看全部' : 'View all';
  const [pages, setPages] = useState<ContentCardItem[]>(initialPages);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/content-pages?type=${type}&language=${language}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.success) setPages((data.data || []).slice(0, 5));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [language, type]);

  if (pages.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between mb-5">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">{heading}</h2>
        <Link
          href={basePath}
          className="group flex items-center gap-1 text-sm font-medium text-purple-700 hover:underline shrink-0"
        >
          {viewAllText}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-5">
        {pages.map((page) => (
          <ArticleCard key={page.id} page={page} basePath={basePath} type={type} />
        ))}
      </div>
    </section>
  );
}
