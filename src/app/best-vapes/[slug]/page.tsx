'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SafeImage } from '@/components/safe-image';
import { SiteHeader } from '@/components/site-header';
import { ArticleSidebar } from '@/components/article-sidebar';
import { useLanguage } from '@/hooks/use-language';
import { useSiteSettings } from '@/components/site-settings-provider';

interface ContentPageDetail {
  id: number;
  type: string;
  slug: string;
  cover_image: string | null;
  title: string;
  content: string;
}

export default function BestVapesDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [page, setPage] = useState<ContentPageDetail | null>(null);
  const { siteSettings } = useSiteSettings();
  const { language } = useLanguage();

  useEffect(() => {
    if (slug) {
      fetch(`/api/content-pages?slug=${slug}&language=${language}`).then(r => r.json()).then(data => {
        if (data.success) setPage(data.data);
      }).catch(() => {});
    }
  }, [slug, language]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="best-vapes" />

      <main className="flex-1 bg-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/best-vapes" className="text-purple-400 hover:text-purple-300 text-sm mb-6 inline-block">
            &larr; Back to Best Vapes
          </Link>

          {page ? (
            <div className="flex gap-8">
              {/* Main content */}
              <article className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold mb-6">{page.title || page.slug}</h1>
                <div
                  className="rich-text-content"
                  dangerouslySetInnerHTML={{ __html: (page.content || '').replace(/<p[^>]*>(\s|<br\s*\/?>|&nbsp;|<span[^>]*>\s*(&nbsp;\s*)*\s*<\/span>)*<\/p>/gi, '').replace(/<h[1-6][^>]*>(\s|<br\s*\/?>|&nbsp;|<span[^>]*>\s*(&nbsp;\s*)*\s*<\/span>)*<\/h[1-6]>/gi, '').replace(/<div[^>]*>(\s|<br\s*\/?>|&nbsp;|<span[^>]*>\s*(&nbsp;\s*)*\s*<\/span>)*<\/div>/gi, '') }}
                />
              </article>
              {/* Sidebar - Related Articles */}
              <div className="hidden lg:block w-56 shrink-0">
                <ArticleSidebar type="best_vapes" currentSlug={slug} language={language} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32">
              {siteSettings?.logo_url ? (
                <img src={siteSettings.logo_url.startsWith("http") ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`} alt={siteSettings.site_name} className="h-16 w-16 rounded-xl object-contain mb-4 animate-pulse" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-purple-700 text-white font-bold text-2xl mb-4 animate-pulse">{siteSettings?.site_name ? siteSettings.site_name.charAt(0) : '\u00A0'}</div>
              )}
              <h2 className="text-xl font-semibold text-gray-700 mb-2">{siteSettings?.site_name || '\u00A0'}</h2>
              <div className="flex items-center gap-2 text-gray-400">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                <span>Loading...</span>
              </div>
            </div>
          )}
        </div>
      </main>


    </div>
  );
}
