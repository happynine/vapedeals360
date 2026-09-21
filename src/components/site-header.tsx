'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLanguage } from '@/hooks/use-language';
import { useCurrency } from '@/hooks/use-currency';
import { useSiteSettings } from '@/components/site-settings-provider';
import { SearchDropdownContent } from '@/components/search-dropdown-content';

interface ProductHit {
  slug: string;
  name: string;
  image_url: string | null;
  price: string | null;
}
interface ArticleHit {
  slug: string;
  title: string;
}
interface SearchData {
  products: ProductHit[];
  news: ArticleHit[];
  best_vapes: ArticleHit[];
}
const EMPTY_SEARCH: SearchData = { products: [], news: [], best_vapes: [] };

interface SiteHeaderProps {
  activeTab?: 'vape-deals' | 'best-vapes' | 'news' | 'shop-by-state' | '';
}

export function SiteHeader({ activeTab = 'vape-deals' }: SiteHeaderProps) {
  const { siteSettings } = useSiteSettings();
  const { language, setLanguage, activeLanguages } = useLanguage();
  const { currencyCode, currencySymbol, setCurrency, currencies } = useCurrency();
  const [langOpen, setLangOpen] = useState(false);
  const [curOpen, setCurOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileLangOpen, setMobileLangOpen] = useState(false);
  const [mobileCurOpen, setMobileCurOpen] = useState(false);
  // Currency onboarding hint: auto-shown once per browser session on site open.
  const [curHintVisible, setCurHintVisible] = useState(false);
  const [curHintCountdown, setCurHintCountdown] = useState(10);
  const curHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curHintIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissCurHint = useCallback(() => {
    if (curHintTimerRef.current) {
      clearTimeout(curHintTimerRef.current);
      curHintTimerRef.current = null;
    }
    if (curHintIntervalRef.current) {
      clearInterval(curHintIntervalRef.current);
      curHintIntervalRef.current = null;
    }
    setCurHintVisible(false);
    try { sessionStorage.setItem('vp_cur_hint_shown', '1'); } catch {}
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchData>(EMPTY_SEARCH);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDwell, setSearchDwell] = useState(false);
  const [desktopSearchQuery, setDesktopSearchQuery] = useState('');
  const [desktopSearchResults, setDesktopSearchResults] = useState<SearchData>(EMPTY_SEARCH);
  const [desktopSearchLoading, setDesktopSearchLoading] = useState(false);
  const [desktopSearchDwell, setDesktopSearchDwell] = useState(false);
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false);
  const desktopSearchRef = useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktopDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  // 从URL读取搜索参数 - 不再使用useSearchParams，避免构建时预渲染错误
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSearch = params.get('search');
    if (urlSearch) {
      setDesktopSearchQuery(urlSearch);
      setSearchQuery(urlSearch);
    }
  }, []);

  const displayName = siteSettings?.site_name || '';
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Auto-show the currency hint once when the site is opened (per browser session)
  useEffect(() => {
    let shown = false;
    try { shown = sessionStorage.getItem('vp_cur_hint_shown') === '1'; } catch {}
    if (shown) return;
    // Mark immediately so navigating within 10s does not re-trigger it.
    try { sessionStorage.setItem('vp_cur_hint_shown', '1'); } catch {}
    setCurHintCountdown(10);
    setCurHintVisible(true);
    curHintIntervalRef.current = setInterval(() => {
      setCurHintCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    curHintTimerRef.current = setTimeout(() => setCurHintVisible(false), 10000);
    return () => {
      if (curHintTimerRef.current) clearTimeout(curHintTimerRef.current);
      if (curHintIntervalRef.current) clearInterval(curHintIntervalRef.current);
    };
  }, []);
  // SSR and first client render must match; only use real logo after mount
  const displayLogo = mounted ? siteSettings?.logo_url : undefined;
  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    setLangOpen(false);
    setMobileLangOpen(false);
    setMobileMenuOpen(false);
  };
  const handleCurrencyChange = (code: string) => {
    setCurOpen(false);
    setMobileCurOpen(false);
    setCurrency(code); // persists + reloads so SSR blocks use the new currency
  };
  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
    setSearchQuery('');
    setSearchResults(EMPTY_SEARCH);
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
  // Unified search call: matches after the debounce delay
  const runSearch = useCallback(
    async (query: string): Promise<SearchData> => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query.trim())}&language=${language}&currency=${encodeURIComponent(currencySymbol)}&view=dropdown`,
      );
      const json = await res.json();
      if (json?.success && json.data) return json.data as SearchData;
      return EMPTY_SEARCH;
    },
    [language, currencySymbol],
  );

  // Mobile search with debounce (2s dwell before matching)
  const handleMobileSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      // Hide the dropdown while the user is still typing; it only appears after
      // the 2s dwell timer fires (no loading spinner shown meanwhile).
      setSearchLoading(false);
      setSearchDwell(false);
      setSearchResults(EMPTY_SEARCH);
      if (!query.trim()) {
        return;
      }
      searchDebounceRef.current = setTimeout(async () => {
        setSearchDwell(true);
        setSearchLoading(true);
        try {
          setSearchResults(await runSearch(query));
        } catch {
          setSearchResults(EMPTY_SEARCH);
        } finally {
          setSearchLoading(false);
        }
      }, 2000);
    },
    [runSearch],
  );
  const handleSearchResultClick = () => {
    setSearchQuery('');
    setSearchResults(EMPTY_SEARCH);
    setMobileSearchOpen(false);
    setDesktopSearchQuery('');
    setDesktopSearchResults(EMPTY_SEARCH);
    setDesktopSearchFocused(false);
  };
  // Desktop search with debounce (2s dwell before matching)
  const handleDesktopSearch = useCallback(
    (query: string) => {
      setDesktopSearchQuery(query);
      if (desktopDebounceRef.current) {
        clearTimeout(desktopDebounceRef.current);
      }
      // Hide the dropdown while the user is still typing; it only appears after
      // the 2s dwell timer fires (no loading spinner shown meanwhile).
      setDesktopSearchLoading(false);
      setDesktopSearchDwell(false);
      setDesktopSearchResults(EMPTY_SEARCH);
      if (!query.trim()) {
        return;
      }
      desktopDebounceRef.current = setTimeout(async () => {
        setDesktopSearchDwell(true);
        setDesktopSearchLoading(true);
        try {
          setDesktopSearchResults(await runSearch(query));
        } catch {
          setDesktopSearchResults(EMPTY_SEARCH);
        } finally {
          setDesktopSearchLoading(false);
        }
      }, 2000);
    },
    [runSearch],
  );
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
    { href: '/vape-laws', label: 'US Market', tab: 'shop-by-state' },
    { href: '/best-vapes', label: 'Best Vapes', tab: 'best-vapes' },
    { href: '/news', label: 'News', tab: 'news' },
  ];
  const aboutLinks = [
    { href: '/about', en: 'About Us', zh: '关于我们' },
    { href: '/contact', en: 'Contact Us', zh: '联系我们' },
    { href: '/privacy', en: 'Privacy Policy', zh: '隐私政策' },
    { href: '/disclaimer', en: 'Disclaimer', zh: '免责声明' },
    { href: '/affiliate-disclosure', en: 'Affiliate Disclosure', zh: '联盟推广披露' },
    { href: '/terms-of-service', en: 'Terms of Service', zh: '服务条款' },
  ];
  const isAboutActive = aboutLinks.some(l => pathname === l.href || pathname.startsWith(l.href + '/'));
  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0e] border-b border-gray-800 relative">
      {/* Desktop Header */}
      <div className="hidden md:block">
        {/* Top row: Logo + Search + Language */}
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
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
                  {displayName ? displayName.charAt(0) : '\u00A0'}
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
                    onChange={(e) => { setDesktopSearchFocused(true); handleDesktopSearch(e.target.value); }}
                    onFocus={() => { setDesktopSearchFocused(true); if (desktopSearchQuery.trim()) handleDesktopSearch(desktopSearchQuery); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && desktopSearchQuery.trim()) {
                        e.preventDefault();
                        router.push(`/search?q=${encodeURIComponent(desktopSearchQuery.trim())}`);
                        setDesktopSearchFocused(false);
                      }
                    }}
                    placeholder={language === "zh" ? "搜索产品..." : "Search products..."}
                    className="w-full rounded-xl border border-gray-700 bg-[#1a1a24] pl-10 pr-8 py-2 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                  />
                  {desktopSearchQuery && (
                    <button
                      onClick={() => { handleDesktopSearch(''); setDesktopSearchResults(EMPTY_SEARCH); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {/* Desktop Search Results Dropdown */}
                {desktopSearchFocused && desktopSearchQuery.trim() && desktopSearchDwell && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[440px] max-w-[92vw] bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 max-h-[70vh] overflow-y-auto">
                    <SearchDropdownContent
                      loading={desktopSearchLoading}
                      data={desktopSearchResults}
                      query={desktopSearchQuery}
                      zh={language === 'zh'}
                      onNavigate={() => {
                        setDesktopSearchFocused(false);
                        setDesktopSearchQuery('');
                        setDesktopSearchResults(EMPTY_SEARCH);
                      }}
                    />
                  </div>
                )}
              </div>
              {/* Currency Dropdown */}
              <div className="relative">
                <button
                  onClick={() => { setCurOpen(!curOpen); setLangOpen(false); }}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#1a1a24] px-3 py-2 text-sm font-medium text-gray-300 hover:bg-[#2a2a3a] transition-colors"
                  aria-label="Currency"
                >
                  <img
                    src={currencies.find(c => c.code === currencyCode)?.flag}
                    alt={currencies.find(c => c.code === currencyCode)?.flagAlt}
                    className="h-4 w-4 rounded-sm object-cover"
                  />
                  {currencyCode}
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {curOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setCurOpen(false)} />
                    <div className="absolute right-0 mt-2 z-50 w-44 rounded-lg border border-gray-700 bg-[#1a1a24] shadow-lg overflow-hidden max-h-80 overflow-y-auto">
                      {currencies.map((cur) => (
                        <button
                          key={cur.code}
                          onClick={() => handleCurrencyChange(cur.code)}
                          className={`w-full px-4 py-2.5 text-sm text-left hover:bg-[#2a2a3a] transition-colors flex items-center gap-2 ${currencyCode === cur.code ? "text-purple-400 font-semibold" : "text-gray-300"}`}
                        >
                          <img src={cur.flag} alt={cur.flagAlt} className="h-4 w-4 rounded-sm object-cover" />
                          <span>{cur.code}</span>
                          <span className="text-gray-500">({cur.symbol})</span>
                          {currencyCode === cur.code && (
                            <svg className="h-4 w-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {curHintVisible && (
                  <div className="absolute right-0 top-full mt-3 z-50 w-64 rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-lg hidden sm:block animate-fade-in-up">
                    <div className="absolute -top-1.5 right-8 h-3 w-3 rotate-45 border-l border-t border-gray-200 bg-white" />
                    <button
                      onClick={dismissCurHint}
                      aria-label="Dismiss"
                      className="absolute right-1.5 top-1 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <p className="pr-5 text-sm font-medium text-gray-900">
                      {language === 'zh' ? '请选择您需要交易货币种类' : 'Please select your preferred currency'}
                      <span className="ml-1 font-normal text-gray-400 tabular-nums">
                        {language === 'zh' ? `（${curHintCountdown}秒）` : `(${curHintCountdown}s)`}
                      </span>
                    </p>
                  </div>
                )}
              </div>
              {/* Language Dropdown */}
              <div className="relative">
                <button
                  onClick={() => { setLangOpen(!langOpen); setCurOpen(false); }}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#1a1a24] px-3 py-2 text-sm font-medium text-gray-300 hover:bg-[#2a2a3a] transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  {activeLanguages.find(l => l.code === language)?.name || language.toUpperCase()}
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {langOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                    <div className="absolute right-0 mt-2 z-50 w-36 rounded-lg border border-gray-700 bg-[#1a1a24] shadow-lg overflow-hidden">
                      {activeLanguages.map((langInfo) => (
                        <button
                          key={langInfo.code}
                          onClick={() => handleLanguageChange(langInfo.code)}
                          className={`w-full px-4 py-2.5 text-sm text-left hover:bg-[#2a2a3a] transition-colors flex items-center gap-2 ${language === langInfo.code ? "text-purple-400 font-semibold" : "text-gray-300"}`}
                        >
                          {langInfo.name}
                          {language === langInfo.code && (
                            <svg className="h-4 w-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Tab Navigation: Vape Deals / Best Vapes / News */}
        <div className="border-t border-gray-800">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
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
              {/* About Hover Dropdown */}
              <div className="relative group h-12 flex items-center">
                <button
                  type="button"
                  className={`flex items-center gap-1 text-sm font-semibold transition-colors ${isAboutActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}
                >
                  About
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div className="absolute left-1/2 top-full -translate-x-1/2 pt-1 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-150 z-50">
                  <div className="w-52 rounded-xl border border-gray-700 bg-[#1a1a24] shadow-2xl py-2 overflow-hidden">
                    {aboutLinks.map(l => (
                      <Link
                        key={l.href}
                        href={l.href}
                        className={`block px-4 py-2.5 text-sm transition-colors hover:bg-[#2a2a3a] hover:text-white ${(pathname === l.href || pathname.startsWith(l.href + '/')) ? 'text-purple-400' : 'text-gray-300'}`}
                      >
                        {language === 'zh' ? l.zh : l.en}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
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
                {displayName ? displayName.charAt(0) : '\u00A0'}
              </div>
            )}
            <span className="text-lg font-bold tracking-tight text-white">{displayName || '\u00A0'}</span>
          </Link>
          {/* Right: Currency + Language + Search */}
          <div className="flex items-center gap-1">
            {/* Currency Toggle */}
            <div className="relative">
            <button
              onClick={() => setMobileCurOpen(!mobileCurOpen)}
              className="flex items-center gap-1 h-10 px-2 rounded-lg text-gray-300 hover:bg-[#1a1a24] transition-colors"
              aria-label="Currency"
            >
              <img
                src={currencies.find(c => c.code === currencyCode)?.flag}
                alt={currencies.find(c => c.code === currencyCode)?.flagAlt}
                className="h-4 w-4 rounded-sm object-cover"
              />
              <span className="text-sm font-medium">{currencyCode}</span>
            </button>
            {curHintVisible && (
              <div className="absolute right-0 top-full mt-2 z-50 w-60 rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-lg sm:hidden">
                <div className="absolute -top-1.5 right-4 h-3 w-3 rotate-45 border-l border-t border-gray-200 bg-white" />
                <button
                  onClick={dismissCurHint}
                  aria-label="Dismiss"
                  className="absolute right-1.5 top-1 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <p className="pr-5 text-sm font-medium text-gray-900">
                  {language === 'zh' ? '请选择您需要交易货币种类' : 'Please select your preferred currency'}
                  <span className="ml-1 font-normal text-gray-400 tabular-nums">
                    {language === 'zh' ? `（${curHintCountdown}秒）` : `(${curHintCountdown}s)`}
                  </span>
                </p>
              </div>
            )}
            </div>
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
        {/* Mobile Currency Dropdown */}
        {mobileCurOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMobileCurOpen(false)} />
            <div className="absolute right-4 top-14 z-50 w-44 rounded-lg border border-gray-700 bg-[#1a1a24] shadow-lg overflow-hidden max-h-80 overflow-y-auto">
              {currencies.map((cur) => (
                <button
                  key={cur.code}
                  onClick={() => handleCurrencyChange(cur.code)}
                  className={`w-full px-4 py-2.5 text-sm text-left hover:bg-[#2a2a3a] transition-colors flex items-center gap-2 ${currencyCode === cur.code ? "text-purple-400 font-semibold" : "text-gray-300"}`}
                >
                  <img src={cur.flag} alt={cur.flagAlt} className="h-4 w-4 rounded-sm object-cover" />
                  <span>{cur.code}</span>
                  <span className="text-gray-500">({cur.symbol})</span>
                  {currencyCode === cur.code && (
                    <svg className="h-4 w-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
        {/* Mobile Language Dropdown */}
        {mobileLangOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMobileLangOpen(false)} />
            <div className="absolute right-4 top-14 z-50 w-36 rounded-lg border border-gray-700 bg-[#1a1a24] shadow-lg overflow-hidden">
              {activeLanguages.map((langInfo) => (
                <button
                  key={langInfo.code}
                  onClick={() => handleLanguageChange(langInfo.code)}
                  className={`w-full px-4 py-2.5 text-sm text-left hover:bg-[#2a2a3a] transition-colors flex items-center gap-2 ${language === langInfo.code ? "text-purple-400 font-semibold" : "text-gray-300"}`}
                >
                  {langInfo.name}
                  {language === langInfo.code && (
                    <svg className="h-4 w-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    e.preventDefault();
                    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                    setMobileSearchOpen(false);
                  }
                }}
                placeholder={language === "zh" ? "搜索产品..." : "Search products..."}
                className="w-full rounded-xl border border-gray-700 bg-[#1a1a24] pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSearchResults(EMPTY_SEARCH); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {/* Search Results Dropdown */}
            {searchQuery.trim() && searchDwell && (
              <div className="mt-2 rounded-2xl border border-gray-200 bg-white shadow-xl max-h-[60vh] overflow-y-auto">
                <SearchDropdownContent
                  loading={searchLoading}
                  data={searchResults}
                  query={searchQuery}
                  zh={language === 'zh'}
                  onNavigate={() => {
                    setSearchQuery('');
                    setSearchResults(EMPTY_SEARCH);
                  }}
                />
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
                    {displayName ? displayName.charAt(0) : '\u00A0'}
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
              {aboutLinks.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-5 py-3.5 text-base font-medium text-gray-400 hover:text-white hover:bg-[#1a1a24] transition-colors"
                >
                  {language === 'zh' ? l.zh : l.en}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
