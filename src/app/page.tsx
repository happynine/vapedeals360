"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";
import Link from "next/link";
import { SafeImage } from "@/components/safe-image";
import { SiteHeader } from "@/components/site-header";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
    images: string | null;
    is_active: boolean;
    is_featured: boolean;
    created_at: string;
    updated_at: string | null;
    translations: ProductTranslation[];
    prices: ProductPrice[];
}

function getTranslation<T extends {
    language: string;
}>(translations: T[] | undefined | null, language: string): T | undefined {
    if (!translations || translations.length === 0)
        return undefined;

    return translations.find(t => t.language === language) || translations.find(t => t.language === "en") || translations[0];
}

// Region to currencies mapping (some regions support multiple currencies)
const REGION_CURRENCIES: Record<string, { code: string; symbol: string }[]> = {
    'USA': [{ code: 'USD', symbol: '$' }],
    'UK': [{ code: 'USD', symbol: '$' }, { code: 'GBP', symbol: '£' }],
    'Canada': [{ code: 'USD', symbol: '$' }],
    'Russia': [{ code: 'RUB', symbol: '₽' }],
    'Japan': [{ code: 'JPY', symbol: '¥' }],
    'Europe': [{ code: 'EUR', symbol: '€' }],
    'Global': [{ code: 'USD', symbol: '$' }],
};

// Region to default currency symbol (for backward compatibility)
const REGION_CURRENCY_MAP: Record<string, string> = {
    'USA': '$',
    'UK': '$',
    'Canada': '$',
    'Russia': '₽',
    'Japan': '¥',
    'Europe': '€',
    'Global': '$',
};

function getLowestPrice(prices: ProductPrice[]): ProductPrice | null {
    if (!prices || prices.length === 0)
        return null;

    return prices.reduce(
        (min, p) => parseFloat(p.current_price) < parseFloat(min.current_price) ? p : min,
        prices[0]
    );
}

function getHighestOriginal(prices: ProductPrice[]): string | null {
    if (!prices || prices.length === 0)
        return null;

    const originals = prices.filter(p => p.original_price).map(p => parseFloat(p.original_price!));
    return originals.length > 0 ? Math.max(...originals).toFixed(2) : null;
}

/**
 * 计算折扣显示
 * - 2个及以上商城: 比较同一币种的最高现价与最低现价，返回 { type: 'save', currency, amount }
 * - 1个商城: 比较现价与原价，返回 { type: 'percent', value }
 */
