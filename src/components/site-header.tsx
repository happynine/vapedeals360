'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/hooks/use-language';
import { useSiteSettings } from '@/components/site-settings-provider';

interface SearchResult {
  slug: string;
  name: string;
  image_url: string | null;
  price: string | null;
  original_price: string | null;
}

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [desktopSearchQuery, setDesktopSearchQuery] = useState('');
  const [desktopSearchResults, setDesktopSearchResults] = useState<SearchResult[]>([]);
  const [desktopSearchLoading, setDesktopSearchLoading] = useState(false);
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false);
  const desktopSearchRef = useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktopDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setSearchQuery('');
    setSearchResults([]);
  }, [pathname]);

  // Cleanup debounce timers
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      if (desktopDebounceRef.current) {
        clearTimeout(desktopDebounceRef.current);
      }
    };
  }, []);

  // Focus search input when mobile search opens
  useEffect(() => {
    if (mobileSearchOpen && mobileSearchInputRef.current) {
      mobileSearchInputRef.current.focus();
    }
  }, [mobileSearchOpen]);

  // Mobile search with debounce
  const handleMobileSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    if (!query.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?language=${language}&limit=10`);
        const json = await res.json();
        if (json.success) {
          const q = query.toLowerCase();
          const filtered = (json.data.products || []).filter((p: Record<string, unknown>) => {
            const translations = p.product_translations as Record<string, unknown>[] | undefined;
            const t = translations?.find((tr: Record<string, unknown>) => tr.language === language) || translations?.[0];
            return (t?.name as string)?.toLowerCase().includes(q);
          }).slice(0, 8).map((p: Record<string, unknown>) => {
            const translations = p.product_translations as Record<string, unknown>[];
            const t = translations?.find((tr: Record<string, unknown>) => tr.language === language) || translations?.[0];
            const prices = (p.product_prices as Record<string, unknown>[]) || [];
            const lowestPrice = prices.length > 0
              ? prices.reduce((min: Record<string, unknown>, pr: Record<string, unknown>) => {
                  const curr = parseFloat(pr.current_price as string);
                  return curr < parseFloat(min.current_price as string) ? pr : min;
                }, prices[0])
              : null;
            return {
              slug: p.slug as string,
              name: (t?.name as string) || '',
              image_url: p.image_url as string | null,
              price: lowestPrice ? (lowestPrice.current_price as string) : null,
              original_price: lowestPrice?.original_price ? (lowestPrice.original_price as string) : null,
            };
          });
          setSearchResults(filtered);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, [language]);

  const handleSearchResultClick = () => {
    setSearchQuery('');
    setSearchResults([]);
    setMobileSearchOpen(false);
    setDesktopSearchQuery('');
    setDesktopSearchResults([]);
    setDesktopSearchFocused(false);
  };

  // Desktop search with debounce
  const handleDesktopSearch = useCallback((query: string) => {
    setDesktopSearchQuery(query);
    if (desktopDebounceRef.current) {
      clearTimeout(desktopDebounceRef.current);
    }
    if (!query.trim()) {
      setDesktopSearchResults([]);
      setDesktopSearchLoading(false);
      return;
    }
    setDesktopSearchLoading(true);
    desktopDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?language=${language}&limit=10`);
        const json = await res.json();
        if (json.success) {
          const q = query.toLowerCase();
          const filtered = (json.data.products || []).filter((p: Record<string, unknown>) => {
            const translations = p.product_translations as Record<string, unknown>[] | undefined;
            const t = translations?.find((tr: Record<string, unknown>) => tr.language === language) || translations?.[0];
            return (t?.name as string)?.toLowerCase().includes(q);
          }).slice(0, 8).map((p: Record<string, unknown>) => {
            const translations = p.product_translations as Record<string, unknown>[];
            const t = translations?.find((tr: Record<string, unknown>) => tr.language === language) || translations?.[0];
            const prices = (p.product_prices as Record<string, unknown>[]) || [];
            const lowestPrice = prices.length > 0
              ? prices.reduce((min: Record<string, unknown>, pr: Record<string, unknown>) => {
                  const curr = parseFloat(pr.current_price as string);
                  return curr < parseFloat(min.current_price as string) ? pr : min;
                }, prices[0])
              : null;
            return {
              slug: p.slug as string,
              name: (t?.name as string) || '',
              image_url: p.image_url as string | null,
              price: lowestPrice ? (lowestPrice.current_price as string) : null,
              original_price: lowestPrice?.original_price ? (lowestPrice.original_price as string) : null,
            };
          });
          setDesktopSearchResults(filtered);
        }
      } catch {
        setDesktopSearchResults([]);
      } finally {
        setDesktopSearchLoading(false);
      }
    }, 300);
  }, [language]);

  // Close desktop search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (desktopSearchRef.current && !desktopSearchRef.current.contains(e.target as Node)) {
        setDesktopSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { href: '/', label: 'Vape Deals', tab: 'vape-deals' },
    { href: '/best-vapes', label: 'Best Vapes', tab: 'best-vapes' },
    { href: '/news', label: 'News', tab: 'news' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0e] border-b border-gray-800 relative">
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
              <div className="relative w-48 sm:w-64">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={desktopSearchQuery}
                    onChange={(e) => handleDesktopSearch(e.target.value)}
                    onFocus={() => { if (desktopSearchQuery.trim()) handleDesktopSearch(desktopSearchQuery); }}
                    placeholder={language === "zh" ? "搜索产品..." : "Search products..."}
                    className="w-full rounded-xl border border-gray-700 bg-[#1a1a24] pl-10 pr-8 py-2 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                  />
                  {desktopSearchQuery && (
                    <button
                      onClick={() => { handleDesktopSearch(''); setDesktopSearchResults([]); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {/* Desktop Search Results Dropdown */}
                {desktopSearchFocused && desktopSearchQuery.trim() && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a24] border border-gray-700 rounded-xl shadow-2xl z-50 max-h-96 overflow-y-auto">
                    {desktopSearchLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <svg className="animate-spin h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="ml-2 text-sm text-gray-400">{language === "zh" ? "搜索中..." : "Searching..."}</span>
                      </div>
                    ) : desktopSearchResults.length > 0 ? (
                      desktopSearchResults.map((product) => (
                        <Link
                          key={product.slug}
                          href={`/product/${product.slug}`}
                          onClick={() => { setDesktopSearchFocused(false); setDesktopSearchQuery(''); }}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-[#2a2a3a] transition-colors border-b border-gray-800 last:border-b-0"
                        >
                          <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-gray-800 overflow-hidden">
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} className="h-full w-full object-contain" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">No img</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">{product.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {product.price && <span className="text-sm font-semibold text-emerald-500">${product.price}</span>}
                              {product.original_price && product.original_price !== product.price && (
                                <span className="text-xs text-gray-500 line-through">${product.original_price}</span>
                              )}
                            </div>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center text-sm text-gray-400">
                        {language === "zh" ? "未找到相关产品" : "No products found"}
                      </div>
                    )}
                  </div>
                )}
              </div>
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

        {/* Mobile Search Bar - Overlay on content */}
        {mobileSearchOpen && (
          <div className="absolute left-0 right-0 top-full z-50 border-t border-gray-800 bg-[#0a0a0e] px-4 py-3">
            <div className="relative">
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
                value={searchQuery}
                onChange={(e) => handleMobileSearch(e.target.value)}
                placeholder={language === "zh" ? "搜索产品..." : "Search products..."}
                className="w-full rounded-xl border border-gray-700 bg-[#1a1a24] pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {/* Search Results Dropdown */}
            {searchQuery.trim() && (
              <div className="mt-2 rounded-xl border border-gray-700 bg-[#1a1a24] overflow-hidden max-h-[60vh] overflow-y-auto">
                {searchLoading ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    <svg className="animate-spin h-5 w-5 mx-auto mb-2 text-purple-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {language === "zh" ? "搜索中..." : "Searching..."}
                  </div>
                ) : searchResults.length > 0 ? (
                  <ul>
                    {searchResults.map((result) => (
                      <li key={result.slug}>
                        <Link
                          href={`/product/${result.slug}`}
                          onClick={handleSearchResultClick}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-[#2a2a3a] transition-colors"
                        >
                          {result.image_url ? (
                            <img
                              src={result.image_url.startsWith("http") ? result.image_url : `/api/image?key=${encodeURIComponent(result.image_url)}`}
                              alt={result.name}
                              className="w-10 h-10 rounded-lg object-contain bg-white flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{result.name}</p>
                            <div className="flex items-center gap-2">
                              {result.price && (
                                <span className="text-sm font-semibold text-emerald-400">${result.price}</span>
                              )}
                              {result.original_price && result.price && parseFloat(result.original_price) > parseFloat(result.price) && (
                                <span className="text-xs text-gray-500 line-through">${result.original_price}</span>
                              )}
                            </div>
                          </div>
                          <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    {language === "zh" ? "未找到相关产品" : "No products found"}
                  </div>
                )}
              </div>
            )}
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
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3.5 text-base font-semibold transition-colors ${
                    activeTab === item.tab
                      ? 'text-white bg-[#1a1a24] border-l-4 border-purple-500'
                      : 'text-gray-400 hover:text-white hover:bg-[#1a1a24]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="my-2 mx-5 border-t border-gray-800" />
              <Link
                href="/about"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-5 py-3.5 text-base font-medium text-gray-400 hover:text-white hover:bg-[#1a1a24] transition-colors"
              >
                {language === "zh" ? "关于我们" : "About Us"}
              </Link>
              <Link
                href="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-5 py-3.5 text-base font-medium text-gray-400 hover:text-white hover:bg-[#1a1a24] transition-colors"
              >
                {language === "zh" ? "联系我们" : "Contact Us"}
              </Link>
              <Link
                href="/privacy"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-5 py-3.5 text-base font-medium text-gray-400 hover:text-white hover:bg-[#1a1a24] transition-colors"
              >
                {language === "zh" ? "隐私政策" : "Privacy Policy"}
              </Link>
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
