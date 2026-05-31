'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/hooks/use-language';
import { useSiteSettings } from '@/components/site-settings-provider';

export default function PrivacyPage() {
  const { language } = useLanguage();
  const { siteSettings } = useSiteSettings();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  // Remove empty paragraphs/headings that Quill inserts as spacing
  const cleanHtml = (html: string) => {
    return html
      .replace(/<p[^>]*>\s*(<br[^>]*>\s*)*(&nbsp;\s*)*<\/p>/gi, '')
      .replace(/<h[1-6][^>]*>\s*(<br[^>]*>\s*)*(&nbsp;\s*)*<\/h[1-6]>/gi, '')
      .replace(/<div[^>]*>\s*(<br[^>]*>\s*)*(&nbsp;\s*)*<\/div>/gi, '')
      .replace(/<p[^>]*>\s*<\/p>/gi, '')
      .replace(/<h[1-6][^>]*>\s*<\/h[1-6]>/gi, '')
      .replace(/<div[^>]*>\s*<\/div>/gi, '');
  };

  useEffect(() => {
    setLoading(true);
    fetch(`/api/static-pages?slug=privacy-policy&language=${language}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setContent(cleanHtml(d.data.content || ''));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [language]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="" />

      <main className="flex-1 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-purple-700 border-t-transparent rounded-full mx-auto mb-4" />
          </div>
        ) : content ? (
          <div
            className="rich-text-content"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <div className="text-gray-500">
            <p>Privacy Policy content will be available soon.</p>
          </div>
        )}
      </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0a0a0e] border-t border-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
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
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                {siteSettings?.logo_url ? <img src={siteSettings.logo_url.startsWith("http") ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`} alt={siteSettings.site_name} className="h-7 w-7 rounded-md object-contain" /> : <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-700 text-white font-bold text-sm">{siteSettings?.site_name ? siteSettings.site_name.charAt(0) : '\u00A0'}</div>}
                <span className="text-sm font-semibold text-gray-300">{siteSettings?.site_name || '\u00A0'}</span>
              </div>
              <a href="mailto:info@vapedeals360.com" className="text-sm text-gray-500 hover:text-purple-400 transition-colors block">Email: info@vapedeals360.com</a>
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
