'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useLanguage } from '@/hooks/use-language';
import { cn } from '@/lib/utils';

interface StoreTranslation {
  id: number;
  store_id: number;
  language: string;
  name: string;
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
  store?: {
    id: number;
    slug: string;
    logo_url: string | null;
    is_active: boolean;
    store_translations?: StoreTranslation[];
  } | null;
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

interface PromotionTranslation {
  id: number;
  name: string | null;
  title: string | null;
  description: string | null;
  cover_image_key: string | null;
  cover_image_url: string | null;
  language_code: string;
  language: string;
}

interface Promotion {
  id: number;
  slug: string;
  title: string | null;
  sort_order: number;
  is_active: boolean;
  translations: PromotionTranslation[];
  promotion_products: PromotionProduct[];
}

// Helper: get translation
function getTranslation<T extends { language: string }>(translations: T[] | undefined | null, language: string): T | undefined {
  if (!translations || translations.length === 0) return undefined;
  return translations.find(t => t.language === language) || translations.find(t => t.language === "en") || translations[0];
}

// Safe Image component with fallback
function SafeImage({ 
  src, 
  alt, 
  fill, 
  className, 
  sizes,
  width,
  height,
  loading
}: { 
  src: string | null; 
  alt: string; 
  fill?: boolean; 
  className?: string;
  sizes?: string;
  width?: number;
  height?: number;
  loading?: string;
}) {
  const [imgSrc, setImgSrc] = useState(src || '/placeholder-product.png');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setImgSrc(src || '/placeholder-product.png');
    setHasError(false);
  }, [src]);

  if (hasError || !src) {
    return (
      <div className={cn("bg-gray-100 flex items-center justify-center", className)}>
        <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  if (fill) {
    return (
      <Image
        src={imgSrc}
        alt={alt}
        fill
        className={className}
        sizes={sizes}
        onError={() => {
          setHasError(true);
          setImgSrc('/placeholder-product.png');
        }}
        unoptimized
        {...(loading ? { loading: loading as 'eager' | 'lazy' } : {})}
      />
    );
  }

  return (
    <Image
      src={imgSrc}
      alt={alt}
      width={width || 200}
      height={height || 200}
      className={className}
      onError={() => {
        setHasError(true);
        setImgSrc('/placeholder-product.png');
      }}
      unoptimized
      {...(loading ? { loading: loading as 'eager' | 'lazy' } : {})}
    />
  );
}

// Live Countdown Timer for product cards
function CountdownTimer({ seconds, language }: { seconds: number; language: string }) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  if (timeLeft <= 0) return null;

  const days = Math.floor(timeLeft / 86400);
  const hours = Math.floor((timeLeft % 86400) / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const secs = timeLeft % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="inline-flex items-center gap-0.5 sm:gap-1 rounded-full bg-gray-100 px-1.5 sm:px-2 py-0.5 sm:py-1 hover:bg-red-50 transition-colors group">
      <span className="text-[8px] sm:text-[10px] font-medium text-gray-500 group-hover:text-red-600">
        {language === "zh" ? "倒计时" : "Ends"}
      </span>
      {days > 0 && (
        <span className="text-[9px] sm:text-xs font-bold text-gray-700 group-hover:text-red-600 tabular-nums">
          {days}d
        </span>
      )}
      <span className="text-[9px] sm:text-xs font-bold text-gray-700 group-hover:text-red-600 tabular-nums">
        {pad(hours)}:{pad(minutes)}:{pad(secs)}
      </span>
    </div>
  );
}

// Time type badge
function TimeTypeBadge({ timeType, endTime, language }: { 
  timeType: string; 
  endTime: string | null;
  language: string;
}) {
  if (timeType === 'permanent') {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-gray-500 hover:bg-green-100 hover:text-green-700 transition-colors">
        {language === 'zh' ? '长期有效' : 'Permanent'}
      </span>
    );
  }

  if (timeType === 'countdown') {
    if (!endTime) return null;
    const now = new Date();
    const end = new Date(endTime);
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-red-700">
          {language === 'zh' ? '已结束' : 'Ended'}
        </span>
      );
    }
    const seconds = Math.floor(diff / 1000);
    return <CountdownTimer seconds={seconds} language={language} />;
  }

  if (timeType === 'time_range') {
    if (!endTime) return null;
    const now = new Date();
    const end = new Date(endTime);
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-red-700">
          {language === 'zh' ? '已结束' : 'Ended'}
        </span>
      );
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-gray-500 hover:bg-amber-100 hover:text-amber-700 transition-colors">
        {language === 'zh' ? `限时 ${days}天${hours}时` : `${days}d ${hours}h left`}
      </span>
    );
  }

  return null;
}

