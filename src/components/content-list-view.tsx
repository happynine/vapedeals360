'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/safe-image';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/hooks/use-language';
import { useSiteSettings } from '@/components/site-settings-provider';

interface ContentPageItem {
  id: number;
  type: string;
  slug: string;
  cover_image: string | null;
  sort_order: number;
  title: string;
}

interface ContentListViewProps {
  type: 'news' | 'best_vapes';
  activeTab: string;
  heading: string;
  basePath: string;
  gridClassName: string;
  emptyText: string;
  initialPages: ContentPageItem[];
  initialDescription: string;
}

export function ContentListView({
  type,
  activeTab,
  heading,
  basePath,
  gridClassName,
  emptyText,
  initialPages,
  initialDescription,
}: ContentListViewProps) {
  const { language } = useLanguage();
  const { siteSettings } = useSiteSettings();
  const [pages, setPages] = useState<ContentPageItem[]>(initialPages);
  const [description, setDescription] = useState(initialDescription);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/content-pages?type=${type}&language=${language}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setPages(data.data);
          setDescription(data.description || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [language, type]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab={activeTab} />

      <main className="flex-1 bg-white">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            {siteSettings?.logo_url ? (
              <img src={siteSettings.logo_url.startsWith("http") ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`} alt={siteSettings.site_name} className="h-9 w-9 rounded-xl object-contain mb-4 animate-pulse" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-700 text-white font-bold text-lg mb-4 animate-pulse">{siteSettings?.site_name ? siteSettings.site_name.charAt(0) : '\u00A0'}</div>
            )}
            <h2 className="text-xl font-semibold text-gray-700 mb-2">{siteSettings?.site_name || '\u00A0'}</h2>
            <div className="flex items-center gap-2 text-gray-400">
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              <span>Loading...</span>
            </div>
          </div>
        ) : (
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold mb-4">{heading}</h1>
            {description && <p className="text-gray-500 mb-8 max-w-3xl">{description}</p>}

            <div className={gridClassName}>
              {pages.map((page) => (
                <Link
                  key={page.id}
                  href={`${basePath}/${page.slug}`}
                  className="group block bg-gray-50 rounded-xl overflow-hidden border border-gray-200 hover:border-purple-300 transition-all"
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
                  <div className="p-5">
                    <h2 className="text-lg font-semibold group-hover:text-purple-700 transition-colors">{page.title || page.slug}</h2>
                  </div>
                </Link>
              ))}
            </div>

            {pages.length === 0 && (
              <div className="text-center text-gray-400 py-20">
                <p>{emptyText}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
