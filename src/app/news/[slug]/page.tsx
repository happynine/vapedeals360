'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SafeImage } from '@/components/safe-image';

interface ContentPageDetail {
  id: number;
  type: string;
  slug: string;
  cover_image: string | null;
  title: string;
  content: string;
}

interface SiteSettings {
  site_name: string;
  logo_url: string;
}

export default function NewsDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [page, setPage] = useState<ContentPageDetail | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({ site_name: '', logo_url: '' });

  useEffect(() => {
    const lang = localStorage.getItem('language') || 'en';

    if (slug) {
      fetch(`/api/content-pages?slug=${slug}&language=${lang}`)
        .then(r => r.json())
        .then(d => { if (d.success) setPage(d.data); })
        .catch(() => {});
    }

    fetch('/api/site-settings')
      .then(r => r.json())
      .then(d => { if (d.success) setSiteSettings(d.data); })
      .catch(() => {});
  }, [slug]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {siteSettings.logo_url ? (
              <SafeImage src={siteSettings.logo_url} alt="Logo" width={40} height={40} className="rounded" />
            ) : (
              <span className="text-xl font-bold text-purple-700">V</span>
            )}
            <span className="text-lg font-semibold">{siteSettings.site_name || 'VapeDeal'}</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-gray-500 hover:text-gray-900 transition-colors text-sm">Vape Deals</Link>
            <Link href="/best-vapes" className="text-gray-500 hover:text-gray-900 transition-colors text-sm">Best Vapes</Link>
            <Link href="/news" className="text-white font-medium text-sm border-b-2 border-purple-500 pb-1">News</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/news" className="text-purple-400 hover:text-purple-300 text-sm mb-6 inline-block">
          &larr; Back to News
        </Link>

        {page ? (
          <>
            {page.cover_image && (
              <div className="aspect-video bg-gray-50 rounded-xl overflow-hidden mb-8">
                <SafeImage src={page.cover_image} alt={page.title} width={800} height={450} className="w-full h-full object-cover" />
              </div>
            )}
            <h1 className="text-3xl font-bold mb-6">{page.title || page.slug}</h1>
            <div
              className="prose  max-w-none prose-headings:text-gray-900 prose-a:text-purple-700 prose-img:rounded-lg"
              dangerouslySetInnerHTML={{ __html: page.content || '' }}
            />
          </>
        ) : (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-purple-700 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Loading...</p>
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
                {siteSettings.logo_url ? <img src={siteSettings.logo_url.startsWith("http") ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`} alt={siteSettings.site_name} className="h-7 w-7 rounded-md object-contain" /> : <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-700 text-white font-bold text-sm">{(siteSettings.site_name || 'V').charAt(0)}</div>}
                <span className="text-sm font-semibold text-gray-300">{siteSettings.site_name || 'VapeDeal'}</span>
              </div>
              <a href="mailto:info@vapedeals360.com" className="text-sm text-gray-500 hover:text-purple-400 transition-colors block mb-4">Email: info@vapedeals360.com</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
