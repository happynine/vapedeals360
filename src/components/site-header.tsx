'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/safe-image';

interface SiteSettings {
  site_name: string;
  logo_url: string;
}

interface SiteHeaderProps {
  activeTab?: 'vape-deals' | 'best-vapes' | 'news' | '';
}

export function SiteHeader({ activeTab = 'vape-deals' }: SiteHeaderProps) {
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({ site_name: 'VapeDeal', logo_url: '' });
  const [language, setLanguage] = useState('en');
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    const lang = localStorage.getItem('language') || 'en';
    setLanguage(lang);

    fetch('/api/site-settings')
      .then(r => r.json())
      .then(d => { if (d.success) setSiteSettings(d.data); })
      .catch(() => {});
  }, []);

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
    setLangOpen(false);
    window.dispatchEvent(new Event('language-change'));
  };

  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0e] border-b border-gray-800">
      {/* Top row: Logo + Search + Language */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {siteSettings.logo_url ? (
              <img
                src={siteSettings.logo_url.startsWith("http") ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`}
                alt={siteSettings.site_name}
                className="h-9 w-9 rounded-lg object-contain"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-700 text-white font-bold text-lg">
                {siteSettings.site_name.charAt(0)}
              </div>
            )}
            <span className="text-xl font-bold tracking-tight text-white">{siteSettings.site_name}</span>
          </Link>
          <div className="flex items-center gap-3">
            {/* Search */}
            <form action="/" method="get" className="relative w-48 sm:w-64">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                name="q"
                placeholder={language === "zh" ? "搜索产品..." : "Search products..."}
                className="w-full rounded-xl border border-gray-700 bg-[#1a1a24] pl-10 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
              />
            </form>
            {/* Language Dropdown */}
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#1a1a24] px-3 py-2 text-sm font-medium text-gray-300 hover:bg-[#2a2a3a] transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                {language === "en" ? "English" : "中文"}
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {langOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                  <div className="absolute right-0 mt-2 z-50 w-36 rounded-lg border border-gray-700 bg-[#1a1a24] shadow-lg overflow-hidden">
                    <button
                      onClick={() => handleLanguageChange("en")}
                      className={`w-full px-4 py-2.5 text-sm text-left hover:bg-[#2a2a3a] transition-colors flex items-center gap-2 ${language === "en" ? "text-purple-400 font-semibold" : "text-gray-300"}`}
                    >
                      🇺🇸 English
                      {language === "en" && (
                        <svg className="h-4 w-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => handleLanguageChange("zh")}
                      className={`w-full px-4 py-2.5 text-sm text-left hover:bg-[#2a2a3a] transition-colors flex items-center gap-2 ${language === "zh" ? "text-purple-400 font-semibold" : "text-gray-300"}`}
                    >
                      🇨🇳 中文
                      {language === "zh" && (
                        <svg className="h-4 w-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Tab Navigation: Vape Deals / Best Vapes / News */}
      <div className="border-t border-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6 h-12">
            <Link
              href="/"
              className={`text-sm font-semibold transition-colors ${activeTab === 'vape-deals' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Vape Deals
            </Link>
            <Link
              href="/best-vapes"
              className={`text-sm font-semibold transition-colors ${activeTab === 'best-vapes' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Best Vapes
            </Link>
            <Link
              href="/news"
              className={`text-sm font-semibold transition-colors ${activeTab === 'news' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
            >
              News
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
