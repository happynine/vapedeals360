'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/safe-image';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/hooks/use-language';
import { useSiteSettings } from '@/components/site-settings-provider';
import { useSocialLinks } from '@/hooks/use-social-links';

interface ContentPageItem {
  id: number;
  type: string;
  slug: string;
  cover_image: string | null;
  sort_order: number;
  title: string;
}

export default function NewsPage() {
  const { language } = useLanguage();
  const { siteSettings } = useSiteSettings();
  const [pages, setPages] = useState<ContentPageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const { socialLinks, getSocialIcon } = useSocialLinks();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/content-pages?type=news&language=${language}`).then(r => r.json()).then(data => {
      if (data.success) {
        setPages(data.data);
        setDescription(data.description || '');
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [language]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="news" />

      <main className="flex-1 bg-white">
        {loading ? (
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
        ) : (
          <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold mb-4">News</h1>
            {description && <p className="text-gray-500 mb-8 max-w-3xl">{description}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pages.map((page) => (
                <Link
                  key={page.id}
                  href={`/news/${page.slug}`}
                  className="group block bg-gray-50 rounded-xl overflow-hidden border border-gray-200 hover:border-purple-300 transition-all"
                >
                  <div className="aspect-video bg-white relative overflow-hidden">
                    {page.cover_image ? (
                      <SafeImage src={page.cover_image} alt={page.title} fill className="object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
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
                <p>No news yet. Stay tuned!</p>
              </div>
            )}
          </div>
        )}
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
                <Link href="/affiliate-disclosure" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Affiliate Disclosure</Link>
                <Link href="/terms-of-service" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Terms of Service</Link>
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
                              {socialLinks.filter(l => l.is_active).sort((a, b) => a.sort_order - b.sort_order).map(link => (
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
