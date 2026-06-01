'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SafeImage } from '@/components/safe-image';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/hooks/use-language';
import { useSiteSettings } from '@/components/site-settings-provider';
import { useSocialLinks } from '@/hooks/use-social-links';

interface ContentPageDetail {
  id: number;
  type: string;
  slug: string;
  cover_image: string | null;
  title: string;
  content: string;
}

export default function NewsDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const { language } = useLanguage();
  const { siteSettings } = useSiteSettings();
  const [page, setPage] = useState<ContentPageDetail | null>(null);
  const { socialLinks, getSocialIcon } = useSocialLinks();

  useEffect(() => {
    if (slug) {
      fetch(`/api/content-pages?slug=${slug}&language=${language}`).then(r => r.json()).then(data => {
        if (data.success) setPage(data.data);
      }).catch(() => {});
    }
  }, [slug, language]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="news" />

      <main className="flex-1 bg-white">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/news" className="text-purple-400 hover:text-purple-300 text-sm mb-6 inline-block">
            &larr; Back to News
          </Link>

          {page ? (
            <>
              <h1 className="text-3xl font-bold mb-6">{page.title || page.slug}</h1>
              <div
                className="rich-text-content"
                dangerouslySetInnerHTML={{ __html: (page.content || '').replace(/<p[^>]*>(\s|<br\s*\/?>|&nbsp;|<span[^>]*>\s*(&nbsp;\s*)*\s*<\/span>)*<\/p>/gi, '').replace(/<h[1-6][^>]*>(\s|<br\s*\/?>|&nbsp;|<span[^>]*>\s*(&nbsp;\s*)*\s*<\/span>)*<\/h[1-6]>/gi, '').replace(/<div[^>]*>(\s|<br\s*\/?>|&nbsp;|<span[^>]*>\s*(&nbsp;\s*)*\s*<\/span>)*<\/div>/gi, '') }}
              />
            </>
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

      {/* Footer */}
      <footer className="bg-[#0a0a0e] border-t border-gray-800">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="hidden sm:block">
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Navigation</h4>
              <div className="flex flex-col gap-2">
                <Link href="/" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Vape Deals</Link>
                <Link href="/best-vapes" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Best Vapes</Link>
                <Link href="/news" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">News</Link>
              </div>
            </div>
            <div className="hidden sm:block">
              <h4 className="text-sm font-semibold text-gray-300 mb-4">About</h4>
              <div className="flex flex-col gap-2">
                <Link href="/about" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">About Us</Link>
                <Link href="/contact" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Contact Us</Link>
                <Link href="/privacy" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Privacy Policy</Link>
                <Link href="/disclaimer" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Disclaimer</Link>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                {siteSettings?.logo_url ? <img src={siteSettings.logo_url.startsWith("http") ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`} alt={siteSettings.site_name} className="h-7 w-7 rounded-md object-contain" /> : <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-700 text-white font-bold text-sm">{siteSettings?.site_name ? siteSettings.site_name.charAt(0) : '\u00A0'}</div>}
                <span className="text-sm font-semibold text-gray-300">{siteSettings?.site_name || '\u00A0'}</span>
              </div>
              <a href="mailto:info@vapedeals360.com" className="text-sm text-gray-500 hover:text-purple-400 transition-colors block mb-4">Email: info@vapedeals360.com</a>
              {socialLinks.length > 0 && (
                <div className="flex items-center gap-3">
                  {socialLinks.filter((l) => l.is_active).sort((a, b) => a.sort_order - b.sort_order).map((link) => (
                    <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300 transition-colors" title={link.platform}>
                      {getSocialIcon(link.platform)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 py-6 text-center text-xs text-gray-500">
          ©Vapedeals360.com All Rights Reserved.
        </div>
      </footer>
    </div>
  );
}
