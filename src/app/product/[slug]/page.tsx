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

export default function ProductDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { language } = useLanguage();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [salesRegion, setSalesRegion] = useState<string>('USA');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('$');

  // Load sales region and currency from localStorage
  useEffect(() => {
    const savedRegion = localStorage.getItem('salesRegion');
    if (savedRegion) {
      setSalesRegion(savedRegion);
      // Load currency for this specific region
      const regionCurrency = localStorage.getItem(`selectedCurrency_${savedRegion}`);
      if (regionCurrency) {
        setSelectedCurrency(regionCurrency);
      }
    }
  }, []);

  useEffect(() => {
    async function fetchProduct() {
      setLoading(true);
      try {
        // Get region from localStorage (set by homepage)
        let region = 'USA';
        if (typeof window !== 'undefined') {
          region = localStorage.getItem('salesRegion') || 'USA';
        }
        const res = await fetch(`/api/products/${slug}?language=${language}&region=${region}`);
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
        <SiteHeader activeTab="" />
        <div className="mx-auto max-w-[1380px] px-4 py-8 bg-white flex-1">
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
        <SiteHeader activeTab="" />
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

  // Filter prices by sales region and selected currency
  const filteredPrices = product.prices.filter((p) => {
    // Exclude prices marked as "no quote"
    if (p.no_quote) return false;
    // Filter by region
    if (p.region && p.region !== salesRegion && p.region !== 'Global') return false;
    // Filter by currency
    const priceCurrency = p.currency || '$';
    return priceCurrency === selectedCurrency;
  });
  const sortedPrices = [...filteredPrices].sort((a, b) => parseFloat(a.current_price) - parseFloat(b.current_price));
  const lowestPrice = sortedPrices[0];

  // Calculate discount based on number of stores
  let discount: number | null = null;
  let discountAmount: number | null = null;
  let discountLabel: string | null = null;
  let isMultiStoreDiscount = false;

  if (filteredPrices.length >= 2 && lowestPrice) {
    // Multi-store: compare highest and lowest current price within same currency
    const lowestCurrency = lowestPrice.currency;
    const sameCurrencyPrices = filteredPrices.filter(p => p.currency === lowestCurrency);
    if (sameCurrencyPrices.length >= 2) {
      const highestCurrent = Math.max(...sameCurrencyPrices.map(p => parseFloat(p.current_price)));
      const lowestCurrent = parseFloat(lowestPrice.current_price);
      discountAmount = highestCurrent - lowestCurrent;
      if (discountAmount > 0) {
        discount = Math.round((discountAmount / highestCurrent) * 100);
        discountLabel = `Save ${lowestCurrency || '$'}${discountAmount.toFixed(2)}`;
        isMultiStoreDiscount = true;
      }
    }
  } else if (filteredPrices.length === 1 && lowestPrice) {
    // Single store: compare with original price
    const priceRecord = filteredPrices[0];
    if (priceRecord.original_price) {
      const originalPrice = parseFloat(priceRecord.original_price);
      const currentPrice = parseFloat(priceRecord.current_price);
      if (originalPrice > currentPrice) {
        discountAmount = originalPrice - currentPrice;
        discount = Math.round((discountAmount / originalPrice) * 100);
        discountLabel = `Save ${lowestPrice.currency || '$'}${discountAmount.toFixed(2)}`;
      }
    }
  }

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

      <main className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-8 bg-white flex-1">
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
              {(discount ?? 0) > 0 && (
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
                  {lowestPrice?.currency || '$'}{lowestPrice?.current_price || '—'}
                </span>
                {filteredPrices.length >= 2 && (
                  <span className="text-xs text-emerald-600 font-medium ml-0.5">
                    {language === 'zh' ? '最低价' : 'Lowest'}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {language === 'zh' ? '最低价，来自' : 'Lowest price from'} {sortedPrices.length} {language === 'zh' ? '家商城' : 'stores'}
              </p>
              {(discount ?? 0) > 0 && discountLabel && (
                <div className="mt-2">
                  <div className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-600">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                    {discountLabel}
                  </div>
                  {isMultiStoreDiscount ? (
                    <p className="mt-1 text-sm text-gray-500">
                      {language === 'zh' 
                        ? `相对于${filteredPrices.length}家商城中的最高现价` 
                        : `Compared to the highest price from ${filteredPrices.length} stores`}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-gray-500">
                      {language === 'zh' 
                        ? '相对于原价' 
                        : 'Compared to the original price'}
                    </p>
                  )}
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
            <div className="hidden md:grid grid-cols-14 gap-4 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr' }}>
              <div>{language === 'zh' ? '商城' : 'Store'}</div>
              <div className="text-center">{language === 'zh' ? '现价' : 'Price'}</div>
              <div className="text-center">{language === 'zh' ? '原价' : 'Original'}</div>
              <div className="text-center">{language === 'zh' ? '折扣' : 'Discount'}</div>
              <div className="text-center">{language === 'zh' ? '类型' : 'Type'}</div>
              <div className="text-center">{language === 'zh' ? '操作' : 'Action'}</div>
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
                  <div className="hidden md:grid gap-4 px-5 py-4 items-center" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr' }}>
                    <div className="flex items-center gap-3">
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
                    <div className="text-center">
                      <span className={`text-lg font-bold tabular-nums ${isLowest ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {price.currency || '$'}{price.current_price}
                      </span>
                    </div>
                    <div className="text-center">
                      {price.original_price ? (
                        <span className="text-sm text-gray-400 line-through tabular-nums">{price.currency || '$'}{price.original_price}</span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </div>
                    <div className="text-center">
                      {priceDiscount ? (
                        <span className="inline-block rounded-md bg-red-50 px-2 py-0.5 text-sm font-semibold text-red-600">
                          -{priceDiscount}%
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </div>
                    <div className="text-center">
                      <span className="text-sm text-gray-400">
                        {(price.store?.store_type || 'store') === 'official' ? (language === 'zh' ? '官网' : 'Official') : (language === 'zh' ? '商城' : 'Store')}
                      </span>
                    </div>
                    <div className="text-center">
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
                        {(price.store?.store_type || 'store') === 'official' ? (language === 'zh' ? '前往官网' : 'Visit Official') : (language === 'zh' ? '前往购买' : 'Visit Store')}
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
                          {price.currency || '$'}{price.current_price}
                        </span>
                        {priceDiscount ? (
                          <span className="inline-block rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-600">
                            -{priceDiscount}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {price.original_price ? (
                          <span className="text-xs text-gray-400 line-through tabular-nums">{price.currency || '$'}{price.original_price}</span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                        <span className="text-sm text-gray-400">
                          {(price.store?.store_type || 'store') === 'official' ? (language === 'zh' ? '官网' : 'Official') : (language === 'zh' ? '商城' : 'Store')}
                        </span>
                      </div>
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
                        {(price.store?.store_type || 'store') === 'official' ? (language === 'zh' ? '前往官网' : 'Visit Official') : (language === 'zh' ? '前往购买' : 'Visit Store')}
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

    </div>
  );
}
