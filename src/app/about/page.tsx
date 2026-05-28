'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/safe-image';

interface SiteSettings {
  site_name: string;
  logo_url: string;
}

interface StaticPageData {
  id: number;
  slug: string;
  content: string;
}

export default function AboutPage() {
  const [content, setContent] = useState('');
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({ site_name: '', logo_url: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const lang = localStorage.getItem('language') || 'en';

    fetch(`/api/static-pages?slug=about-us&language=${lang}`)
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
    <div className="min-h-screen bg-[#0f0f13] text-[#e5e7eb]">
      <header className="border-b border-white/10">
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
        <h1 className="text-3xl font-bold mb-6">About Us</h1>
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
          </div>
        ) : content ? (
          <div
            className="prose prose-invert max-w-none prose-headings:text-white prose-a:text-purple-400 prose-img:rounded-lg"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <div className="text-gray-400">
            <p>Welcome to VapeDeal - your trusted source for vape price comparison and deals.</p>
            <p className="mt-4">We help you find the best prices across multiple vape stores, saving you time and money on e-cigarettes, pod systems, mods, and e-liquids.</p>
          </div>
        )}
      </div>
    </div>
  );
}
