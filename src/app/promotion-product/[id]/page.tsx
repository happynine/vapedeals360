'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import SiteFooter from '@/components/site-footer';
import CookieConsent from '@/components/cookie-consent';
import { CountdownDisplay } from '@/components/countdown-display';
import { SafeImage } from '@/components/safe-image';
import { useLanguage } from '@/hooks/use-language';

interface StoreInfo {
  id: number;
  name: string;
  icon_url: string | null;
  logo_url: string | null;
  store_url: string | null;
  translations?: { id: number; name: string; language: string }[];
}

interface PromotionProductPrice {
  id: number;
  store_id: number | null;
  region: string | null;
  current_price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  currency: string | null;
  product_url: string | null;
  no_quote: boolean | null;
  store_type: 'promotion' | 'standard';
  time_type: 'permanent' | 'time_range' | 'countdown';
  start_time: string | null;
  end_time: string | null;
  countdown_action: 'close' | 'original_price';
  store?: StoreInfo;
}

interface PromotionProductTranslation {
  id: number;
  name: string | null;
  description: string | null;
  language: string;
}

interface PromotionProduct {
  id: number;
  promotion_id: number | null;
  slug: string | null;
  category_id: number | null;
  image_key: string | null;
  image_url: string | null;
  is_active: boolean | null;
  is_featured: boolean | null;
  notes: string | null;
  promotion_product_translations: PromotionProductTranslation[];
  store_prices: PromotionProductPrice[];
}

interface Promotion {
  id: number;
  slug: string;
  title: string | null;
  time_type: string | null;
  translations: {
    id: number;
    name: string | null;
    cover_image_url: string | null;
    language: string;
  }[];
}

interface ApiResponse {
  product: PromotionProduct;
  promotion: Promotion | null;
}

