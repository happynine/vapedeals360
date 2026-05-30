'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SafeImage } from '@/components/safe-image';
import { useLanguage } from '@/hooks/use-language';

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

interface CategoryTranslation {
  id: number;
  category_id: number;
  language: string;
  name: string;
}

interface Category {
  id: number;
  slug: string;
  translations: CategoryTranslation[];
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
  category?: Category | null;
}

function getTranslation<T extends { language: string }>(translations: T[] | undefined | null, language: string): T | undefined {
  if (!translations || translations.length === 0) return undefined;
  return translations.find((t) => t.language === language) || translations.find((t) => t.language === 'en') || translations[0];
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
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
}

export default function ProductDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { language } = useLanguage();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [siteSettings, setSiteSettings] = useState<{ site_name: string; logo_url: string | null } | null>(null);
  const [socialLinks, setSocialLinks] = useState<Array<{ id: number; platform: string; url: string; icon: string | null }>>([]);

  useEffect(() => {
    fetch('/api/site-settings').then(r => r.json()).then(d => { if (d.success) setSiteSettings(d.data); }).catch(() => {});
    fetch('/api/social-links').then(r => r.json()).then(d => { if (d.success) setSocialLinks(d.data); }).catch(() => {});
  }, []);

  useEffect(() => {
    async function fetchProduct() {
      setLoading(true);
      try {
        const res = await fetch(`/api/products/${slug}?language=${language}`);
        const json = await res.json();
        if (json.success) {
          setProduct(json.data);
          setSelectedImage(json.data.image_url);
        }
      } catch (err) {
        console.error('Failed to fetch product:', err);
      } finally {
        setLoading(false);
      }
    }
    if (slug) fetchProduct();
  }, [slug, language]);

  // Track page view
  useEffect(() => {
    const sessionId = sessionStorage.getItem('vp_session_id') || (() => {
      const id = 's_' + Math.random().toString(36).substring(2, 12);
      sessionStorage.setItem('vp_session_id', id);
      return id;
    })();
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'page_view', session_id: sessionId, page: `/product/${slug}`, referrer: document.referrer }),
    }).catch(() => {});
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-50 bg-[#0a0a0e] border-b border-gray-800">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-700 text-white font-bold text-lg">{(siteSettings?.site_name || 'V').charAt(0)}</div>
                <span className="text-xl font-bold tracking-tight text-white">siteSettings?.site_name || '\u00A0'</span>
              </Link>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-8 bg-white flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="aspect-square rounded-2xl bg-gray-100 animate-pulse" />
            <div className="space-y-4">
              <div className="h-8 w-3/4 rounded bg-gray-100 animate-pulse" />
              <div className="h-12 w-1/3 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-50 bg-[#0a0a0e] border-b border-gray-800">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-700 text-white font-bold text-lg">{(siteSettings?.site_name || 'V').charAt(0)}</div>
                <span className="text-xl font-bold tracking-tight text-white">siteSettings?.site_name || '\u00A0'</span>
              </Link>
            </div>
          </div>
        </header>
        <div className="min-h-[50vh] flex items-center justify-center bg-white flex-1">
          <div className="text-center">
            <p className="text-lg text-gray-400">{language === 'zh' ? '产品未找到' : 'Product not found'}</p>
            <Link href="/" className="mt-4 inline-block text-purple-700 hover:underline">{language === 'zh' ? '返回首页' : 'Back to Home'}</Link>
          </div>
        </div>
      </div>
    );
  }

  const t = getTranslation(product.translations, language);
  const catT = product.category ? getTranslation(product.category.translations, language) : null;
  let features: string[] = [];
  try { features = t?.features ? (typeof t.features === 'string' ? JSON.parse(t.features) : t.features) : []; } catch { features = []; }
  let specsEntries: [string, string][] = [];
  try {
    const raw = t?.specs ? (typeof t.specs === 'string' ? JSON.parse(t.specs) : t.specs) : null;
    if (Array.isArray(raw)) {
      specsEntries = raw.map((item: string) => { const colonIdx = item.indexOf(':'); return colonIdx > 0 ? [item.substring(0, colonIdx).trim(), item.substring(colonIdx + 1).trim()] : [item, '']; });
    } else if (raw && typeof raw === 'object') {
      specsEntries = Object.entries(raw as Record<string, string>);
    }
  } catch { specsEntries = []; }
  const sortedPrices = [...product.prices].sort((a, b) => parseFloat(a.current_price) - parseFloat(b.current_price));
  const lowestPrice = sortedPrices[0];
  const highestOriginal = product.prices
    .filter((p) => p.original_price)
    .reduce((max, p) => parseFloat(p.original_price!) > max ? parseFloat(p.original_price!) : max, 0);

  const discount = highestOriginal > 0 && lowestPrice
    ? Math.round(((highestOriginal - parseFloat(lowestPrice.current_price)) / highestOriginal) * 100)
    : null;

  // Parse additional images
  const allImages: string[] = [];
  if (product.image_url) allImages.push(product.image_url);
  if (product.images) {
    try {
      const extra = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
      if (Array.isArray(extra)) allImages.push(...extra);
    } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="vape-deals" />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 bg-white flex-1">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-900 transition-colors">{language === 'zh' ? '首页' : 'Home'}</Link>
          {catT && <><span className="hidden sm:inline">/</span><span className="hidden sm:inline hover:text-gray-900">{catT.name}</span></>}
          <span>/</span>
          <span className="text-gray-900 truncate">{t?.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Image Gallery */}
          <div>
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-50 border border-gray-200">
              {selectedImage && (
              <SafeImage src={selectedImage} alt={t?.name || ''} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" priority />
              )}
              {discount && (
                <div className="absolute top-4 left-4 z-10 rounded-xl bg-red-500 px-4 py-1.5 text-lg font-bold text-white animate-pulse-deal">
                  -{discount}%
                </div>
              )}
            </div>
            {allImages.length > 1 && (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(img)}
                    className={`relative h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${selectedImage === img ? 'border-purple-700' : 'border-gray-200 hover:border-purple-400'}`}
                  >
                    <SafeImage src={img} alt="" fill className="object-cover" sizes="64px" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Product Info */}
          <div>
            {/* Category badge */}
            {catT && (
              <span className="inline-block rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700 mb-3">
                {catT.name}
              </span>
            )}

            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              {t?.name}
            </h1>

            {/* Price Summary */}
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-emerald-600 tabular-nums">
                  ${lowestPrice?.current_price || '—'}
                </span>
                {highestOriginal > 0 && (
                  <span className="text-lg text-gray-400 line-through tabular-nums">
                    ${highestOriginal.toFixed(2)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {language === 'zh' ? '最低价，来自' : 'Lowest price from'} {sortedPrices.length} {language === 'zh' ? '家商城' : 'stores'}
              </p>
              {discount && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-600">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                  {language === 'zh' ? `省 $${(highestOriginal - parseFloat(lowestPrice?.current_price || '0')).toFixed(2)}` : `Save $${(highestOriginal - parseFloat(lowestPrice?.current_price || '0')).toFixed(2)}`}
                </div>
              )}
            </div>

            {/* Description */}
            {t?.description && (
              <div className="mt-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  {language === 'zh' ? '产品描述' : 'Description'}
                </h2>
                <p className="text-sm text-gray-600 leading-relaxed">{t.description}</p>
              </div>
            )}

            {/* Features */}
            {features.length > 0 && (
              <div className="mt-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  {language === 'zh' ? '产品亮点' : 'Key Features'}
                </h2>
                <ul className="space-y-2">
                  {features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                      <svg className="h-4 w-4 flex-shrink-0 mt-0.5 text-cyan-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Price Comparison Table */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <svg className="h-6 w-6 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            {language === 'zh' ? '价格对比' : 'Price Comparison'}
          </h2>
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            {/* Table Header - hidden on mobile, shown on md+ */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <div className="col-span-4">{language === 'zh' ? '商城' : 'Store'}</div>
              <div className="col-span-2 text-center">{language === 'zh' ? '现价' : 'Price'}</div>
              <div className="col-span-2 text-center">{language === 'zh' ? '原价' : 'Original'}</div>
              <div className="col-span-2 text-center">{language === 'zh' ? '折扣' : 'Discount'}</div>
              <div className="col-span-2 text-center">{language === 'zh' ? '操作' : 'Action'}</div>
            </div>
            {/* Table Rows */}
            {sortedPrices.map((price, idx) => {
              const st = price.store ? getTranslation(price.store.translations, language) : null;
              const isLowest = idx === 0;
              const priceDiscount = price.discount_percent || (price.original_price ? Math.round(((parseFloat(price.original_price) - parseFloat(price.current_price)) / parseFloat(price.original_price)) * 100) : null);

              return (
                <div
                  key={price.id}
                  className={`border-t border-gray-100 transition-colors hover:bg-gray-50 ${isLowest ? 'bg-emerald-50/50' : ''}`}
                >
                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-4 items-center">
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-50 overflow-hidden">
                        {price.store?.logo_url ? (
                          <img src={price.store.logo_url.startsWith('http') ? price.store.logo_url : `/api/image?key=${encodeURIComponent(price.store.logo_url)}`} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-sm font-bold text-purple-700">{st?.name?.charAt(0) || '?'}</span>
                        )}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900">{st?.name || 'Store'}</span>
                        {isLowest && (
                          <span className="ml-2 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            {language === 'zh' ? '最低价' : 'LOWEST'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className={`text-lg font-bold tabular-nums ${isLowest ? 'text-emerald-600' : 'text-gray-900'}`}>
                        ${price.current_price}
                      </span>
                    </div>
                    <div className="col-span-2 text-center">
                      {price.original_price ? (
                        <span className="text-sm text-gray-400 line-through tabular-nums">${price.original_price}</span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </div>
                    <div className="col-span-2 text-center">
                      {priceDiscount ? (
                        <span className="inline-block rounded-md bg-red-50 px-2 py-0.5 text-sm font-semibold text-red-600">
                          -{priceDiscount}%
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </div>
                    <div className="col-span-2 text-center">
                      <a
                        href={price.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          fetch('/api/track', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type: 'visit_store', session_id: sessionStorage.getItem('vp_session_id') || '', product_id: product.id, store_id: price.store_id }),
                          }).catch(() => {});
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800 transition-all hover:scale-105"
                      >
                        {language === 'zh' ? '前往购买' : 'Visit Store'}
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                    </div>
                  </div>
                  {/* Mobile card */}
                  <div className="md:hidden px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-50 overflow-hidden">
                          {price.store?.logo_url ? (
                            <img src={price.store.logo_url.startsWith('http') ? price.store.logo_url : `/api/image?key=${encodeURIComponent(price.store.logo_url)}`} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-sm font-bold text-purple-700">{st?.name?.charAt(0) || '?'}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 truncate">{st?.name || 'Store'}</span>
                            {isLowest && (
                              <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 flex-shrink-0">
                                {language === 'zh' ? '最低价' : 'LOWEST'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-lg font-bold tabular-nums ${isLowest ? 'text-emerald-600' : 'text-gray-900'}`}>
                          ${price.current_price}
                        </span>
                        {priceDiscount ? (
                          <span className="inline-block rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-600">
                            -{priceDiscount}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      {price.original_price ? (
                        <span className="text-xs text-gray-400 line-through tabular-nums">${price.original_price}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                      <a
                        href={price.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          fetch('/api/track', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type: 'visit_store', session_id: sessionStorage.getItem('vp_session_id') || '', product_id: product.id, store_id: price.store_id }),
                          }).catch(() => {});
                        }}
                        className="inline-flex items-center gap-1 rounded-xl bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-800 transition-all"
                      >
                        {language === 'zh' ? '前往购买' : 'Visit Store'}
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Specs Table */}
        {specsEntries.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <svg className="h-6 w-6 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              {language === 'zh' ? '规格参数' : 'Specifications'}
            </h2>
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              {specsEntries.map(([key, value], idx) => (
                <div
                  key={key}
                  className={`flex items-center px-5 py-3 ${idx > 0 ? 'border-t border-gray-100' : ''} ${idx % 2 === 0 ? 'bg-gray-50' : ''}`}
                >
                  <span className="w-40 flex-shrink-0 text-sm font-medium text-gray-500">{key}</span>
                  <span className="text-sm text-gray-900">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back to Home */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            {language === 'zh' ? '返回首页' : 'Back to All Deals'}
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0a0a0e] border-t border-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="hidden sm:block">
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Navigation</h4>
              <div className="flex flex-col gap-2">
                <Link href="/" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Vape Deals</Link>
                <Link href="/best-vapes" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Best Vapes</Link>
                <Link href="/news" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">News</Link>
              </div>
            </div>
            <div className="hidden sm:block">
              <h4 className="text-sm font-semibold text-gray-300 mb-4">About</h4>
              <div className="flex flex-col gap-2">
                <Link href="/about" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">About Us</Link>
                <Link href="/contact" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Contact Us</Link>
                <Link href="/privacy" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">Privacy Policy</Link>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                {siteSettings?.logo_url ? (
                  <img
                    src={siteSettings.logo_url.startsWith('http') ? siteSettings.logo_url : `/api/image?key=${encodeURIComponent(siteSettings.logo_url)}`}
                    alt={siteSettings?.site_name || ''}
                    className="h-7 w-7 rounded-md object-contain"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-700 text-white font-bold text-sm">{(siteSettings?.site_name || 'V').charAt(0)}</div>
                )}
                <span className="text-sm font-semibold text-gray-300">{siteSettings?.site_name || ''}</span>
              </div>
              <a href="mailto:info@vapedeals360.com" className="text-sm text-gray-500 hover:text-purple-400 transition-colors block mb-4">Email: info@vapedeals360.com</a>
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
        <div className="border-t border-gray-800 mt-8 pt-4 text-center text-xs text-gray-500">
          ©Vapedeals360.com All Rights Reserved.
        </div>
      </footer>
      <div className="bg-[#0a0a0e] border-t border-gray-800 py-8 px-4 max-w-7xl mx-auto">
        <div className="space-y-4 text-xs text-gray-400">
          <div>
            <h4 className="text-gray-400 font-semibold mb-1">FDA Disclaimer</h4>
            <p>The products available on this website are intended for adults of legal smoking age only. These products have not been evaluated by the Food and Drug Administration. These products are not intended to diagnose, treat, cure, or prevent any disease. The FDA does not evaluate the safety or efficacy of these products. Keep out of reach of children and pets. Not for sale to minors. Not for use by women who are pregnant or breastfeeding. Not for use by persons with or at risk of heart disease, high blood pressure, diabetes, or taking medicine for depression or asthma. If you experience any side effects or possible side effects, stop using the product immediately and consult a physician.</p>
          </div>
          <div>
            <h4 className="text-gray-400 font-semibold mb-1">NIXODINE Disclaimer</h4>
            <p>Nixodine products contain nicotine, which is a highly addictive substance. Nicotine use during pregnancy can harm the fetus. Nixodine products are not smoking cessation products and have not been tested as such. Nixodine products are intended for use by adults of legal smoking age, not by minors, women who are pregnant or breastfeeding, or persons with or at risk of heart disease, high blood pressure, diabetes, or taking medicine for depression or asthma. If you experience any side effects or possible side effects, stop using the product immediately and consult a physician.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
