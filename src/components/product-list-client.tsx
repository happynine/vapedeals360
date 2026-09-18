"use client";    

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";
import { useCurrency } from "@/hooks/use-currency";
import Link from "next/link";
import { SafeImage } from "@/components/safe-image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BorderBeam } from "antd";
import BannerCarousel from "./banner-carousel";
import { cleanAffiliateUrl } from "@/lib/seo";

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
  promotion_id?: number | null;
  promo_price?: string | null;
}

/** Display price: active promotion uses promo_price, otherwise current_price */
function getDisplayPrice(p: ProductPrice): string {
  if (p.promotion_id != null && p.promo_price != null && p.promo_price !== '') {
    return p.promo_price;
  }
  return p.current_price;
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
  home_image_url: string | null;
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
  mobile_cover_image_key: string | null;
  mobile_cover_image_url: string | null;
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

// Currency list/labels live in src/lib/currencies.ts and are driven globally
// by the useCurrency hook + the header selector.

function getLowestPrice(prices: ProductPrice[]): ProductPrice | null {
  if (!prices || prices.length === 0) return null;
  return prices.reduce((min, p) => parseFloat(getDisplayPrice(p)) < parseFloat(getDisplayPrice(min)) ? p : min, prices[0]);
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
      const priceValues = curPrices.map(p => parseFloat(getDisplayPrice(p)));
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
      const priceValues = curPrices.map(p => parseFloat(getDisplayPrice(p)));
      highestPrice = Math.max(...priceValues);
      lowestPrice = Math.min(...priceValues);
      maxDiff = highestPrice - lowestPrice;
      resultCurrency = firstCurrency;
    }

    return { type: 'save', currency: resultCurrency, amount: maxDiff.toFixed(2) };
  }

  const price = prices[0];
  if (price.original_price) {
    const current = parseFloat(getDisplayPrice(price));
    const original = parseFloat(price.original_price);
    if (original > current) {
      const percent = Math.round((original - current) / original * 100);
      return { type: 'percent', value: percent };
    }
  }

  return null;
}

const PRODUCT_CACHE_PREFIX = 'vd360_product_cache_';

function buildCacheKey(language: string, page: number, category: number | null, currency: string, search: string, sortBy: string): string {
  return `${language}_p${page}_c${category ?? 0}_cur${currency}_s${search}_sort${sortBy}`;
}

