'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/safe-image';
import { getImageUrl } from '@/lib/image-url';

export interface ContentCardItem {
  id: number;
  type?: string;
  slug: string;
  cover_image: string | null;
  sort_order?: number;
  title: string;
  created_at?: string | null;
  excerpt?: string;
  author?: { id: number; name: string; avatar_url: string | null } | null;
}

export function formatCardDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface ArticleCardProps {
  page: ContentCardItem;
  basePath: string;
  type?: 'news' | 'best_vapes';
}

export function ArticleCard({ page, basePath, type = 'news' }: ArticleCardProps) {
  return (
    <Link
      href={`${basePath}/${encodeURI(page.slug)}`}
      className="group flex flex-col h-full bg-gray-50 rounded-xl overflow-hidden border border-gray-200 hover:border-purple-300 transition-all"
    >
      <div className="aspect-video bg-white relative overflow-hidden">
        {page.cover_image ? (
          <SafeImage src={page.cover_image} alt={page.title} fill className="object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            {type === 'news' ? (
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
            ) : (
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            )}
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h2 className="text-base font-semibold group-hover:text-purple-700 transition-colors line-clamp-2">
          {page.title || page.slug}
        </h2>
        {page.excerpt && (
          <p className="mt-2 text-sm text-gray-500 leading-relaxed line-clamp-3">
            {page.excerpt}
          </p>
        )}
        {(page.author || page.created_at) && (
          <div className="mt-auto pt-3 mt-4 border-t border-gray-100 flex items-center gap-2.5">
            {page.author && (
              <div className="h-7 w-7 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center shrink-0">
                {page.author.avatar_url ? (
                  <img
                    src={getImageUrl(page.author.avatar_url)}
                    alt={page.author.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-bold text-purple-700">
                    {page.author.name.charAt(0)}
                  </span>
                )}
              </div>
            )}
            <div className="min-w-0 text-xs text-gray-500">
              {page.author && (
                <span className="font-medium text-gray-800 truncate block">
                  {page.author.name}
                </span>
              )}
              {page.created_at && <span>{formatCardDate(page.created_at)}</span>}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
