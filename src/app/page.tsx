"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { SafeImage } from "@/components/safe-image";
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
    link_url: string | null;
    title: string | null;
    subtitle: string | null;
}

interface SiteSettings {
    site_name: string;
    logo_url: string | null;
}

interface SocialLink {
    id: number;
    platform: string;
    url: string;
    icon: string | null;
}

function getSocialIcon(platform: string) {
    const p = platform.toLowerCase();
    if (p.includes("facebook")) return <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>;
    if (p.includes("twitter") || p.includes("x.com")) return <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
    if (p.includes("instagram")) return <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>;
    if (p.includes("youtube")) return <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>;
    if (p.includes("tiktok")) return <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>;
    if (p.includes("reddit")) return <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 000-.462.327.327 0 00-.231-.094.327.327 0 00-.231.094c-.57.57-1.86.77-2.499.77-.638 0-1.929-.2-2.499-.77a.326.326 0 00-.231-.095z"/></svg>;
    if (p.includes("telegram")) return <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>;
    if (p.includes("discord")) return <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>;
    if (p.includes("pinterest")) return <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z"/></svg>;
    if (p.includes("linkedin")) return <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>;
    // Generic link icon for unknown platforms
    return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
}

export default function HomePage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
    const [language, setLanguage] = useState<string>("en");
    const [langOpen, setLangOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [siteSettings, setSiteSettings] = useState<SiteSettings>({ site_name: "VapeDeal", logo_url: null });
    const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
    const [sortBy, setSortBy] = useState<"newest" | "price_low" | "price_high">("newest");

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

            const siteRes = await fetch(`/api/site-settings?language=${language}`);
            const siteJson = await siteRes.json();
            if (siteJson.success && siteJson.data) {
                setSiteSettings({ site_name: siteJson.data.site_name || "VapeDeal", logo_url: siteJson.data.logo_url || null });
            }

            const socialRes = await fetch('/api/social-links');
            const socialJson = await socialRes.json();
            if (socialJson.success && socialJson.data) {
                setSocialLinks(socialJson.data);
            }
        } catch (err) {
            console.error("Failed to fetch data:", err);
        } finally {
            setLoading(false);
        }
    }, [language, page, selectedCategory]);

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
            {}
            <header
                className="sticky top-0 z-50 bg-[#0a0a0e] border-b border-gray-800">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        <Link href="/" className="flex items-center gap-2">
                            {siteSettings.logo_url ? <img
                                src={siteSettings.logo_url.startsWith("http") ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`}
                                alt={siteSettings.site_name}
                                className="h-9 w-9 rounded-lg object-contain" /> : <div
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">{siteSettings.site_name.charAt(0)}</div>}
                            <span className="text-xl font-bold tracking-tight text-white">{siteSettings.site_name}</span>
                        </Link>
                        <div className="flex items-center gap-3">
                            {/* Search */}
                            <div className="relative w-48 sm:w-64">
                                <svg
                                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"><path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                <input
                                    type="text"
                                    placeholder={language === "zh" ? "搜索产品..." : "Search products..."}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full rounded-xl border border-gray-700 bg-[#1a1a24] pl-10 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" />
                            </div>
                            {/* Language Dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setLangOpen(!langOpen)}
                                    className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#1a1a24] px-3 py-2 text-sm font-medium text-gray-300 hover:bg-[#2a2a3a] transition-colors">
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                                    {language === "en" ? "English" : "中文"}
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                {langOpen && <>
                                    <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                                    <div className="absolute right-0 mt-2 z-50 w-36 rounded-lg border border-gray-700 bg-[#1a1a24] shadow-lg overflow-hidden">
                                        <button onClick={() => { setLanguage("en"); setLangOpen(false); }} className={`w-full px-4 py-2.5 text-sm text-left hover:bg-[#2a2a3a] transition-colors flex items-center gap-2 ${language === "en" ? "text-primary font-semibold" : "text-gray-300"}`}>
                                            🇺🇸 English {language === "en" && <svg className="h-4 w-4 ml-auto" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                        </button>
                                        <button onClick={() => { setLanguage("zh"); setLangOpen(false); }} className={`w-full px-4 py-2.5 text-sm text-left hover:bg-[#2a2a3a] transition-colors flex items-center gap-2 ${language === "zh" ? "text-primary font-semibold" : "text-gray-300"}`}>
                                            🇨🇳 中文 {language === "zh" && <svg className="h-4 w-4 ml-auto" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                        </button>
                                    </div>
                                </>}
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 bg-white flex-1">
                {/* Tab Navigation: Vape Deals / Best Vapes / News */}
                <div className="mb-6">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="pb-3 text-sm font-semibold text-purple-700">
                            {language === "zh" ? "Vape Deals" : "Vape Deals"}
                        </Link>
                        <Link href="/best-vapes" className="pb-3 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
                            Best Vapes
                        </Link>
                        <Link href="/news" className="pb-3 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
                            News
                        </Link>
                    </div>
                </div>
                {}
                {banners.length > 0 && <div className="mb-8">
                    <div
                        className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
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
                <div className="mb-6">
                    <div className="flex flex-wrap gap-2">
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
                </div>
                {}
                <div className="mb-4 flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-500">
                        {language === "zh" ? `共 ${total} 个产品` : `${total} products found`}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSortBy("newest")}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${sortBy === "newest" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                            {language === "zh" ? "最新发布" : "Newest"}
                        </button>
                        <button
                            onClick={() => setSortBy("price_low")}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${sortBy === "price_low" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                            {language === "zh" ? "价格从低到高" : "Price: Low → High"}
                        </button>
                        <button
                            onClick={() => setSortBy("price_high")}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${sortBy === "price_high" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                            {language === "zh" ? "价格从高到低" : "Price: High → Low"}
                        </button>
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
            </main>
            {/* FDA & NIXODINE Disclaimer - Left aligned with logo */}
            <div className="bg-[#0a0a0e] border-t border-gray-800 py-8 px-4">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8 space-y-6">
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
            {/* Footer */}
            <footer className="bg-[#0a0a0e] border-t border-gray-800 mt-0">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                        {/* Navigation Column */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-300 mb-4">Navigation</h4>
                            <div className="flex flex-col gap-2">
                                <Link href="/" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Vape Deals</Link>
                                <Link href="/best-vapes" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Best Vapes</Link>
                                <Link href="/news" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">News</Link>
                            </div>
                        </div>
                        {/* About Column */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-300 mb-4">About</h4>
                            <div className="flex flex-col gap-2">
                                <Link href="/about" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">About Us</Link>
                                <Link href="/contact" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Contact Us</Link>
                                <Link href="/privacy" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Privacy Policy</Link>
                            </div>
                        </div>
                        {/* Contact Column */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                {siteSettings.logo_url ? <img
                                    src={siteSettings.logo_url.startsWith("http") ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`}
                                    alt={siteSettings.site_name}
                                    className="h-7 w-7 rounded-md object-contain" /> : <div
                                    className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-700 text-white font-bold text-sm">{siteSettings.site_name.charAt(0)}</div>}
                                <span className="text-sm font-semibold text-gray-300">{siteSettings.site_name}</span>
                            </div>
                            <a href="mailto:info@vapedeals360.com" className="text-sm text-gray-500 hover:text-purple-400 transition-colors block mb-4">
                                Email: info@vapedeals360.com
                            </a>
                            {socialLinks.length > 0 && (
                                <div className="flex items-center gap-3">
                                    {socialLinks.map((link: SocialLink) => (
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

    const content = <div
        className="relative w-full overflow-hidden bg-gradient-to-r from-purple-900 via-purple-800 to-cyan-900"
        style={{ aspectRatio: '1200/343' }}
        onMouseEnter={() => {
            if (hoverRef.current) clearTimeout(hoverRef.current);
            setHovered(true);
        }}
        onMouseLeave={() => {
            hoverRef.current = setTimeout(() => setHovered(false), 200);
        }}>
        {banner.image_url ? <div className="relative w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={banner.image_url.startsWith('http') || banner.image_url.startsWith('/') ? banner.image_url : `/api/image?key=${encodeURIComponent(banner.image_url)}`}
                alt={banner.title || "Banner"}
                className="w-full h-full object-fill block"
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