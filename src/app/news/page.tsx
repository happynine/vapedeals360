'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/safe-image';

interface ContentPageItem {
  id: number;
  type: string;
  slug: string;
  cover_image: string | null;
  sort_order: number;
  title: string;
}

interface SiteSettings {
  site_name: string;
  logo_url: string;
}

interface SocialLink {
  id: number;
  platform: string;
  url: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

function getSocialIcon(platform: string) {
  const p = platform.toLowerCase();
  if (p.includes('facebook')) return <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>;
  if (p.includes('twitter') || p.includes('x.com')) return <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
  if (p.includes('instagram')) return <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>;
  if (p.includes('youtube')) return <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>;
  if (p.includes('tiktok')) return <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>;
  return <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>;
}

export default function NewsPage() {
  const [pages, setPages] = useState<ContentPageItem[]>([]);
  const [description, setDescription] = useState('');
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({ site_name: '', logo_url: '' });
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);

  useEffect(() => {
    const lang = localStorage.getItem('language') || 'en';

    fetch(`/api/content-pages?type=news&language=${lang}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setPages(d.data);
          setDescription(d.description || '');
        }
      })
      .catch(() => {});

    fetch('/api/site-settings')
      .then(r => r.json())
      .then(d => { if (d.success) setSiteSettings(d.data); })
      .catch(() => {});

    fetch('/api/social-links')
      .then(r => r.json())
      .then(d => { if (d.success) setSocialLinks(d.data); })
      .catch(() => {});
  }, []);

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
            <span className="text-white font-medium text-sm border-b-2 border-purple-500 pb-1">News</span>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-4">News</h1>
        {description && <p className="text-gray-400 mb-8 max-w-3xl">{description}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pages.map((page) => (
            <Link
              key={page.id}
              href={`/news/${page.slug}`}
              className="group block bg-[#1a1a24] rounded-xl overflow-hidden border border-white/5 hover:border-purple-500/50 transition-all"
            >
              <div className="aspect-video bg-[#0f0f13] relative overflow-hidden">
                {page.cover_image ? (
                  <SafeImage src={page.cover_image} alt={page.title} fill className="object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                  </div>
                )}
              </div>
              <div className="p-5">
                <h2 className="text-lg font-semibold group-hover:text-purple-400 transition-colors">{page.title || page.slug}</h2>
              </div>
            </Link>
          ))}
        </div>

        {pages.length === 0 && (
          <div className="text-center text-gray-500 py-20">
            <p>No news yet. Stay tuned!</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {siteSettings.logo_url ? (
                <SafeImage src={siteSettings.logo_url} alt="Logo" width={24} height={24} className="rounded" />
              ) : (
                <span className="text-sm font-bold text-purple-500">V</span>
              )}
              <span className="text-sm font-semibold">{siteSettings.site_name || 'VapeDeal'}</span>
              <Link href="/contact" className="text-xs text-gray-400 hover:text-purple-400 ml-2 transition-colors">Contact Us</Link>
            </div>
            <div className="flex items-center gap-3">
              {socialLinks.filter(l => l.is_active).sort((a, b) => a.sort_order - b.sort_order).map(link => (
                <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-purple-400 transition-colors">
                  {getSocialIcon(link.platform)}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
