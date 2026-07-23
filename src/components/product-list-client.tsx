"use client";    

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";
import Link from "next/link";
import { SafeImage } from "@/components/safe-image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import BannerCarousel from "./banner-carousel";

// Types
interface CategoryTranslation {
  id: number;
  category_id: number;
  language: string;
  name: string;
}

interface Category {
  id: number;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  translations: CategoryTranslation[];
}

interface StoreTranslation {
  id: number;
  store_id: number;
  language: string;
  name: string;
}

interface Store {
  id: number;
  slug: string;
  logo_url: string | null;
  website_url: string | null;
  store_type: string;
  is_active: boolean;
  translations: StoreTranslation[];
  regions?: Array<{ region: string; currency: string }>;
}

interface ProductPrice {
  id: number;
  product_id: number;
  store_id: number;
  current_price: string;
  original_price: string | null;
  product_url: string;
  in_stock: boolean;
  discount_percent: number | null;
  currency?: string;
  region?: string;
  no_quote?: boolean;
  store?: Store;
}

interface ProductTranslation {
  id: number;
  product_id: number;
  language: string;
  name: string;
  description: string | null;
  features: string | null;
  specs: string | null;
}

interface Product {
  id: number;
  slug: string;
  category_id: number | null;
  image_url: string | null;
  image_url_small: string | null;
  images: string | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string | null;
  translations: ProductTranslation[];
  prices: ProductPrice[];
}

interface Banner {
  id: number;
  image_url: string | null;
  mobile_image_url: string | null;
  translated_image_url?: string | null;
  translated_mobile_image_url?: string | null;
  link_url: string | null;
  title: string | null;
  subtitle: string | null;
}

interface PromotionTranslation {
  id: number;
  language: string;
  name: string;
  cover_image_key: string | null;
  cover_image_url: string | null;
}

interface Promotion {
  id: number;
  slug: string;
  is_active: boolean;
  sort_order: number;
  time_type: string;
  start_time: string | null;
  end_time: string | null;
  countdown_action: string;
  translations: PromotionTranslation[];
  promotion_translations?: PromotionTranslation[];
  countdown?: { days: number; hours: number; minutes: number; seconds: number } | null;
  product_count: number;
}

