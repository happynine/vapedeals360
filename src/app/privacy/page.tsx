'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/safe-image';

interface SiteSettings {
  site_name: string;
  logo_url: string;
}

export default function PrivacyPage() {
  const [content, setContent] = useState('');
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({ site_name: '', logo_url: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const lang = localStorage.getItem('language') || 'en';

    fetch(`/api/static-pages?slug=privacy-policy&language=${lang}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setContent(d.data.content || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch('/api/site-settings')
      .then(r => r.json())
      .then(d => { if (d.success) setSiteSettings(d.data); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {siteSettings.logo_url ? (
              <SafeImage src={siteSettings.logo_url} alt="Logo" width={40} height={40} className="rounded" />
            ) : (
              <span className="text-xl font-bold text-purple-500">V</span>
            )}
            <span className="text-lg font-semibold">{siteSettings.site_name || 'VapeDeal'}</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-gray-400 hover:text-white transition-colors text-sm">Vape Deals</Link>
            <Link href="/best-vapes" className="text-gray-400 hover:text-white transition-colors text-sm">Best Vapes</Link>
            <Link href="/news" className="text-gray-400 hover:text-white transition-colors text-sm">News</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-purple-700 border-t-transparent rounded-full mx-auto mb-4" />
          </div>
        ) : content ? (
          <div
            className="prose max-w-none prose-headings:text-gray-900 prose-a:text-purple-700 prose-img:rounded-lg"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <div className="text-gray-500">
            <p>Privacy Policy content will be available soon.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-[#0a0a0e] border-t border-gray-800 mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Navigation</h4>
              <div className="flex flex-col gap-2">
                <Link href="/" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Vape Deals</Link>
                <Link href="/best-vapes" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Best Vapes</Link>
                <Link href="/news" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">News</Link>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-4">About</h4>
              <div className="flex flex-col gap-2">
                <Link href="/about" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">About Us</Link>
                <Link href="/contact" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Contact Us</Link>
                <Link href="/privacy" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Privacy Policy</Link>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-700 text-white font-bold text-sm">V</div>
                <span className="text-sm font-semibold text-gray-300">VapeDeal</span>
              </div>
              <a href="mailto:info@vapedeals360.com" className="text-sm text-gray-500 hover:text-purple-400 transition-colors block">Email: info@vapedeals360.com</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