export function PromotionClientContent({ promotion }: { promotion: Promotion }) {
  const { language } = useLanguage();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const translation = promotion.translations?.find(t => t.language_code === language || t.language === language) || promotion.translations?.[0];

  // Filter active products
  const activeProducts = promotion.promotion_products?.filter(p => p.is_active) || [];

  return (
    <>
      {/* Promotion Header - Title and Description */}
      <div className="mb-8">
        {/* Activity Title and Description - Best Vapes style */}
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
          {translation?.title || translation?.name || promotion.slug}
        </h1>
        {translation?.description && (
          <p className="text-sm text-gray-500 max-w-3xl mb-4">
            {translation.description}
          </p>
        )}

        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>
            {activeProducts.length} {language === 'zh' ? '个产品' : 'products'}
          </span>
        </div>
      </div>

      {/* Products Grid - Same layout as standard product cards */}
      {activeProducts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-600">
            {language === 'zh' ? '该促销活动暂无产品' : 'No products in this promotion'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {activeProducts.map((product, idx) => {
            const productTranslation = product.promotion_product_translations?.find(
              (t) => t.language === language
            ) || product.promotion_product_translations?.[0];
            
            // Show all store prices (both promotion and standard types)
            const promotionPrices = (product.store_prices || [])
              .filter(p => p.store_id && p.current_price && !p.no_quote)
              // Filter out prices where countdown has ended with 'close' action
              .filter(p => {
                if (p.time_type !== 'permanent' && p.end_time && p.countdown_action === 'close') {
                  return new Date(p.end_time).getTime() > Date.now();
                }
                return true;
              });

            if (promotionPrices.length === 0) return null;

            // Sort by price
            const sortedPrices = [...promotionPrices].sort((a, b) => (a.current_price || 0) - (b.current_price || 0));
            const lowestPrice = sortedPrices[0];
            const lowestPriceValue = lowestPrice?.current_price || 0;
            
            // Calculate highest original price for discount display
            const highestOriginal = promotionPrices.reduce((max, p) => {
              const val = p.original_price || 0;
              return val > max ? val : max;
            }, 0);
            
            // Discount calculation
            const discountAmt = highestOriginal > lowestPriceValue ? (highestOriginal - lowestPriceValue).toFixed(2) : null;
            const discountPct = highestOriginal > lowestPriceValue ? Math.round((1 - lowestPriceValue / highestOriginal) * 100) : null;

            // Determine the promotion type label for the card
            const hasCountdown = promotionPrices.some(p => p.time_type === 'countdown');
            const hasTimeRange = promotionPrices.some(p => p.time_type === 'time_range');

            // Get the earliest end time for countdown display
            const countdownPrice = sortedPrices.find(p => p.time_type === 'countdown' && p.end_time);

            return (
              <div
                key={product.id}
                className="group rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-purple-300 transition-all"
              >
                <Link
                  href={`/promotion-product/${product.id}?promotion=${promotion.slug}`}
                  className="block relative aspect-square bg-gray-50 overflow-hidden"
                >
                  <SafeImage
                    src={product.image_key || product.image_url}
                    alt={productTranslation?.name || product.slug || 'Product'}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    loading={idx < 4 ? "eager" : "lazy"}
                  />
                  {/* Discount badge */}
                  {discountAmt && (
                    <div className="absolute top-2 left-2 z-10 rounded-lg bg-red-500 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-bold text-white animate-pulse-deal">
                      Save ${discountAmt}
                    </div>
                  )}
                  {!discountAmt && discountPct && discountPct > 0 && (
                    <div className="absolute top-2 left-2 z-10 rounded-lg bg-red-500 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-bold text-white animate-pulse-deal">
                      -{discountPct}%
                    </div>
                  )}
                  {/* Time type badge on image */}
                  {mounted && countdownPrice?.end_time && (
                    <div className="absolute top-2 right-2 z-10">
                      <TimeTypeBadge 
                        timeType={countdownPrice.time_type} 
                        endTime={countdownPrice.end_time} 
                        language={language} 
                      />
                    </div>
                  )}
                  {!countdownPrice?.end_time && !hasTimeRange && (
                    <div className="absolute top-2 right-2 z-10 rounded-lg bg-green-600 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-white">
                      {language === 'zh' ? '长期有效' : 'Permanent'}
                    </div>
                  )}
                  {!countdownPrice?.end_time && hasTimeRange && sortedPrices.find(p => p.time_type === 'time_range' && p.end_time) && (
                    <div className="absolute top-2 right-2 z-10">
                      <TimeTypeBadge 
                        timeType="time_range" 
                        endTime={sortedPrices.find(p => p.time_type === 'time_range' && p.end_time)!.end_time} 
                        language={language} 
                      />
                    </div>
                  )}
                </Link>
                <div className="p-2 sm:p-3">
                  <Link href={`/promotion-product/${product.id}?promotion=${promotion.slug}`}>
                    <h3 className="text-[11px] sm:text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-purple-700 transition-colors leading-snug">
                      {productTranslation?.name || product.slug || 'Unnamed Product'}
                    </h3>
                  </Link>
                  
                  {/* Price display */}
                  <div className="mt-1 sm:mt-1.5 flex items-baseline gap-1 sm:gap-2">
                    <span className="text-sm sm:text-xl font-bold text-emerald-600 tabular-nums">
                      {lowestPrice?.currency === 'USD' ? '$' : lowestPrice?.currency || '$'}{lowestPriceValue.toFixed(2)}
                    </span>
                    {sortedPrices.length >= 2 && (
                      <span className="text-[9px] sm:text-xs text-emerald-600 font-medium">
                        {language === 'zh' ? '最低价' : 'Lowest'}
                      </span>
                    )}
                    {highestOriginal > lowestPriceValue && sortedPrices.length < 2 && (
                      <span className="text-[10px] sm:text-sm text-gray-400 line-through tabular-nums">
                        ${highestOriginal.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Mobile: top store price only */}
                  <div className="mt-1 sm:hidden">
                    {sortedPrices.slice(0, 1).map(price => {
                      const st = price.store?.store_translations ? getTranslation(price.store.store_translations, language) : null;
                      const storeName = st?.name || "Store";
                      return (
                        <div key={price.id} className="flex items-center justify-between gap-1 rounded-md bg-gray-50 px-1.5 py-1">
                          <span className="text-[9px] text-gray-500 truncate">{storeName}</span>
                          <span className="text-[9px] font-semibold text-emerald-600 tabular-nums">
                            {price.currency === 'USD' ? '$' : price.currency || '$'}{price.current_price?.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                    {sortedPrices.length > 1 && (
                      <Link href={`/promotion-product/${product.id}?promotion=${promotion.slug}`} className="block text-center text-[9px] text-purple-700 hover:underline py-0.5">
                        +{sortedPrices.length - 1} {language === 'zh' ? '家商城' : 'stores'}
                      </Link>
                    )}
                  </div>

                  {/* Desktop: store price list with Buy buttons */}
                  <div className="hidden sm:block mt-2 space-y-1">
                    {sortedPrices.slice(0, 3).map(price => {
                      const st = price.store?.store_translations ? getTranslation(price.store.store_translations, language) : null;
                      const storeName = st?.name || "Store";
                      return (
                        <div key={price.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2 py-1">
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
                                <span className="text-[10px] font-bold text-purple-600">{storeName.charAt(0)}</span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500 truncate">{storeName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-xs font-semibold text-emerald-600 tabular-nums">
                              {price.currency === 'USD' ? '$' : price.currency || '$'}{price.current_price?.toFixed(2)}
                            </span>
                            {price.product_url && (
                              <a
                                href={price.product_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 hover:bg-purple-700 hover:text-white transition-all"
                              >
                                {language === 'zh' ? '购买' : 'Buy'}
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {sortedPrices.length > 3 && (
                      <Link href={`/promotion-product/${product.id}?promotion=${promotion.slug}`} className="block text-center text-xs text-purple-700 hover:underline py-0.5">
                        {language === 'zh' ? `查看全部 ${sortedPrices.length} 家商城` : `View all ${sortedPrices.length} stores`}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Back Link */}
      <div className="mt-8">
        <Link href="/" className="inline-flex items-center text-purple-600 hover:text-purple-700">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {language === 'zh' ? '返回首页' : 'Back to Home'}
        </Link>
      </div>
    </>
  );
}