function getDiscountDisplay(prices: ProductPrice[]): { type: 'save'; currency: string; amount: string } | { type: 'percent'; value: number } | null {
    if (!prices || prices.length === 0) return null;

    // 2个及以上商城：比较同币种的最高现价与最低现价
    if (prices.length >= 2) {
        // 按币种分组
        const byCurrency: Record<string, ProductPrice[]> = {};
        prices.forEach(p => {
            const cur = p.currency || '$';
            if (!byCurrency[cur]) byCurrency[cur] = [];
            byCurrency[cur].push(p);
        });

        // 找出有最大价差的币种
        let maxDiff = 0;
        let resultCurrency = '$';
        let highestPrice = 0;
        let lowestPrice = 0;

        for (const [cur, curPrices] of Object.entries(byCurrency)) {
            if (curPrices.length < 2) continue; // 需要至少2个同币种价格
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

        // 如果没有同币种的多个价格，尝试跨币种比较（用第一个币种）
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

    // 1个商城：比较现价与原价
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

interface Banner {
    id: number;
    image_url: string | null;
    mobile_image_url: string | null;
    link_url: string | null;
    title: string | null;
    subtitle: string | null;
}

interface SiteSettings {
    site_name: string;
    logo_url: string | null;
}

export default function HomePage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
    const { language } = useLanguage();
    const searchParams = useSearchParams();
    const urlSearch = searchParams.get('search') || '';
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchQuery, setSearchQuery] = useState(urlSearch);
    const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [sortBy, setSortBy] = useState<"newest" | "price_low" | "price_high">("newest");
    const [salesRegion, setSalesRegion] = useState<string>("USA");
    const [selectedCurrency, setSelectedCurrency] = useState<string>("$");

    const fetchData = useCallback(async () => {
        setLoading(true);

        try {
            const params = new URLSearchParams({
                language,
                page: page.toString(),
                limit: "20"
            });

            if (selectedCategory) {
                params.set("category_id", selectedCategory.toString());
            }

            if (searchQuery) {
                params.set("search", searchQuery);
            }

            if (salesRegion) {
                params.set("sales_region", salesRegion);
            }

            // Pass sort params to API for server-side sorting
            if (sortBy === "newest") {
                params.set("sort_by", "id");
                params.set("sort_order", "desc");
            } else if (sortBy === "price_low") {
                params.set("sort_by", "id");
                params.set("sort_order", "desc"); // price sort done client-side
            } else if (sortBy === "price_high") {
                params.set("sort_by", "id");
                params.set("sort_order", "desc"); // price sort done client-side
            }

            const res = await fetch(`/api/products?${params}`);
            const json = await res.json();

            if (json.success) {
                setCategories(json.data.categories || []);
                setProducts(json.data.products || []);
                setTotalPages(json.data.pagination?.totalPages || 1);
                setTotal(json.data.pagination?.total || 0);
            }

            const featRes = await fetch(`/api/products?featured=true&limit=5&language=${language}`);
            const featJson = await featRes.json();

            if (featJson.success) {
                setFeaturedProducts(featJson.data.products || []);
            }

            const bannerRes = await fetch(`/api/banners?language=${language}`);
            const bannerJson = await bannerRes.json();

            if (bannerJson.success) {
                setBanners(bannerJson.data || []);
            }

        } catch (err) {
            console.error("Failed to fetch data:", err);
        } finally {
            setLoading(false);
        }
    }, [language, page, selectedCategory, salesRegion, searchQuery, sortBy]);

    // Sync search query from URL
    useEffect(() => {
        if (urlSearch !== searchQuery) {
            setSearchQuery(urlSearch);
        }
    }, [urlSearch]);

    // Load sales region and currency from localStorage on mount
    useEffect(() => {
        const savedRegion = localStorage.getItem('salesRegion');
        const savedCurrency = localStorage.getItem('selectedCurrency');
        if (savedRegion && savedRegion !== salesRegion) {
            setSalesRegion(savedRegion);
        }
        if (savedCurrency && savedCurrency !== selectedCurrency) {
            setSelectedCurrency(savedCurrency);
        }
    }, []);

    // Auto-select default currency when region changes
    useEffect(() => {
        const currencies = REGION_CURRENCIES[salesRegion] || [{ code: 'USD', symbol: '$' }];
        const savedCurrency = localStorage.getItem('selectedCurrency');
        
        // Check if saved currency is valid for the current region
        if (savedCurrency && currencies.some(c => c.symbol === savedCurrency)) {
            setSelectedCurrency(savedCurrency);
        } else {
            // Default to first currency (USD if available, otherwise first in list)
            const defaultCurrency = currencies.find(c => c.code === 'USD') || currencies[0];
            setSelectedCurrency(defaultCurrency.symbol);
        }
    }, [salesRegion]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

    const filteredProducts = (() => {
        let list = products;

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
        // "newest" sort is handled server-side (sort_by=id, sort_order=desc)

        return list;
    })();

    return (
        <div className="min-h-screen flex flex-col">
            <SiteHeader activeTab="vape-deals" />
            <main className="flex-1 bg-white">
                <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 pt-0 sm:pt-6 pb-6">
                {}
                {banners.length > 0 && <div className="mb-8 -mx-4 sm:mx-0 sm:mt-0">
                    <div
                        className="relative overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border sm:border-gray-200 bg-gray-50">
                        <BannerCarousel banners={banners} language={language} />
                    </div>
                </div>}
                {}
                {featuredProducts.length > 0 && page === 1 && !selectedCategory && !searchQuery && <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <span
                            className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 animate-pulse-deal">
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path
                                    d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" /></svg>
                            {language === "zh" ? "今日特价" : "HOT DEALS"}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {featuredProducts.slice(0, 3).map(product => {
                            const t = getTranslation(product.translations, language);
                            const lowest = getLowestPrice(product.prices);
                            const highestOrig = getHighestOriginal(product.prices);
                            const discountInfo = getDiscountDisplay(product.prices);

                            return (
                                <Link
                                    key={product.id}
                                    href={`/product/${product.slug}`}
                                    className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-purple-300 transition-all">
                                    {discountInfo && (
                                        <div className="absolute top-3 right-3 z-10 rounded-lg bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                                            {discountInfo.type === 'percent' 
                                                ? `-${discountInfo.value}%` 
                                                : `Save ${discountInfo.currency}${discountInfo.amount}`}
                                        </div>
                                    )}
                                    <div className="flex gap-4">
                                        <div
                                            className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                                            {product.image_url && <SafeImage
                                                src={product.image_url}
                                                alt={t?.name || ""}
                                                fill
                                                className="object-cover"
                                                sizes="96px" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3
                                                className="text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-purple-700 transition-colors">{t?.name}</h3>
                                            <div className="mt-2 flex items-baseline gap-2">
                                                <span className="text-xl font-bold text-emerald-600 tabular-nums">{lowest?.currency || '$'}{lowest?.current_price || "—"}</span>
                                                {highestOrig && product.prices.length >= 2 && <span className="text-xs text-emerald-600 font-medium ml-0.5">{language === "zh" ? "最低价" : "Lowest"}</span>}
                                                {highestOrig && product.prices.length < 2 && <span className="text-sm text-gray-400 line-through tabular-nums">${highestOrig}</span>}
                                            </div>
                                            <p className="mt-1 text-xs text-gray-500">
                                                {product.prices.length} {language === "zh" ? "家商城比价" : "stores compared"}
                                            </p>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>}
                {}
                <div className="mb-6 space-y-3">
                    {/* Row 1: Region */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700">{language === "zh" ? "地区" : "Region"}</span>
                        {(["USA", "UK", "Canada", "Russia", "Japan", "Europe", "Global"] as const).map((region) => {
                            const regionLabels: Record<string, string> = {
                                "Global": language === "zh" ? "全球" : "Global",
                                "USA": language === "zh" ? "美国" : "USA",
                                "Canada": language === "zh" ? "加拿大" : "Canada",
                                "UK": language === "zh" ? "英国" : "UK",
                                "Russia": language === "zh" ? "俄罗斯" : "Russia",
                                "Japan": language === "zh" ? "日本" : "Japan",
                                "Europe": language === "zh" ? "欧洲" : "Europe",
                            };
                            return (
                            <button
                                key={region}
                                onClick={() => { 
                                    setSalesRegion(region); 
                                    setPage(1);
                                    if (typeof window !== 'undefined') {
                                        localStorage.setItem('salesRegion', region);
                                    }
                                }}
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${salesRegion === region ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                                {regionLabels[region]}
                            </button>
                            );
                        })}
                    </div>
                    {/* Row 1.5: Currency */}
                    {(() => {
                        const currencies = REGION_CURRENCIES[salesRegion] || [{ code: 'USD', symbol: '$' }];
                        if (currencies.length <= 1) return null; // Only show if multiple currencies available
                        
                        return (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-gray-700">{language === "zh" ? "货币" : "Currency"}</span>
                                {currencies.map((currency) => {
                                    const currencyLabels: Record<string, string> = {
                                        'USD': `USD (${currency.symbol})`,
                                        'GBP': `GBP (${currency.symbol})`,
                                        'EUR': `EUR (${currency.symbol})`,
                                        'JPY': `JPY (${currency.symbol})`,
                                        'RUB': `RUB (${currency.symbol})`,
                                    };
                                    return (
                                        <button
                                            key={currency.code}
                                            onClick={() => {
                                                setSelectedCurrency(currency.symbol);
                                                setPage(1);
                                                if (typeof window !== 'undefined') {
                                                    localStorage.setItem('selectedCurrency', currency.symbol);
                                                }
                                            }}
                                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${selectedCurrency === currency.symbol ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                                            {currencyLabels[currency.code] || `${currency.code} (${currency.symbol})`}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })()}
                    {/* Row 2: Type */}
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold text-gray-700">{language === "zh" ? "类型" : "Type"}</span>
                        <button
                            onClick={() => {
                                setSelectedCategory(null);
                                setPage(1);
                            }}
                            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${selectedCategory === null ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200"}`}>
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
                                    }}
                                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${selectedCategory === cat.id ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200"}`}>
                                    {cat.icon} {ct?.name}
                                </button>
                            );
                        })}
                    </div>
                    {/* Row 3: Sort By */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700">{language === "zh" ? "排序" : "Sort By"}</span>
                        <button
                            onClick={() => { setSortBy("newest"); setPage(1); }}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${sortBy === "newest" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                            {language === "zh" ? "最新发布" : "Newest"}
                        </button>
                        <button
                            onClick={() => { setSortBy("price_low"); setPage(1); }}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${sortBy === "price_low" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                            {language === "zh" ? "价格从低到高" : "Price Low To High"}
                        </button>
                        <button
                            onClick={() => { setSortBy("price_high"); setPage(1); }}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${sortBy === "price_high" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                            {language === "zh" ? "价格从高到低" : "Price High To Low"}
                        </button>
                    </div>
                </div>
                {searchQuery && !loading && (
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-lg font-semibold text-gray-900">
                            {language === "zh" ? `搜索"${searchQuery}"的结果` : `Search results for "${searchQuery}"`}
                        </span>
                        <span className="text-sm text-gray-500">({total} {language === "zh" ? "个产品" : "products"})</span>
                        <button
                            onClick={() => { setSearchQuery(""); setPage(1); }}
                            className="ml-auto text-sm text-purple-600 hover:text-purple-800 font-medium"
                        >
                            {language === "zh" ? "清除搜索" : "Clear search"}
                        </button>
                    </div>
                )}
                {loading ? <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({
                        length: 8
                    }).map((_, i) => <div
                        key={i}
                        className="rounded-2xl border border-gray-200 bg-white p-4 animate-pulse">
                        <div className="h-48 w-full rounded-xl bg-gray-100" />
                        <div className="mt-4 h-4 w-3/4 rounded bg-gray-100" />
                        <div className="mt-2 h-6 w-1/2 rounded bg-gray-100" />
                        <div className="mt-3 space-y-2">
                            <div className="h-8 w-full rounded bg-gray-100" />
                            <div className="h-8 w-full rounded bg-gray-100" />
                        </div>
                    </div>)}
                </div> : filteredProducts.length === 0 ? <div className="flex flex-col items-center justify-center py-20 text-center">
                    <svg
                        className="h-16 w-16 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"><path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1}
                            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                    <p className="mt-4 text-lg text-gray-400">{language === "zh" ? "暂无产品" : "No products found"}</p>
                </div> : <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredProducts.map((product, idx) => {
                        const t = getTranslation(product.translations, language);
                        // 第一步：按region过滤价格
                        const regionFilteredPrices = product.prices.filter(p => {
                            if (p.region && p.region !== salesRegion && p.region !== 'Global') return false;
                            return true;
                        });
                        
                        // 第二步：按currency过滤（严格匹配）
                        const displayPrices = regionFilteredPrices.filter(p => {
                            const priceCurrency = p.currency || '$';
                            return priceCurrency === selectedCurrency;
                        });
                        
                        const lowest = getLowestPrice(displayPrices);
                        const highestOrig = getHighestOriginal(displayPrices);
                        const discountInfo = getDiscountDisplay(displayPrices);

                        const sortedPrices = [...displayPrices].sort((a, b) => parseFloat(a.current_price) - parseFloat(b.current_price));

                        return (
                            <div
                                key={product.id}
                                className="group rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-purple-300 transition-all animate-fade-in-up"
                                style={{
                                    animationDelay: `${idx * 50}ms`
                                }}>
                                {}
                                <Link
                                    href={`/product/${product.slug}`}
                                    className="block relative aspect-square bg-gray-50 overflow-hidden"
                                    onClick={() => {
                                        const sid = sessionStorage.getItem("vp_session_id") || "";
                                        fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "product_click", session_id: sid, product_id: product.id }) }).catch(() => {});
                                    }}>
                                    {product.image_url && <SafeImage
                                        src={product.image_url}
                                        alt={t?.name || ""}
                                        fill
                                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" />}
                                    {discountInfo && (
                                        <div className="absolute top-2 left-2 z-10 rounded-lg bg-red-500 px-2 py-0.5 text-xs font-bold text-white animate-pulse-deal">
                                            {discountInfo.type === 'percent' 
                                                ? `-${discountInfo.value}%` 
                                                : `Save ${discountInfo.currency}${discountInfo.amount}`}
                                        </div>
                                    )}
                                    {product.is_featured && <div
                                        className="absolute top-2 right-2 z-10 rounded-lg bg-purple-700 px-2 py-0.5 text-xs font-semibold text-white">
                                        {language === "zh" ? "精选" : "Featured"}
                                    </div>}
                                </Link>
                                {}
                                <div className="p-4">
                                    <Link href={`/product/${product.slug}`}>
                                        <h3
                                            className="text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-purple-700 transition-colors leading-snug">
                                            {t?.name}
                                        </h3>
                                    </Link>
                                    {}
                                    <div className="mt-2 flex items-baseline gap-2">
                                        <span className="text-2xl font-bold text-emerald-600 tabular-nums">{lowest?.currency || '$'}{lowest?.current_price || "—"}
                                        </span>
                                        {highestOrig && product.prices.length >= 2 && <span className="text-xs text-emerald-600 font-medium ml-0.5">{language === "zh" ? "最低价" : "Lowest"}</span>}
                                        {highestOrig && product.prices.length < 2 && <span className="text-sm text-gray-400 line-through tabular-nums">${highestOrig}
                                        </span>}
                                    </div>
                                    {}
                                    <div className="mt-3 space-y-1.5">
                                        {sortedPrices.slice(0, 3).map(price => {
                                            const st = price.store ? getTranslation(price.store.translations, language) : null;

                                            return (
                                                <div
                                                    key={price.id}
                                                    className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <div
                                                            className="h-5 w-5 flex-shrink-0 rounded bg-purple-50 flex items-center justify-center overflow-hidden">
                                                            {price.store?.logo_url ? <img
                                                                src={price.store.logo_url.startsWith("http") ? price.store.logo_url : `/api/image?key=${encodeURIComponent(price.store.logo_url)}`}
                                                                alt=""
                                                                className="w-full h-full object-contain" /> : <span className="text-[10px] font-bold text-purple-600">{st?.name?.charAt(0) || "?"}</span>}
                                                        </div>
                                                        <span className="text-xs text-gray-500 truncate">{st?.name || "Store"}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <span className="text-xs font-semibold text-emerald-600 tabular-nums">{price.currency || '$'}{price.current_price}</span>
                                                        <a
                                                            href={price.product_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                const sid = sessionStorage.getItem("vp_session_id") || "";
                                                                fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "buy_click", session_id: sid, product_id: price.product_id, store_id: price.store_id }) }).catch(() => {});
                                                            }}
                                                            className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 hover:bg-purple-700 hover:text-white transition-all">
                                                            {language === "zh" ? "购买" : "Buy"}
                                                        </a>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {sortedPrices.length > 3 && <Link
                                            href={`/product/${product.slug}`}
                                            className="block text-center text-xs text-purple-700 hover:underline py-1">
                                            {language === "zh" ? `查看全部 ${sortedPrices.length} 家商城` : `View all ${sortedPrices.length} stores`}
                                        </Link>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>}
                {}
                {totalPages > 1 && <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    total={total}
                    onPageChange={setPage}
                    language={language}
                />}
                </div>
            </main>
        </div>
    );
}

function Pagination({
    currentPage,
    totalPages,
    total,
    onPageChange,
    language,
}: {
    currentPage: number;
    totalPages: number;
    total: number;
    onPageChange: (page: number) => void;
    language: string;
}) {
    const [jumpValue, setJumpValue] = useState("");

    const getPageNumbers = (): (number | "...")[] => {
        if (totalPages <= 7) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }
        const pages: (number | "...")[] = [];
        pages.push(1);
        if (currentPage > 4) {
            pages.push("...");
        }
        const start = Math.max(2, currentPage - 2);
        const end = Math.min(totalPages - 1, currentPage + 2);
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        if (currentPage < totalPages - 3) {
            pages.push("...");
        }
        pages.push(totalPages);
        return pages;
    };

    const handleJump = () => {
        const num = parseInt(jumpValue, 10);
        if (!isNaN(num) && num >= 1 && num <= totalPages) {
            onPageChange(num);
        }
        setJumpValue("");
    };

    const handleJumpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleJump();
        }
    };

    return (
        <div className="mt-8 flex items-center justify-center gap-1 select-none">
            {/* Previous button */}
            <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="flex items-center justify-center w-8 h-8 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-600 transition-colors text-xs"
                aria-label="Previous"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            </button>

            {/* Page numbers */}
            {getPageNumbers().map((p, idx) =>
                p === "..." ? (
                    <span key={`ellipsis-${idx}`} className="flex items-center justify-center w-8 h-8 text-gray-400 text-sm">
                        ...
                    </span>
                ) : (
                    <button
                        key={p}
                        onClick={() => onPageChange(p)}
                        className={`flex items-center justify-center w-8 h-8 rounded text-sm font-medium transition-colors ${
                            currentPage === p
                                ? "bg-purple-600 text-white border border-purple-600"
                                : "border border-gray-200 bg-white text-gray-700 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300"
                        }`}
                    >
                        {p}
                    </button>
                )
            )}

            {/* Next button */}
            <button
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center justify-center w-8 h-8 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-600 transition-colors text-xs"
                aria-label="Next"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </button>

            {/* Jump to */}
            <div className="flex items-center gap-1.5 ml-3 text-sm text-gray-500">
                <span>{language === "zh" ? "跳至" : "Go to"}</span>
                <input
                    type="text"
                    value={jumpValue}
                    onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={handleJumpKeyDown}
                    className="w-10 h-8 rounded border border-gray-200 bg-white text-center text-sm text-gray-700 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-colors"
                />
                <span>{language === "zh" ? "页" : ""}</span>
            </div>

            {/* Total count */}
            <span className="ml-3 text-sm text-gray-400">
                {language === "zh" ? `共 ${total} 条` : `${total} items`}
            </span>
        </div>
    );
}

function BannerCarousel(
    {
        banners,
        language
    }: {
        banners: Banner[];
        language: string;
    }
) {
    const [current, setCurrent] = useState(0);
    const [hovered, setHovered] = useState(false);
    const hoverRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (banners.length <= 1)
            return;

        const timer = setInterval(() => {
            setCurrent(prev => (prev + 1) % banners.length);
        }, 5000);

        return () => clearInterval(timer);
    }, [banners.length]);

    if (banners.length === 0)
        return null;

    const banner = banners[current];
    const mobileImgUrl = banner.mobile_image_url;

    const content = <div
        className="relative w-full overflow-hidden bg-gradient-to-r from-purple-900 via-purple-800 to-cyan-900 sm:aspect-[1200/343]"
        onMouseEnter={() => {
            if (hoverRef.current) clearTimeout(hoverRef.current);
            setHovered(true);
        }}
        onMouseLeave={() => {
            hoverRef.current = setTimeout(() => setHovered(false), 200);
        }}>
        {banner.image_url ? <div className="relative w-full sm:absolute sm:inset-0 sm:w-full sm:h-full">
            {/* Mobile banner image */}
            {mobileImgUrl && <img
                src={mobileImgUrl.startsWith('http') || mobileImgUrl.startsWith('/') ? mobileImgUrl : `/api/image?key=${encodeURIComponent(mobileImgUrl)}`}
                alt={banner.title || "Banner"}
                className="w-full h-auto block sm:hidden"
                loading={current === 0 ? 'eager' : 'lazy'} />}
            {/* Web banner image */}
            <img
                src={banner.image_url.startsWith('http') || banner.image_url.startsWith('/') ? banner.image_url : `/api/image?key=${encodeURIComponent(banner.image_url)}`}
                alt={banner.title || "Banner"}
                className={`w-full h-auto block sm:absolute sm:inset-0 sm:w-full sm:h-full sm:object-fill ${mobileImgUrl ? 'hidden sm:block sm:absolute' : ''}`}
                loading={current === 0 ? 'eager' : 'lazy'} />
        </div> : null}
        {}
        {(banner.title || banner.subtitle) && <div
            className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />}
        {(banner.title || banner.subtitle) && <div
            className="absolute inset-0 flex flex-col justify-center px-6 sm:px-10 lg:px-16">
            {banner.title && <h2
                className="text-lg sm:text-2xl lg:text-3xl font-bold text-white drop-shadow-lg max-w-lg">
                {banner.title}
            </h2>}
            {banner.subtitle && <p
                className="mt-1 sm:mt-2 text-xs sm:text-sm lg:text-base text-white/80 drop-shadow max-w-md">
                {banner.subtitle}
            </p>}
        </div>}
        {}
        {banners.length > 1 && hovered && <>
            <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrent(prev => (prev - 1 + banners.length) % banners.length); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-all"
                aria-label="Previous">
                <ChevronLeft className="w-5 h-5" />
            </button>
            <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrent(prev => (prev + 1) % banners.length); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-all"
                aria-label="Next">
                <ChevronRight className="w-5 h-5" />
            </button>
        </>}
        {}
        {banners.length > 1 && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {banners.map((_, idx) => <button
                key={idx}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrent(idx); }}
                className={`h-1.5 rounded-full transition-all ${idx === current ? "w-6 bg-white" : "w-1.5 bg-white/50"}`} />)}
        </div>}
    </div>;

    if (banner.link_url) {
        return (
            <a
                href={banner.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                onClick={() => {
                    const sid = sessionStorage.getItem("vp_session_id") || "";
                    fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "banner_click", session_id: sid, banner_id: banner.id }) }).catch(() => {});
                }}>
                {content}
            </a>
        );
    }

    return content;
}