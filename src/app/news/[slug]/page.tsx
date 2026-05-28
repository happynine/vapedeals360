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
    <div className="min-h-screen bg-[#0f0f13] text-[#e5e7eb]">
      {/* Header */}
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
              <div className="aspect-video bg-[#1a1a24] rounded-xl overflow-hidden mb-8">
                <SafeImage src={page.cover_image} alt={page.title} width={800} height={450} className="w-full h-full object-cover" />
              </div>
            )}
            <h1 className="text-3xl font-bold mb-6">{page.title || page.slug}</h1>
            <div
              className="prose prose-invert max-w-none prose-headings:text-white prose-a:text-purple-400 prose-img:rounded-lg"
              dangerouslySetInnerHTML={{ __html: page.content || '' }}
            />
          </>
        ) : (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Loading...</p>
          </div>
        )}
      </div>
    </div>
  );
}