export default function PromotionProductPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const productId = params.id as string;
  const promotionSlug = searchParams.get('promotion');

  const { language } = useLanguage();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRegion, setActiveRegion] = useState<string>('USA');
  const [allRegions, setAllRegions] = useState<string[]>([]);

  const fetchProduct = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/promotion-products/${productId}?promotion=${promotionSlug || ''}`);
      if (!response.ok) {
        throw new Error('Failed to fetch product');
      }
      const result = await response.json();
      setData(result);

      // Extract unique regions from prices
      const regions = new Set<string>();
      (result.product?.store_prices || []).forEach((p: PromotionProductPrice) => {
        if (p.region) regions.add(p.region);
      });
      if (regions.size > 0) {
        setAllRegions(Array.from(regions));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [productId, promotionSlug]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <SiteHeader />
        <main className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="h-96 bg-gray-200 rounded-xl"></div>
              <div className="space-y-4">
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                <div className="h-6 bg-gray-200 rounded w-1/2"></div>
                <div className="h-10 bg-gray-200 rounded w-1/3"></div>
                <div className="h-32 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </main>
        <SiteFooter />
        <CookieConsent />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-white">
        <SiteHeader />
        <main className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {language === 'zh' ? '产品不存在' : 'Product Not Found'}
            </h1>
            <p className="text-gray-600 mb-6">
              {language === 'zh' ? '该促销产品可能已结束或不存在' : 'This promotion product may have ended or does not exist'}
            </p>
            <Link href="/" className="inline-flex items-center px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700">
              {language === 'zh' ? '返回首页' : 'Back to Home'}
            </Link>
          </div>
        </main>
        <SiteFooter />
        <CookieConsent />
      </div>
    );
  }

  const { product, promotion } = data;
  const translation = product.promotion_product_translations?.find(t => t.language === language) || product.promotion_product_translations?.[0];
  const promotionTranslation = promotion?.translations?.find(t => t.language === language) || promotion?.translations?.[0];

  // Filter and sort prices - only show promotion store prices, filter by region
  const filteredPrices = (product.store_prices || [])
    .filter(p => p.store_type === 'promotion' && p.store_id && p.current_price && !p.no_quote)
    .filter(p => {
      // Filter out prices where countdown has ended with 'close' action
      if (p.time_type !== 'permanent' && p.end_time && p.countdown_action === 'close') {
        return new Date(p.end_time).getTime() > Date.now();
      }
      return true;
    })
    .filter(p => {
      // Filter by active region
      if (!p.region || p.region === 'Global') return true;
      return p.region === activeRegion;
    });

  const sortedPrices = [...filteredPrices].sort((a, b) => (a.current_price || 0) - (b.current_price || 0));
  const lowestPrice = sortedPrices[0];

  // Get store display name (use translation if available)
  const getStoreName = (price: PromotionProductPrice): string => {
    if (price.store?.translations) {
      const storeTrans = price.store.translations.find(t => t.language === language);
      if (storeTrans?.name) return storeTrans.name;
    }
    return price.store?.name || '';
  };

  // Get store logo
  const getStoreLogo = (price: PromotionProductPrice): string | null => {
    return price.store?.logo_url || price.store?.icon_url || null;
  };

  // Parse description into features list
  const description = translation?.description || '';
  const sentences = description.split(/[.!?]\s+/).filter(s => s.trim().length > 10);
  const features = sentences.slice(0, 6);

  // Extract specs from description
  const extractSpecs = (desc: string): { label: string; value: string }[] => {
    const specs: { label: string; value: string }[] = [];
    const patterns: [RegExp, string][] = [
      [/(\d[\d,]+\s*puffs)/i, 'Puffs'],
      [/(\d+\s*mAh)/i, 'Battery'],
      [/(\d+\.?\d*\s*%)\s*nicotine/i, 'Nicotine'],
      [/(\d+\s*-\s*\d+\s*watts?)/i, 'Output'],
      [/(\d+\.?\d*\s*mL)\s*e-?juice/i, 'E-Juice'],
      [/USB-C/i, 'Charging'],
    ];
    for (const [regex, label] of patterns) {
      const match = desc.match(regex);
      if (match) {
        specs.push({ label, value: label === 'Charging' ? 'USB-C' : match[1] });
      }
    }
    return specs;
  };
  const specs = extractSpecs(description);

  // Currency symbol
  const getCurrencySymbol = (currency: string | null): string => {
    if (!currency || currency === 'USD') return '$';
    if (currency === 'EUR') return '€';
    if (currency === 'GBP') return '£';
    if (currency === 'CAD') return 'C$';
    if (currency === 'JPY') return '¥';
    return currency;
  };

  const currencySymbol = getCurrencySymbol(lowestPrice?.currency || 'USD');

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb Navigation */}
        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/" className="hover:text-purple-600 transition-colors">
            {language === 'zh' ? '首页' : 'Home'}
          </Link>
          <span className="mx-2">/</span>
          {promotionSlug && promotion ? (
            <>
              <Link href={`/promotion/${promotionSlug}`} className="hover:text-purple-600 transition-colors">
                {promotionTranslation?.name || promotion.title || promotion.slug}
              </Link>
              <span className="mx-2">/</span>
            </>
          ) : null}
          <span className="text-gray-900 font-medium">{translation?.name || product.slug}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Product Image */}
          <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border border-gray-200">
            <SafeImage
              src={product.image_key || product.image_url}
              alt={translation?.name || product.slug || 'Product'}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            {/* Promotion badge on image */}
            {promotion && (
              <div className="absolute top-3 left-3 bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-md">
                {language === 'zh' ? '特惠活动' : 'HOT DEAL'}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-5">
            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {translation?.name || product.slug || 'Unnamed Product'}
            </h1>

            {/* Countdown Display */}
            {promotion?.time_type && promotion.time_type !== 'permanent' && sortedPrices[0]?.end_time && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold text-red-700">
                    {language === 'zh' ? '限时优惠' : 'Limited Time Offer'}
                  </span>
                </div>
                <CountdownDisplay endTime={sortedPrices[0].end_time!} />
              </div>
            )}

            {/* Lowest Price */}
            {lowestPrice && (
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-green-600 tabular-nums">
                  {currencySymbol}{lowestPrice.current_price?.toFixed(2)}
                </span>
                {lowestPrice.original_price && lowestPrice.original_price > lowestPrice.current_price! && (
                  <div className="flex items-center gap-2">
                    <span className="text-lg text-gray-400 line-through tabular-nums">
                      {currencySymbol}{lowestPrice.original_price.toFixed(2)}
                    </span>
                    {lowestPrice.discount_percent && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-semibold text-red-600">
                        -{lowestPrice.discount_percent}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            {description && (
              <div className="text-gray-600 leading-relaxed text-sm">
                <p>{description.length > 300 ? description.slice(0, 300) + '...' : description}</p>
              </div>
            )}

            {/* Specs Grid */}
            {specs.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {specs.map((spec, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                    <span className="text-xs text-gray-500 block">{spec.label}</span>
                    <span className="text-sm font-medium text-gray-900">{spec.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Region Selector */}
            {allRegions.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-500 font-medium">
                  {language === 'zh' ? '地区:' : 'Region:'}
                </span>
                {allRegions.map(region => (
                  <button
                    key={region}
                    onClick={() => setActiveRegion(region)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      activeRegion === region
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {region}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Price Comparison Section */}
        {sortedPrices.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              {language === 'zh' ? '价格对比' : 'Price Comparison'}
              <span className="text-sm font-normal text-gray-500">
                ({sortedPrices.length} {language === 'zh' ? '家商城' : 'stores compared'})
              </span>
            </h2>

            {/* Price Cards (matching standard product detail page) */}
            <div className="space-y-3">
              {sortedPrices.map((price, index) => {
                const isLowest = index === 0;
                const storeName = getStoreName(price);
                const storeLogo = getStoreLogo(price);
                const priceCurrency = getCurrencySymbol(price.currency);

                return (
                  <div
                    key={price.id}
                    className={`rounded-xl border p-4 transition-all hover:shadow-md ${
                      isLowest
                        ? 'border-green-200 bg-green-50/50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* Store Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {storeLogo ? (
                          <SafeImage
                            src={storeLogo}
                            alt={storeName}
                            width={40}
                            height={40}
                            className="rounded-lg flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{storeName}</div>
                          {isLowest && (
                            <span className="inline-flex items-center rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
                              {language === 'zh' ? '最低价' : 'LOWEST PRICE'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="text-right flex-shrink-0">
                        <div className={`text-lg font-bold tabular-nums ${isLowest ? 'text-green-600' : 'text-gray-900'}`}>
                          {priceCurrency}{price.current_price?.toFixed(2)}
                        </div>
                        {price.original_price && price.original_price > (price.current_price || 0) && (
                          <div className="text-sm text-gray-400 line-through tabular-nums">
                            {priceCurrency}{price.original_price.toFixed(2)}
                          </div>
                        )}
                      </div>

                      {/* Buy Button */}
                      {price.product_url ? (
                        <a
                          href={price.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors flex-shrink-0"
                        >
                          {language === 'zh' ? '购买' : 'Buy Now'}
                          <svg className="w-4 h-4 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ) : (
                        <span className="text-gray-300 text-sm flex-shrink-0">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Features Section */}
        {features.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {language === 'zh' ? '产品特点' : 'Key Features'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-2 bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-gray-700">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back Link */}
        <div className="mt-10 text-center">
          {promotionSlug && promotion ? (
            <Link href={`/promotion/${promotionSlug}`} className="inline-flex items-center text-purple-600 hover:text-purple-700 font-medium">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {language === 'zh' ? `返回 ${promotionTranslation?.name || promotion.slug}` : `Back to ${promotionTranslation?.name || promotion.slug}`}
            </Link>
          ) : (
            <Link href="/" className="inline-flex items-center text-purple-600 hover:text-purple-700 font-medium">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {language === 'zh' ? '返回首页' : 'Back to Home'}
            </Link>
          )}
        </div>
      </main>
      <SiteFooter />
      <CookieConsent />
    </div>
  );
}
