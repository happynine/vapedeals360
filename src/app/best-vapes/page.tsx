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

export default function BestVapesPage() {
  const [pages, setPages] = useState<ContentPageItem[]>([]);
  const [description, setDescription] = useState('');
  const { siteSettings } = useSiteSettings();
  const [loading, setLoading] = useState(true);
  const { language } = useLanguage();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/content-pages?type=best_vapes&language=${language}`).then(r => r.json()).then(data => {
      if (data.success) {
        setPages(data.data);
        setDescription(data.description || '');
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [language]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="best-vapes" />

      <main className="flex-1 bg-white">
        {loading ? (
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center justify-center min-h-[40vh]">
            {siteSettings?.logo_url ? (
              <img src={siteSettings.logo_url} alt="Logo" className="h-12 mb-4 animate-pulse" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-purple-100 animate-pulse mb-4" />
            )}
            <p className="text-gray-400 text-sm animate-pulse">{siteSettings?.site_name || 'Loading...'}</p>
            <div className="mt-8 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {[1,2,3].map(i => (
                <div key={i} className="h-48 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold mb-4">Best Vapes</h1>
            {description && <p className="text-gray-500 mb-8 max-w-3xl">{description}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {pages.map((page) => (
                <Link
                  key={page.id}
                  href={`/best-vapes/${page.slug}`}
                  className="group block bg-gray-50 rounded-xl overflow-hidden border border-gray-200 hover:border-purple-300 transition-all"
                >
                  <div className="aspect-video bg-white relative overflow-hidden">
                    {page.cover_image ? (
                      <SafeImage src={page.cover_image} alt={page.title} fill className="object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
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
                <p>No content yet. Stay tuned!</p>
              </div>
            )}
          </div>
        )}
      </main>

    </div>
  );
}
