"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useSiteSettings } from "@/components/site-settings-provider";
import { useSocialLinks } from "@/hooks/use-social-links";
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
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const { siteSettings: contextSiteSettings } = useSiteSettings();
    const siteSettings = contextSiteSettings || { site_name: "", logo_url: null as string | null };
    const { socialLinks, getSocialIcon } = useSocialLinks();
    const [sortBy, setSortBy] = useState<"newest" | "price_low" | "price_high">("newest");
    const [salesRegion, setSalesRegion] = useState<string>("不限地区");

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

            if (salesRegion && salesRegion !== "不限地区") {
                params.set("sales_region", salesRegion);
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
    }, [language, page, selectedCategory, salesRegion]);

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
        let list = searchQuery ? products.filter(p => {
            const t = getTranslation(p.translations, language);
            return t?.name?.toLowerCase().includes(searchQuery.toLowerCase());
        }) : products;

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
        } else {
            list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }

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

                            const discount = lowest?.original_price ? Math.round(
                                (parseFloat(lowest.original_price) - parseFloat(lowest.current_price)) / parseFloat(lowest.original_price) * 100
                            ) : null;

                            return (
                                <Link
                                    key={product.id}
                                    href={`/product/${product.slug}`}
                                    className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-purple-300 transition-all">
                                    {discount && <div
                                        className="absolute top-3 right-3 z-10 rounded-lg bg-red-500 px-2 py-0.5 text-xs font-bold text-white">-{discount}%
                                                              </div>}
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
                                                <span className="text-xl font-bold text-emerald-600 tabular-nums">${lowest?.current_price || "—"}</span>
                                                {highestOrig && <span className="text-sm text-gray-400 line-through tabular-nums">${highestOrig}</span>}
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
                    {/* Row 1: Type */}
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
                    {/* Row 2: Sort By */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700">{language === "zh" ? "排序" : "Sort By"}</span>
                        <button
                            onClick={() => setSortBy("newest")}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${sortBy === "newest" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                            {language === "zh" ? "最新发布" : "Newest"}
                        </button>
                        <button
                            onClick={() => setSortBy("price_low")}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${sortBy === "price_low" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                            {language === "zh" ? "价格从低到高" : "Price Low To High"}
                        </button>
                        <button
                            onClick={() => setSortBy("price_high")}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${sortBy === "price_high" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                            {language === "zh" ? "价格从高到低" : "Price High To Low"}
                        </button>
                    </div>
                    {/* Row 3: Region */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700">{language === "zh" ? "地区" : "Region"}</span>
                        {(["不限地区", "全球", "美国", "加拿大", "英国", "俄罗斯"] as const).map((region) => {
                            const regionLabels: Record<string, string> = {
                                "不限地区": language === "zh" ? "不限地区" : "All Regions",
                                "全球": language === "zh" ? "全球" : "Global",
                                "美国": language === "zh" ? "美国" : "USA",
                                "加拿大": language === "zh" ? "加拿大" : "Canada",
                                "英国": language === "zh" ? "英国" : "UK",
                                "俄罗斯": language === "zh" ? "俄罗斯" : "Russia",
                            };
                            return (
                            <button
                                key={region}
                                onClick={() => setSalesRegion(region)}
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${salesRegion === region ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                                {regionLabels[region]}
                            </button>
                            );
                        })}
                    </div>
                </div>
                {}
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
                        const lowest = getLowestPrice(product.prices);
                        const highestOrig = getHighestOriginal(product.prices);

                        const discount = lowest?.original_price ? Math.round(
                            (parseFloat(lowest.original_price) - parseFloat(lowest.current_price)) / parseFloat(lowest.original_price) * 100
                        ) : null;

                        const sortedPrices = [...product.prices].sort((a, b) => parseFloat(a.current_price) - parseFloat(b.current_price));

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
                                    {discount && <div
                                        className="absolute top-2 left-2 z-10 rounded-lg bg-red-500 px-2 py-0.5 text-xs font-bold text-white animate-pulse-deal">-{discount}%
                                                              </div>}
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
                                        <span className="text-2xl font-bold text-emerald-600 tabular-nums">${lowest?.current_price || "—"}
                                        </span>
                                        {highestOrig && <span className="text-sm text-gray-400 line-through tabular-nums">${highestOrig}
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
                                                        <span className="text-xs font-semibold text-emerald-600 tabular-nums">${price.current_price}</span>
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
                {totalPages > 1 && <div className="mt-8 flex items-center justify-center gap-2">
                    <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        {language === "zh" ? "上一页" : "Previous"}
                    </button>
                    <span className="px-4 py-2 text-sm text-gray-500">
                        {page}/ {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        {language === "zh" ? "下一页" : "Next"}
                    </button>
                </div>}
                </div>
            </main>
            {/* Footer */}
            <footer className="bg-[#0a0a0e] border-t border-gray-800 mt-0">
                <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-10">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                        {/* Navigation Column - hidden on mobile (available in hamburger menu) */}
                        <div className="hidden sm:block">
                            <h4 className="text-sm font-semibold text-gray-300 mb-4">Navigation</h4>
                            <div className="flex flex-col gap-2">
                                <Link href="/" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Vape Deals</Link>
                                <Link href="/best-vapes" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Best Vapes</Link>
                                <Link href="/news" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">News</Link>
                            </div>
                        </div>
                        {/* About Column - hidden on mobile (available in hamburger menu) */}
                        <div className="hidden sm:block">
                            <h4 className="text-sm font-semibold text-gray-300 mb-4">About</h4>
                            <div className="flex flex-col gap-2">
                                <Link href="/about" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">About Us</Link>
                                <Link href="/contact" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Contact Us</Link>
                                <Link href="/privacy" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Privacy Policy</Link>
                                <Link href="/disclaimer" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Disclaimer</Link>
                <Link href="/affiliate-disclosure" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Affiliate Disclosure</Link>
                <Link href="/terms-of-service" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Terms of Service</Link>
                            </div>
                        </div>
                        {/* Contact Column */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                {siteSettings.logo_url ? <img
                                    src={siteSettings.logo_url.startsWith("http") ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`}
                                    alt={siteSettings.site_name}
                                    className="h-7 w-7 rounded-md object-contain" /> : <div
                                    className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-700 text-white font-bold text-sm">{siteSettings.site_name ? siteSettings.site_name.charAt(0) : '\u00A0'}</div>}
                                <span className="text-sm font-semibold text-gray-300">{siteSettings.site_name || '\u00A0'}</span>
                            </div>
                            <a href="mailto:info@vapedeals360.com" className="text-sm text-gray-500 hover:text-purple-400 transition-colors block mb-4">
                                Email: info@vapedeals360.com
                            </a>
                            {socialLinks.length > 0 && (
                                <div className="flex items-center gap-3">
                                    {socialLinks.map((link) => (
                                        <a
                                            key={link.id}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-gray-500 hover:text-gray-300 transition-colors"
                                            title={link.platform}
                                        >
                                            {getSocialIcon(link.platform)}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </footer>
            {/* FDA & NIXODINE Disclaimer - Left aligned with logo */}
            <div className="bg-[#0a0a0e] border-t border-gray-800 py-8">
                <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 space-y-6">
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 mb-2">FDA Disclaimer</h3>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            The statements made regarding these products have not been evaluated by the Food and Drug Administration. The efficacy of these products has not been confirmed by FDA-approved research. These products are not intended to diagnose, treat, cure or prevent any disease. All information presented here is not meant as a substitute for or alternative to information from health care practitioners. Please consult your health care professional about potential interactions or other possible complications before using any product. The Federal Food, Drug, and Cosmetic Act requires this notice.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 mb-2">NIXODINE DISCLAIMER</h3>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Nixodine products contain nicotine which is a highly addictive substance. This product is intended for use by adults over the age of 21. It is not intended for use by women who are pregnant or breastfeeding, or persons with or at risk of heart disease, high blood pressure, diabetes, or taking medicine for depression or asthma. Keep out of reach of children and pets. Ingestion of the non-vaporized concentrated ingredients in the liquid can be poisonous. If you are a smoker, quitting smoking is the best thing you can do to improve your health.
                        </p>
                    </div>
                </div>
            </div>
            {/* Copyright */}
            <div className="bg-[#0a0a0e] border-t border-gray-800 py-6 text-center text-xs text-gray-500">
                ©Vapedeals360.com All Rights Reserved.
            </div>
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