export interface InitialData {
  categories: Category[];
  products: Product[];
  featuredProducts: Product[];
  banners: Banner[];
  promotions: Promotion[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Helper functions
function getTranslation<T extends { language: string }>(translations: T[] | undefined | null, language: string): T | undefined {
  if (!translations || translations.length === 0) return undefined;
  return translations.find(t => t.language === language) || translations.find(t => t.language === "en") || translations[0];
}

// 货币定义：国旗 emoji + 货币代码 + 货币符号
// 货币定义：国旗图片 URL + 货币代码 + 货币符号
// 使用 flagcdn.com 的国旗图片
type Currency = {
  code: string;
  symbol: string;
  flag: string;
  flagAlt: string;
  name: string;
};

const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', flag: '/flags/us.png', flagAlt: 'US', name: 'US Dollar' },
  { code: 'JPY', symbol: '¥', flag: '/flags/jp.png', flagAlt: 'JP', name: 'Japanese Yen' },
  { code: 'KRW', symbol: '₩', flag: '/flags/kr.png', flagAlt: 'KR', name: 'Korean Won' },
  { code: 'AUD', symbol: 'A$', flag: '/flags/au.png', flagAlt: 'AU', name: 'Australian Dollar' },
  { code: 'GBP', symbol: '£', flag: '/flags/gb.png', flagAlt: 'GB', name: 'British Pound' },
  { code: 'EUR', symbol: '€', flag: '/flags/eu.png', flagAlt: 'EU', name: 'Euro' },
  { code: 'RUB', symbol: '₽', flag: '/flags/ru.png', flagAlt: 'RU', name: 'Russian Ruble' },
  { code: 'CAD', symbol: 'C$', flag: '/flags/ca.png', flagAlt: 'CA', name: 'Canadian Dollar' },
  { code: 'IDR', symbol: 'Rp', flag: '/flags/id.png', flagAlt: 'ID', name: 'Indonesian Rupiah' },
];


// 多语言货币名称
const CURRENCY_NAMES: Record<string, Record<string, string>> = {
  en: {
    USD: 'US Dollar',
    JPY: 'Japanese Yen',
    KRW: 'Korean Won',
    AUD: 'Australian Dollar',
    GBP: 'British Pound',
    EUR: 'Euro',
    RUB: 'Russian Ruble',
    CAD: 'Canadian Dollar',
    IDR: 'Indonesian Rupiah',
  },
  zh: {
    USD: '美元',
    JPY: '日元',
    KRW: '韩元',
    AUD: '澳元',
    GBP: '英镑',
    EUR: '欧元',
    RUB: '卢布',
    CAD: '加元',
    IDR: '印尼盾',
  },
  ja: {
    USD: '米ドル',
    JPY: '日本円',
    KRW: '韓国ウォン',
    AUD: 'オーストラリアドル',
    GBP: '英国ポンド',
    EUR: 'ユーロ',
    RUB: 'ロシアルーブル',
    CAD: 'カナダドル',
    IDR: 'インドネシアルピア',
  },
};

function getLowestPrice(prices: ProductPrice[]): ProductPrice | null {
  if (!prices || prices.length === 0) return null;
  return prices.reduce((min, p) => parseFloat(p.current_price) < parseFloat(min.current_price) ? p : min, prices[0]);
}

function getHighestOriginal(prices: ProductPrice[]): string | null {
  if (!prices || prices.length === 0) return null;
  const originals = prices.filter(p => p.original_price).map(p => parseFloat(p.original_price!));
  return originals.length > 0 ? Math.max(...originals).toFixed(2) : null;
}

function getDiscountDisplay(prices: ProductPrice[]): { type: 'save'; currency: string; amount: string } | { type: 'percent'; value: number } | null {
  if (!prices || prices.length === 0) return null;

  if (prices.length >= 2) {
    const byCurrency: Record<string, ProductPrice[]> = {};
    prices.forEach(p => {
      const cur = p.currency || '$';
      if (!byCurrency[cur]) byCurrency[cur] = [];
      byCurrency[cur].push(p);
    });

    let maxDiff = 0;
    let resultCurrency = '$';
    let highestPrice = 0;
    let lowestPrice = 0;

    for (const [cur, curPrices] of Object.entries(byCurrency)) {
      if (curPrices.length < 2) continue;
      const priceValues = curPrices.map(p => parseFloat(p.current_price));
      const high = Math.max(...priceValues);
      const low = Math.min(...priceValues);
      const diff = high - low;
      if (diff > maxDiff) {
        maxDiff = diff;
        resultCurrency = cur;
        highestPrice = high;
        lowestPrice = low;
      }
    }

    if (maxDiff === 0) {
      const firstCurrency = Object.keys(byCurrency)[0] || '$';
      const curPrices = byCurrency[firstCurrency] || prices;
      const priceValues = curPrices.map(p => parseFloat(p.current_price));
      highestPrice = Math.max(...priceValues);
      lowestPrice = Math.min(...priceValues);
      maxDiff = highestPrice - lowestPrice;
      resultCurrency = firstCurrency;
    }

    return { type: 'save', currency: resultCurrency, amount: maxDiff.toFixed(2) };
  }

  const price = prices[0];
  if (price.original_price) {
    const current = parseFloat(price.current_price);
    const original = parseFloat(price.original_price);
    if (original > current) {
      const percent = Math.round((original - current) / original * 100);
      return { type: 'percent', value: percent };
    }
  }

  return null;
}

export function ProductListClient({ initialData }: { initialData: InitialData }) {
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  // Initial state from server
  const [categories, setCategories] = useState<Category[]>(initialData.categories);
  const [products, setProducts] = useState<Product[]>(initialData.products);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>(initialData.featuredProducts);
  const [banners, setBanners] = useState<Banner[]>(initialData.banners);
  const [promotions, setPromotions] = useState<Promotion[]>(initialData.promotions);
  const [totalPages, setTotalPages] = useState(initialData.pagination.totalPages);
  const [total, setTotal] = useState(initialData.pagination.total);
  
  // Client state for filters
  const urlSearch = searchParams.get('search') || '';
  const urlPage = parseInt(searchParams.get('page') || '1');
  const urlCategory = searchParams.get('category');
  
  const [selectedCategory, setSelectedCategory] = useState<number | null>(urlCategory ? parseInt(urlCategory) : null);
  const [page, setPage] = useState(urlPage);
  const [searchQuery, setSearchQuery] = useState(urlSearch);
  const [sortBy, setSortBy] = useState<"newest" | "price_low" | "price_high">("newest");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  // 默认选择美元
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>("USD");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("$");
    const hasFetchedRef = useRef(false);

  // Fetch data when filters change (after initial load)
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        language,
        page: page.toString(),
        limit: "20"
      });

      if (selectedCategory) params.set("category_id", selectedCategory.toString());
      if (searchQuery) params.set("search", searchQuery);
      if (selectedCurrencyCode) params.set("currency", selectedCurrencyCode);
      if (sortBy === "newest") {
        params.set("sort_by", "id");
        params.set("sort_order", "desc");
      } else {
        params.set("sort_by", "id");
        params.set("sort_order", "desc");
      }

      const res = await fetch(`/api/products?${params}`);
      const json = await res.json();

      if (json.success) {
        setCategories(json.data.categories || []);
        setProducts(json.data.products || []);
        setTotalPages(json.data.pagination?.totalPages || 1);
        setTotal(json.data.pagination?.total || 0);
      }

      // Fetch featured and banners only on first page without filters
      if (page === 1 && !selectedCategory && !searchQuery) {
        const featRes = await fetch(`/api/products?featured=true&limit=5&language=${language}`);
        const featJson = await featRes.json();
        if (featJson.success) setFeaturedProducts(featJson.data.products || []);

        const bannerRes = await fetch(`/api/banners?language=${language}`);
        const bannerJson = await bannerRes.json();
        if (bannerJson.success) setBanners(bannerJson.data || []);

        const promoRes = await fetch(`/api/promotions?language=${language}`);
        const promoJson = await promoRes.json();
        if (promoJson.success) {
          setPromotions(promoJson.data.promotions || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [language, page, selectedCategory, selectedCurrencyCode, selectedCurrency, searchQuery, sortBy]);

  // Mount effect - read from sessionStorage
  useEffect(() => {
    const savedCurrencyCode = sessionStorage.getItem('selectedCurrencyCode');
    
    if (savedCurrencyCode) {
      const currency = CURRENCIES.find(c => c.code === savedCurrencyCode);
      if (currency) {
        setSelectedCurrencyCode(currency.code);
        setSelectedCurrency(currency.symbol);
      }
    }
    setMounted(true);
    // Use initial data on first load, skip fetch
    setIsInitialLoad(false);
  }, []);

  // Fetch when filters change (skip initial load since data is already passed as props)
  useEffect(() => {
    if (mounted && !isInitialLoad) {
      if (hasFetchedRef.current) {
        fetchData();
      } else {
        hasFetchedRef.current = true;
      }
    }
  }, [mounted, isInitialLoad, fetchData]);
  
  // Track page view
  useEffect(() => {
    const sessionId = sessionStorage.getItem("vp_session_id") || (() => {
      const id = "s_" + Math.random().toString(36).substring(2, 12);
      sessionStorage.setItem("vp_session_id", id);
      return id;
    })();
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "page_view", session_id: sessionId, page: "/", referrer: document.referrer }),
    }).catch(() => {});
  }, []);

  // Update URL when filters change
  const updateUrl = useCallback((newFilters: { page?: number; category?: number | null; search?: string }) => {
    const params = new URLSearchParams();
    const finalPage = newFilters.page ?? page;
    const finalCategory = newFilters.category ?? selectedCategory;
    const finalSearch = newFilters.search ?? searchQuery;
    
    if (finalPage > 1) params.set('page', finalPage.toString());
    if (finalCategory) params.set('category', finalCategory.toString());
    if (finalSearch) params.set('search', finalSearch);
    
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [page, selectedCategory, searchQuery, pathname, router]);

  // Filter products client-side
  const filteredProducts = (() => {
    let list = products.filter(product => {
      const hasValidPrice = product.prices.some(p => {
        if (p.no_quote) return false;
        if (p.store && !p.store.is_active) return false;
        return true;
      });
      return hasValidPrice;
    });

    if (sortBy === "price_low") {
      list = [...list].sort((a, b) => {
        const aPrice = getLowestPrice(a.prices);
        const bPrice = getLowestPrice(b.prices);
        return (aPrice ? parseFloat(aPrice.current_price) : Infinity) - (bPrice ? parseFloat(bPrice.current_price) : Infinity);
      });
    } else if (sortBy === "price_high") {
      list = [...list].sort((a, b) => {
        const aPrice = getLowestPrice(a.prices);
        const bPrice = getLowestPrice(b.prices);
        return (bPrice ? parseFloat(bPrice.current_price) : 0) - (aPrice ? parseFloat(aPrice.current_price) : 0);
      });
    }
    return list;
  })();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Banner Section */}
      {banners.length > 0 && (
        <div className="mb-8 -mx-4 sm:mx-0 sm:mt-0">
          <div className="relative overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border sm:border-gray-200 bg-gray-50">
            <BannerCarousel banners={banners} language={language} />
          </div>
        </div>
      )}

      {/* Promotions Section - Cover Images */}
      {promotions.length > 0 && page === 1 && !selectedCategory && !searchQuery && (
        <div className="mb-8">
          {/* Mobile: Carousel with dots */}
          <div className="sm:hidden">
            <PromotionCarousel promotions={promotions} language={language} />
          </div>
          {/* Desktop: Grid */}
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {promotions.map((promotion) => {
              const translation = promotion.translations?.[0] || promotion.promotion_translations?.[0];
              const coverImage = translation?.cover_image_url || translation?.cover_image_key;
              if (!coverImage) return null;
              return (
                <Link
                  key={promotion.id}
                  href={`/promotion/${promotion.slug}`}
                  className="group relative overflow-hidden rounded-xl transition-all"
                >
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <SafeImage
                      src={coverImage}
                      alt={translation?.name || promotion.slug}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Featured Products */}
      {featuredProducts.length > 0 && page === 1 && !selectedCategory && !searchQuery && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 animate-pulse-deal">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M12.395 2.553a1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" />
              </svg>
              {language === "zh" ? "今日特价" : "HOT DEALS"}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredProducts.slice(0, 3).map(product => {
              const t = getTranslation(product.translations, language);
              // Apply currency filtering to featured products
              const currencyPrices = product.prices.filter(p => {
                if (p.no_quote) return false;
                if (p.store && !p.store.is_active) return false;
                const priceCurrency = p.currency || '$';
                return priceCurrency === selectedCurrency;
              });
              const displayPrices = currencyPrices.length > 0 ? currencyPrices : product.prices.filter(p => !p.no_quote && (!p.store || p.store.is_active));
              const lowest = getLowestPrice(displayPrices);
              const highestOrig = getHighestOriginal(displayPrices);
              const discountInfo = getDiscountDisplay(displayPrices);

              return (
                <Link
                  key={product.id}
                  href={`/product/${product.slug}`}
                  className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-purple-300 transition-all"
                >
                  {discountInfo && (
                    <div className="absolute top-3 right-3 z-10 rounded-lg bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                      {discountInfo.type === 'percent' ? `-${discountInfo.value}%` : `Save ${discountInfo.currency}${discountInfo.amount}`}
                    </div>
                  )}
                  <div className="flex gap-4">
                    <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                      {product.image_url && (
                        <SafeImage src={product.image_url} alt={t?.name || ""} fill className="object-cover" sizes="96px" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-purple-700 transition-colors">
                        {t?.name}
                      </h3>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-xl font-bold text-emerald-600 tabular-nums">
                          {lowest?.currency || '$'}{lowest?.current_price || "—"}
                        </span>
                        {highestOrig && displayPrices.length >= 2 && (
                          <span className="text-xs text-emerald-600 font-medium ml-0.5">
                            {language === "zh" ? "最低价" : "Lowest"}
                          </span>
                        )}
                        {highestOrig && displayPrices.length < 2 && (
                          <span className="text-sm text-gray-400 line-through tabular-nums">${highestOrig}</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {displayPrices.length} {language === "zh" ? "家商城比价" : "stores compared"}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Controls */}
      <div className="mb-6 space-y-3">
        {/* Currency Filter */}
        {!mounted ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">{language === "zh" ? "货币" : "Currency"}</span>
            <div className="flex gap-2">
              {CURRENCIES.slice(0, 6).map((currency) => (
                <div key={currency.code} className="h-7 w-20 rounded-full bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">{language === "zh" ? "货币" : "Currency"}</span>
            {CURRENCIES.map((currency) => {
              const currencyName = CURRENCY_NAMES[language]?.[currency.code] || currency.name;
              return (
                <button
                  key={currency.code}
                  onClick={() => {
                    setSelectedCurrencyCode(currency.code);
                    setSelectedCurrency(currency.symbol);
                    setPage(1);
                    sessionStorage.setItem('selectedCurrencyCode', currency.code);
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all flex items-center gap-1.5 ${
                    selectedCurrencyCode === currency.code ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <img src={currency.flag} alt={currency.flagAlt} className="w-4 h-4 rounded-sm object-cover" />
                  <span>{currency.code}</span>
                  <span>({currency.symbol})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Category */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">{language === "zh" ? "类型" : "Type"}</span>
          <button
            onClick={() => {
              setSelectedCategory(null);
              setPage(1);
              updateUrl({ category: null, page: 1 });
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
              selectedCategory === null ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200"
            }`}
          >
            {language === "zh" ? "全部" : "All"}
          </button>
          {categories.map(cat => {
            const ct = getTranslation(cat.translations, language);
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setPage(1);
                  updateUrl({ category: cat.id, page: 1 });
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  selectedCategory === cat.id ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                }`}
              >
                {cat.icon} {ct?.name}
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{language === "zh" ? "排序" : "Sort By"}</span>
          <button
            onClick={() => { setSortBy("newest"); setPage(1); }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
              sortBy === "newest" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {language === "zh" ? "最新发布" : "Newest"}
          </button>
          <button
            onClick={() => { setSortBy("price_low"); setPage(1); }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
              sortBy === "price_low" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {language === "zh" ? "价格从低到高" : "Price Low To High"}
          </button>
          <button
            onClick={() => { setSortBy("price_high"); setPage(1); }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
              sortBy === "price_high" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {language === "zh" ? "价格从高到低" : "Price High To Low"}
          </button>
        </div>
      </div>

      {/* Search Results */}
      {searchQuery && !loading && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-lg font-semibold text-gray-900">
            {language === "zh" ? `搜索"${searchQuery}"的结果` : `Search results for "${searchQuery}"`}
          </span>
          <span className="text-sm text-gray-500">
            ({total} {language === "zh" ? "个产品" : "products"})
          </span>
          <button
            onClick={() => { setSearchQuery(""); setPage(1); updateUrl({ search: "", page: 1 }); }}
            className="ml-auto text-sm text-purple-600 hover:text-purple-800 font-medium"
          >
            {language === "zh" ? "清除搜索" : "Clear search"}
          </button>
        </div>
      )}

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 animate-pulse">
              <div className="h-40 sm:h-48 w-full rounded-xl bg-gray-100" />
              <div className="mt-3 h-4 w-3/4 rounded bg-gray-100" />
              <div className="mt-2 h-6 w-1/2 rounded bg-gray-100" />
              <div className="mt-3 space-y-2">
                <div className="h-8 w-full rounded bg-gray-100" />
                <div className="h-8 w-full rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 0 00-.707.293l-2.414 2.414a1 0 01-.707.293h-3.172a1 0 01-.707-.293l-2.414-2.414A1 0 006.586 13H4" />
          </svg>
          <p className="mt-4 text-lg text-gray-400">{language === "zh" ? "暂无产品" : "No products found"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {filteredProducts.map((product, idx) => {
            const t = getTranslation(product.translations, language);

            // 直接按货币筛选价格
            const displayPrices = product.prices.filter(p => {
              if (p.no_quote) return false;
              if (p.store && !p.store.is_active) return false;
              const priceCurrency = p.currency || '$';
              return priceCurrency === selectedCurrency;
            });

            // 如果没有匹配货币的价格，fallback 到显示所有价格（避免产品不显示）
            const finalPrices = displayPrices.length > 0 ? displayPrices : product.prices.filter(p => !p.no_quote && (!p.store || p.store.is_active));

            if (finalPrices.length === 0) return null;

            const lowest = getLowestPrice(finalPrices);
            const highestOrig = getHighestOriginal(finalPrices);
            const discountInfo = getDiscountDisplay(finalPrices);
            const sortedPrices = [...finalPrices].sort((a, b) => parseFloat(a.current_price) - parseFloat(b.current_price));

            return (
              <div
                key={product.id}
                className="group rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-purple-300 transition-all animate-fade-in-up"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <Link
                  href={`/product/${product.slug}`}
                  className="block relative aspect-square bg-gray-50 overflow-hidden"
                  onClick={() => {
                    const sid = sessionStorage.getItem("vp_session_id") || "";
                    fetch("/api/track", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "product_click", session_id: sid, product_id: product.id }),
                    }).catch(() => {});
                  }}
                >
                  {product.image_url && (
                    <SafeImage
                      src={product.image_url_small || product.image_url}
                      alt={t?.name || ""}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      loading={idx < 4 ? "eager" : "lazy"}
                      priority={idx < 2}
                    />
                  )}
                  {discountInfo && (
                    <div className="absolute top-2 left-2 z-10 rounded-lg bg-red-500 px-2 py-0.5 text-xs font-bold text-white animate-pulse-deal">
                      {discountInfo.type === 'percent' ? `-${discountInfo.value}%` : `Save ${discountInfo.currency}${discountInfo.amount}`}
                    </div>
                  )}
                  {product.is_featured && (
                    <div className="absolute top-2 right-2 z-10 rounded-lg bg-purple-700 px-2 py-0.5 text-xs font-semibold text-white">
                      {language === "zh" ? "精选" : "Featured"}
                    </div>
                  )}
                </Link>
                <div className="p-3 sm:p-4">
                  <Link href={`/product/${product.slug}`}>
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-purple-700 transition-colors leading-snug">
                      {t?.name}
                    </h3>
                  </Link>
                  <div className="mt-1.5 sm:mt-2 flex items-baseline gap-1 sm:gap-2">
                    <span className="text-base sm:text-2xl font-bold text-emerald-600 tabular-nums">
                      {lowest?.currency || '$'}{lowest?.current_price || "—"}
                    </span>
                    {highestOrig && displayPrices.length >= 2 && (
                      <span className="text-[10px] sm:text-xs text-emerald-600 font-medium ml-0.5">
                        {language === "zh" ? "最低价" : "Lowest"}
                      </span>
                    )}
                    {highestOrig && displayPrices.length < 2 && (
                      <span className="text-xs sm:text-sm text-gray-400 line-through tabular-nums">{lowest?.currency || '$'}{highestOrig}</span>
                    )}
                  </div>
                  {/* Mobile: only show top store price; Desktop: show full store list */}
                  <div className="mt-1.5 sm:hidden">
                    {sortedPrices.slice(0, 1).map(price => {
                      const st = price.store ? getTranslation(price.store.translations, language) : null;
                      return (
                        <div key={price.id} className="flex items-center justify-between gap-1 rounded-md bg-gray-50 px-2 py-1">
                          <span className="text-[10px] text-gray-500 truncate">{st?.name || "Store"}</span>
                          <span className="text-[10px] font-semibold text-emerald-600 tabular-nums">
                            {price.currency || '$'}{price.current_price}
                          </span>
                        </div>
                      );
                    })}
                    {sortedPrices.length > 1 && (
                      <Link href={`/product/${product.slug}`} className="block text-center text-[10px] text-purple-700 hover:underline py-0.5">
                        +{sortedPrices.length - 1} {language === "zh" ? "家商城" : "stores"}
                      </Link>
                    )}
                  </div>
                  <div className="hidden sm:block mt-3 space-y-1.5">
                    {sortedPrices.slice(0, 3).map(price => {
                      const st = price.store ? getTranslation(price.store.translations, language) : null;
                      return (
                        <div key={price.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="h-5 w-5 flex-shrink-0 rounded bg-purple-50 flex items-center justify-center overflow-hidden">
                              {price.store?.logo_url ? (
                                <img
                                  src={price.store.logo_url.startsWith("http") ? price.store.logo_url : `/api/image?key=${encodeURIComponent(price.store.logo_url)}`}
                                  alt=""
                                  className="w-full h-full object-contain"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="text-[10px] font-bold text-purple-600">{st?.name?.charAt(0) || "?"}</span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500 truncate">{st?.name || "Store"}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs font-semibold text-emerald-600 tabular-nums">
                              {price.currency || '$'}{price.current_price}
                            </span>
                            <a
                              href={price.product_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                const sid = sessionStorage.getItem("vp_session_id") || "";
                                fetch("/api/track", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ type: "buy_click", session_id: sid, product_id: price.product_id, store_id: price.store_id }),
                                }).catch(() => {});
                              }}
                              className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 hover:bg-purple-700 hover:text-white transition-all"
                            >
                              {language === "zh" ? "购买" : "Buy"}
                            </a>
                          </div>
                        </div>
                      );
                    })}
                    {sortedPrices.length > 3 && (
                      <Link href={`/product/${product.slug}`} className="block text-center text-xs text-purple-700 hover:underline py-1">
                        {language === "zh" ? `查看全部 ${sortedPrices.length} 家商城` : `View all ${sortedPrices.length} stores`}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          total={total}
          language={language}
          onPageChange={(newPage) => {
            setPage(newPage);
            updateUrl({ page: newPage });
          }}
        />
      )}
    </div>
  );
}

// Pagination Component
function Pagination({
  currentPage,
  totalPages,
  total,
  language,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  total: number;
  language: string;
  onPageChange: (newPage: number) => void;
}) {
  const [jumpValue, setJumpValue] = useState("");

  const getPageNumbers = (): (number | "...")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [1];
    if (currentPage > 4) pages.push("...");
    const start = Math.max(2, currentPage - 2);
    const end = Math.min(totalPages - 1, currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 3) pages.push("...");
    pages.push(totalPages);
    return pages;
  };

  const handleJump = () => {
    const num = parseInt(jumpValue, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) onPageChange(num);
    setJumpValue("");
  };

  return (
    <div className="mt-8 flex items-center justify-center gap-1 select-none">
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="flex items-center justify-center w-8 h-8 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      {getPageNumbers().map((p, idx) =>
        p === "..." ? (
          <span key={`ellipsis-${idx}`} className="flex items-center justify-center w-8 h-8 text-gray-400 text-sm">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`flex items-center justify-center w-8 h-8 rounded text-sm font-medium transition-colors ${
              currentPage === p
                ? "bg-purple-600 text-white border border-purple-600"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-purple-50 hover:text-purple-600"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="flex items-center justify-center w-8 h-8 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <div className="flex items-center gap-1.5 ml-3 text-sm text-gray-500">
        <span>{language === "zh" ? "跳至" : "Go to"}</span>
        <input
          type="text"
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && handleJump()}
          className="w-10 h-8 rounded border border-gray-200 bg-white text-center text-sm focus:outline-none focus:border-purple-400"
        />
        <span>{language === "zh" ? "页" : ""}</span>
      </div>
      <span className="ml-3 text-sm text-gray-400">{language === "zh" ? `共 ${total} 条` : `${total} items`}</span>
    </div>
  );
}

// Promotion Carousel for Mobile
function PromotionCarousel({
  promotions,
  language,
}: {
  promotions: Promotion[];
  language: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const validPromotions = promotions.filter((promotion) => {
    const translation = promotion.translations?.[0] || promotion.promotion_translations?.[0];
    return translation?.cover_image_url || translation?.cover_image_key;
  });

  const startAutoPlay = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % validPromotions.length);
    }, 4000);
  }, [validPromotions.length]);

  const stopAutoPlay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (validPromotions.length > 1) {
      startAutoPlay();
    }
    return stopAutoPlay;
  }, [validPromotions.length, startAutoPlay, stopAutoPlay]);

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      startAutoPlay();
    },
    [startAutoPlay]
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    stopAutoPlay();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) {
      startAutoPlay();
      return;
    }
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentIndex < validPromotions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
    startAutoPlay();
  };

  if (validPromotions.length === 0) return null;

  if (validPromotions.length === 1) {
    const promotion = validPromotions[0];
    const translation = promotion.translations?.[0] || promotion.promotion_translations?.[0];
    const coverImage = translation?.cover_image_url || translation?.cover_image_key;
    return (
      <Link href={`/promotion/${promotion.slug}`} className="block relative aspect-[16/9] overflow-hidden rounded-xl">
        <SafeImage
          src={coverImage!}
          alt={translation?.name || promotion.slug}
          fill
          className="object-cover"
          sizes="100vw"
        />
      </Link>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides */}
      <div
        className="flex transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {validPromotions.map((promotion) => {
          const translation = promotion.translations?.[0] || promotion.promotion_translations?.[0];
          const coverImage = translation?.cover_image_url || translation?.cover_image_key;
          return (
            <Link
              key={promotion.id}
              href={`/promotion/${promotion.slug}`}
              className="block w-full flex-shrink-0"
            >
              <div className="relative aspect-[16/9] overflow-hidden">
                <SafeImage
                  src={coverImage!}
                  alt={translation?.name || promotion.slug}
                  fill
                  className="object-cover"
                  sizes="100vw"
                />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Dots */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
        {validPromotions.map((_, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            className={`rounded-full transition-all duration-300 ${
              currentIndex === index
                ? "w-5 h-1.5 bg-white"
                : "w-1.5 h-1.5 bg-white/50"
            }`}
            aria-label={`${language === "zh" ? "切换到第" : "Go to slide"} ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
