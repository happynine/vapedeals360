'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/hooks/use-language';
import { useSiteSettings } from '@/components/site-settings-provider';
import { ArticleCard, ContentCardItem } from '@/components/article-card';

interface ContentListViewProps {
  type: 'news' | 'best_vapes';
  activeTab: string;
  heading: string;
  basePath: string;
  gridClassName: string;
  emptyText: string;
  initialPages: ContentCardItem[];
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
  const [pages, setPages] = useState<ContentCardItem[]>(initialPages);
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
                <ArticleCard key={page.id} page={page} basePath={basePath} type={type} />
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