function getCachedProducts(key: string): { products: Product[]; totalPages: number; total: number; categories: Category[] } | null {
  try {
    const raw = sessionStorage.getItem(PRODUCT_CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCachedProducts(key: string, data: { products: Product[]; totalPages: number; total: number; categories: Category[] }) {
  try {
    sessionStorage.setItem(PRODUCT_CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    // sessionStorage full, ignore
  }
}

export function ProductListClient({ initialData }: { initialData: InitialData }) {
  const { language } = useLanguage();
  // Global, site-wide currency (mirrors the language selector; persisted in a
  // cookie so SSR blocks use the same currency). Switching reloads the page.
  const { currencyCode: selectedCurrencyCode, currencySymbol: selectedCurrency } = useCurrency();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  // Initial state from server
  const [categories, setCategories] = useState<Category[]>(initialData.categories);
  const [products, setProducts] = useState<Product[]>(initialData.products);
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
    const hasFetchedRef = useRef(false);

  // Fetch data when filters change (after initial load)
  const fetchData = useCallback(async () => {
    const cacheKey = buildCacheKey(language, page, selectedCategory, selectedCurrency, searchQuery, sortBy);
    const cached = getCachedProducts(cacheKey);
    if (cached) {
      setProducts(cached.products);
      setTotalPages(cached.totalPages);
      setTotal(cached.total);
      setCategories(cached.categories);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        language,
        page: page.toString(),
        limit: "20"
      });

      if (selectedCategory) params.set("category_id", selectedCategory.toString());
      if (searchQuery) params.set("search", searchQuery);
      if (selectedCurrency) params.set("currency", selectedCurrency);
      // Home view (no category/search filters): only products the admin marked
      // Featured are listed. Category/search views keep the full catalog for
      // those conditions. When nothing is featured, the grid stays empty.
      if (!selectedCategory && !searchQuery) params.set("featured", "true");
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
        // Auto-fill: if filtered products are less than 20, fetch next page
        let allProducts = json.data.products || [];
        const validProducts = allProducts.filter((p: Product) =>
          p.prices.some((pr: ProductPrice) =>
            !pr.no_quote && (!pr.store || pr.store.is_active) && (pr.currency || '$') === selectedCurrency
          )
        );
        
        // If we have less than 20 valid products and there are more pages, fetch next page
        if (validProducts.length < 20 && page < (json.data.pagination?.totalPages || 1)) {
          const nextPage = page + 1;
          const nextParams = new URLSearchParams(params);
          nextParams.set("page", nextPage.toString());
          const nextRes = await fetch(`/api/products?${nextParams}`);
          const nextJson = await nextRes.json();
          if (nextJson.success) {
            allProducts = [...allProducts, ...(nextJson.data.products || [])];
          }
        }
        
        setProducts(allProducts);
        setTotalPages(json.data.pagination?.totalPages || 1);
        setTotal(json.data.pagination?.total || 0);
        setCachedProducts(cacheKey, {
          products: allProducts,
          totalPages: json.data.pagination?.totalPages || 1,
          total: json.data.pagination?.total || 0,
          categories: json.data.categories || [],
        });
      }

      // Fetch banners and promotions only on first page without filters
      if (page === 1 && !selectedCategory && !searchQuery) {
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

  // Mount effect
  useEffect(() => {
    setMounted(true);
    // If URL page > 1, need to fetch correct data (server only returns page 1)
    if (urlPage > 1) {
      setIsInitialLoad(false);
      hasFetchedRef.current = true;
      fetchData();
    } else {
      // Use initial data on first load, skip fetch. Currency is global and the
      // server already rendered initialData for the visitor's selected currency.
      setIsInitialLoad(false);
      hasFetchedRef.current = true;
    }
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

    // 排序时只取当前选中货币的价格
    const getSortedPrice = (product: Product): number | null => {
      const filtered = product.prices.filter(p => {
        if (p.no_quote) return false;
        if (p.store && !p.store.is_active) return false;
        return (p.currency || '$') === selectedCurrency;
      });
      const lowest = getLowestPrice(filtered);
      return lowest ? parseFloat(getDisplayPrice(lowest)) : null;
    };

    if (sortBy === "price_low") {
      list = [...list].sort((a, b) => {
        const aPrice = getSortedPrice(a);
        const bPrice = getSortedPrice(b);
        return (aPrice ?? Infinity) - (bPrice ?? Infinity);
      });
    } else if (sortBy === "price_high") {
      list = [...list].sort((a, b) => {
        const aPrice = getSortedPrice(a);
        const bPrice = getSortedPrice(b);
        return (bPrice ?? 0) - (aPrice ?? 0);
      });
    }
    return list;
  })();

  // 渲染前过滤掉没有当前货币价格的产品，避免 grid 中 map return null 留下空位。
  const displayProducts = filteredProducts.filter((product) =>
    product.prices.some((p) => {
      if (p.no_quote) return false;
      if (p.store && !p.store.is_active) return false;
      return (p.currency || '$') === selectedCurrency;
    })
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Mobile: Combined Banner + Promotion Carousel */}
      {(banners.length > 0 || (promotions.length > 0 && !selectedCategory && !searchQuery)) && (
        <div className="sm:hidden -mx-4 mb-4 bg-white">
          <MobileCombinedCarousel
            banners={banners}
            promotions={!selectedCategory && !searchQuery ? promotions : []}
            language={language}
          />
        </div>
      )}

      {/* Desktop: Banner Section */}
      {banners.length > 0 && (
        <div className="hidden sm:block mb-8 sm:mt-0">
          <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
            <BannerCarousel banners={banners} language={language} />
          </div>
        </div>
      )}

      {/* Desktop: Promotions Section - Cover Images Grid */}
      {promotions.length > 0 && !selectedCategory && !searchQuery && (
        <div className="hidden sm:block mb-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                      sizes="(max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                </Link>
              );
              })
              .filter(Boolean)
              .slice(0, 3)}
          </div>
        </div>
      )}

      {/* Filter Controls */}
      <div className="mb-6 space-y-3">
        {/* Category */}
        <div className="flex items-center gap-3 overflow-x-auto sm:flex-wrap scrollbar-hide pb-1 sm:pb-0">
          <span className="text-sm font-semibold text-gray-700 flex-shrink-0">{language === "zh" ? "类型" : "Type"}</span>
          <button
            onClick={() => {
              setSelectedCategory(null);
              setPage(1);
              updateUrl({ category: null, page: 1 });
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all flex-shrink-0 ${
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
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all flex-shrink-0 ${
                  selectedCategory === cat.id ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                }`}
              >
                {cat.icon} {ct?.name}
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 overflow-x-auto sm:flex-wrap scrollbar-hide pb-1 sm:pb-0">
          <span className="text-sm font-semibold text-gray-700 flex-shrink-0">{language === "zh" ? "排序" : "Sort By"}</span>
          <button
            onClick={() => { setSortBy("newest"); setPage(1); }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all flex-shrink-0 ${
              sortBy === "newest" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {language === "zh" ? "最新发布" : "Newest"}
          </button>
          <button
            onClick={() => { setSortBy("price_low"); setPage(1); }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all flex-shrink-0 ${
              sortBy === "price_low" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {language === "zh" ? "价格从低到高" : "Price Low To High"}
          </button>
          <button
            onClick={() => { setSortBy("price_high"); setPage(1); }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all flex-shrink-0 ${
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
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
      ) : displayProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 0 00-.707.293l-2.414 2.414a1 0 01-.707.293h-3.172a1 0 01-.707-.293l-2.414-2.414A1 0 006.586 13H4" />
          </svg>
          <p className="mt-4 text-lg text-gray-400">{language === "zh" ? "暂无产品" : "No products found"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5 gap-3 sm:gap-4">
          {displayProducts.map((product, idx) => {
            const t = getTranslation(product.translations, language);

            // 直接按货币筛选价格
            const displayPrices = product.prices.filter(p => {
              if (p.no_quote) return false;
              if (p.store && !p.store.is_active) return false;
              const priceCurrency = p.currency || '$';
              return priceCurrency === selectedCurrency;
            });

            const finalPrices = displayPrices;

            if (finalPrices.length === 0) return null;

            const lowest = getLowestPrice(finalPrices);
            const highestOrig = getHighestOriginal(finalPrices);
            const discountInfo = getDiscountDisplay(finalPrices);
            const sortedPrices = [...finalPrices].sort((a, b) => parseFloat(getDisplayPrice(a)) - parseFloat(getDisplayPrice(b)));

            return (
              <BorderBeam
                key={product.id}
                color={[
                  { color: "#2f54eb", percent: 0 },
                  { color: "#722ed1", percent: 44 },
                  { color: "#ff85c0", percent: 100 },
                ]}
                size={120}
                duration={4}
                lineWidth={1}
                outset={0}
                className="animate-fade-in-up"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
              <div
                className="group hover-border-beam rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-all relative"
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
                  {(product.home_image_url || product.image_url) && (
                    <SafeImage
                      src={product.home_image_url || product.image_url_small || product.image_url}
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
                  {product.is_featured && (selectedCategory || searchQuery) && (
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
                      {lowest?.currency || '$'}{lowest ? getDisplayPrice(lowest) : "—"}
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
                            {price.currency || '$'}{getDisplayPrice(price)}
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
                              {price.currency || '$'}{getDisplayPrice(price)}
                            </span>
                            <a
                              href={cleanAffiliateUrl(price.product_url)}
                              target="_blank"
                              rel="sponsored nofollow noopener noreferrer"
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
              </BorderBeam>
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
    return translation?.cover_image_url || translation?.cover_image_key || translation?.mobile_cover_image_url || translation?.mobile_cover_image_key;
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
    const coverImage = translation?.mobile_cover_image_url || translation?.mobile_cover_image_key || translation?.cover_image_url || translation?.cover_image_key;
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
          const coverImage = translation?.mobile_cover_image_url || translation?.mobile_cover_image_key || translation?.cover_image_url || translation?.cover_image_key;
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

// Combined Mobile Carousel for Banners and Promotions
interface MobileCarouselItem {
  id: string;
  type: 'banner' | 'promotion';
  imageUrl: string;
  linkUrl: string;
  alt: string;
}

function MobileCombinedCarousel({
  banners,
  promotions,
  language,
}: {
  banners: Banner[];
  promotions: Promotion[];
  language: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build combined list: banners first, then promotions
  const items: MobileCarouselItem[] = [];

  // Add banners (use mobile image)
  banners.forEach((banner) => {
    const mobileImg = banner.translated_mobile_image_url || banner.mobile_image_url;
    if (mobileImg) {
      items.push({
        id: `banner-${banner.id}`,
        type: 'banner',
        imageUrl: mobileImg,
        linkUrl: banner.link_url || '#',
        alt: banner.title || 'Banner',
      });
    }
  });

  // Add promotions (use mobile cover image)
  promotions.forEach((promotion) => {
    const translation = promotion.translations?.[0] || promotion.promotion_translations?.[0];
    const mobileCover = translation?.mobile_cover_image_url || translation?.mobile_cover_image_key || translation?.cover_image_url || translation?.cover_image_key;
    if (mobileCover) {
      items.push({
        id: `promo-${promotion.id}`,
        type: 'promotion',
        imageUrl: mobileCover,
        linkUrl: `/promotion/${promotion.slug}`,
        alt: translation?.name || promotion.slug,
      });
    }
  });

  const startAutoPlay = useCallback(() => {
    if (items.length <= 1) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 4000);
  }, [items.length]);

  const stopAutoPlay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (items.length > 1) {
      startAutoPlay();
    }
    return stopAutoPlay;
  }, [items.length, startAutoPlay, stopAutoPlay]);

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

    if (isLeftSwipe && currentIndex < items.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
    startAutoPlay();
  };

  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    return (
      <Link href={item.linkUrl} className="block w-full">
        <div className="relative w-full aspect-[750/422]">
          <SafeImage
            src={item.imageUrl}
            alt={item.alt}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        </div>
      </Link>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides */}
      <div
        className="flex transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.linkUrl}
            className="block w-full flex-shrink-0"
          >
            <div className="relative w-full aspect-[750/422]">
              <SafeImage
                src={item.imageUrl}
                alt={item.alt}
                fill
                className="object-cover"
                sizes="100vw"
              />
            </div>
          </Link>
        ))}
      </div>

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
        {items.map((_, index) => (
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



