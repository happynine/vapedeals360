'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/hooks/use-language';
import { useSiteSettings } from '@/components/site-settings-provider';

interface SiteHeaderProps {
  activeTab?: 'vape-deals' | 'best-vapes' | 'news' | '';
}

export function SiteHeader({ activeTab = 'vape-deals' }: SiteHeaderProps) {
  const { siteSettings } = useSiteSettings();
  const { language, setLanguage } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileLangOpen, setMobileLangOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  const displayName = siteSettings?.site_name || '';
  const displayLogo = siteSettings?.logo_url;

  const handleLanguageChange = (lang: 'en' | 'zh') => {
    setLanguage(lang);
    setLangOpen(false);
    setMobileLangOpen(false);
    setMobileMenuOpen(false);
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
  }, [pathname]);

  // Focus search input when mobile search opens
  useEffect(() => {
    if (mobileSearchOpen && mobileSearchInputRef.current) {
      mobileSearchInputRef.current.focus();
    }
  }, [mobileSearchOpen]);

  const navItems = [
    { href: '/', label: 'Vape Deals', tab: 'vape-deals' },
    { href: '/best-vapes', label: 'Best Vapes', tab: 'best-vapes' },
    { href: '/news', label: 'News', tab: 'news' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0e] border-b border-gray-800">
      {/* Desktop Header */}
      <div className="hidden md:block">
        {/* Top row: Logo + Search + Language */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              {displayLogo ? (
                <img
                  src={displayLogo.startsWith("http") ? displayLogo : `/api/image?key=${encodeURIComponent(displayLogo)}`}
                  alt={displayName}
                  className="h-9 w-9 rounded-lg object-contain"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-700 text-white font-bold text-lg">
                  {displayName.charAt(0) || '\u00A0'}
                </div>
              )}
              <span className="text-xl font-bold tracking-tight text-white">{displayName || '\u00A0'}</span>
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
                  {language === "en" ? "EN" : "中"}
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
              {navItems.map(item => (
                <Link
                  key={item.tab}
                  href={item.href}
                  className={`text-sm font-semibold transition-colors ${activeTab === item.tab ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Hamburger Menu */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-300 hover:bg-[#1a1a24] transition-colors"
            aria-label="Menu"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Center Logo */}
          <Link href="/" className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
            {displayLogo ? (
              <img
                src={displayLogo.startsWith("http") ? displayLogo : `/api/image?key=${encodeURIComponent(displayLogo)}`}
                alt={displayName}
                className="h-7 w-7 rounded-lg object-contain"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-700 text-white font-bold text-sm">
                {displayName.charAt(0) || '\u00A0'}
              </div>
            )}
            <span className="text-lg font-bold tracking-tight text-white">{displayName || '\u00A0'}</span>
          </Link>

          {/* Right: Language + Search */}
          <div className="flex items-center gap-1">
            {/* Language Toggle */}
            <button
              onClick={() => setMobileLangOpen(!mobileLangOpen)}
              className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-300 hover:bg-[#1a1a24] transition-colors"
              aria-label="Language"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </button>
            {/* Search Icon */}
            <button
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-300 hover:bg-[#1a1a24] transition-colors"
              aria-label="Search"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Language Dropdown */}
        {mobileLangOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMobileLangOpen(false)} />
            <div className="absolute right-4 top-14 z-50 w-36 rounded-lg border border-gray-700 bg-[#1a1a24] shadow-lg overflow-hidden">
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

        {/* Mobile Search Bar */}
        {mobileSearchOpen && (
          <div className="border-t border-gray-800 px-4 py-3">
            <form action="/" method="get" className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={mobileSearchInputRef}
                type="text"
                name="q"
                placeholder={language === "zh" ? "搜索产品..." : "Search products..."}
                className="w-full rounded-xl border border-gray-700 bg-[#1a1a24] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
              />
            </form>
          </div>
        )}
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed top-0 left-0 z-50 w-72 h-full bg-[#0a0a0e] border-r border-gray-800 md:hidden overflow-y-auto">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-800">
              <div className="flex items-center gap-2">
                {displayLogo ? (
                  <img
                    src={displayLogo.startsWith("http") ? displayLogo : `/api/image?key=${encodeURIComponent(displayLogo)}`}
                    alt={displayName}
                    className="h-7 w-7 rounded-lg object-contain"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-700 text-white font-bold text-sm">
                    {displayName.charAt(0) || '\u00A0'}
                  </div>
                )}
                <span className="text-lg font-bold tracking-tight text-white">{displayName || '\u00A0'}</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-300 hover:bg-[#1a1a24] transition-colors"
                aria-label="Close"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Nav Items */}
            <nav className="py-2">
              {navItems.map(item => (
                <Link
                  key={item.tab}
                  href={item.href}
                  className={`flex items-center gap-3 px-5 py-3.5 text-base font-semibold transition-colors ${
                    activeTab === item.tab
                      ? 'text-white bg-[#1a1a24] border-l-4 border-purple-500'
                      : 'text-gray-400 hover:text-white hover:bg-[#1a1a24]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
