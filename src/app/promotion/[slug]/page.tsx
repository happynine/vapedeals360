'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { SiteHeader } from '@/components/site-header';
import SiteFooter from '@/components/site-footer';
import CookieConsent from '@/components/cookie-consent';
import { CountdownDisplay } from '@/components/countdown-display';
import { useLanguage } from '@/hooks/use-language';
import { cn } from '@/lib/utils';

interface PromotionTranslation {
  id: number;
  name: string | null;
  description: string | null;
  cover_image_url: string | null;
  language_code: string;
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
  time_type: 'permanent' | 'time_range' | 'countdown';
  start_time: string | null;
  end_time: string | null;
  countdown_action: 'close' | 'original_price';
  store?: {
    id: number;
    name: string;
    icon_url: string | null;
  };
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
  promotion_type: string;
  sort_order: number;
  is_active: boolean;
  translations: PromotionTranslation[];
  promotion_products: PromotionProduct[];
}

// Safe Image component with fallback
function SafeImage({ 
  src, 
  alt, 
  fill, 
  className, 
  sizes,
  width,
  height 
}: { 
  src: string | null; 
  alt: string; 
  fill?: boolean; 
  className?: string;
  sizes?: string;
  width?: number;
  height?: number;
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
    />
  );
}

// Countdown badge component for cards
function CountdownBadge({ timeType, endTime, language }: { 
  timeType: string; 
  endTime: string | null;
  language: string;
}) {
  if (timeType === 'permanent') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        {language === 'zh' ? '永久有效' : 'Permanent'}
      </span>
    );
  }

  if (!endTime) return null;

  const now = new Date();
  const end = new Date(endTime);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        {language === 'zh' ? '已结束' : 'Ended'}
      </span>
    );
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      {days}d {hours}h {minutes}m
    </span>
  );
}

export default function PromotionPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { language } = useLanguage();
  
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPromotion = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/promotions/${slug}`);
      if (!response.ok) {
        throw new Error('Failed to fetch promotion');
      }
      const data = await response.json();
      setPromotion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchPromotion();
  }, [fetchPromotion]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <SiteHeader />
        <main className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-64 bg-gray-200 rounded mb-8"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </main>
        <SiteFooter />
        <CookieConsent />
      </div>
    );
  }

  if (error || !promotion) {
    return (
      <div className="min-h-screen bg-white">
        <SiteHeader />
        <main className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {language === 'zh' ? '促销活动不存在' : 'Promotion Not Found'}
            </h1>
            <p className="text-gray-600 mb-6">
              {language === 'zh' ? '该促销活动可能已结束或不存在' : 'This promotion may have ended or does not exist'}
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

  const translation = promotion.translations?.find(t => t.language_code === language) || promotion.translations?.[0];
  const coverImage = translation?.cover_image_url;

  // Filter active products
  const activeProducts = promotion.promotion_products?.filter(p => p.is_active) || [];

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Promotion Header */}
        <div className="mb-8">
          {coverImage && (
            <div className="relative w-full h-64 sm:h-80 rounded-xl overflow-hidden mb-6">
              <SafeImage
                src={coverImage}
                alt={translation?.name || promotion.slug}
                fill
                className="object-cover"
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                  {translation?.name || promotion.slug}
                </h1>
                {translation?.description && (
                  <p className="text-sm text-white/80 max-w-xl">
                    {translation.description}
                  </p>
                )}
              </div>
            </div>
          )}
          
          {!coverImage && (
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              {translation?.name || promotion.slug}
            </h1>
          )}

          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 font-medium text-purple-700">
              {promotion.promotion_type}
            </span>
            <span>
              {activeProducts.length} {language === 'zh' ? '个产品' : 'products'}
            </span>
          </div>
        </div>

        {/* Products Grid */}
        {activeProducts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-600">
              {language === 'zh' ? '该促销活动暂无产品' : 'No products in this promotion'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {activeProducts.map((product) => {
              const productTranslation = product.promotion_product_translations?.find(
                t => t.language === language
              ) || product.promotion_product_translations?.[0];
              
              // Get first store price with valid data
              const firstPrice = product.store_prices?.find(p => p.store_id && p.current_price);
              const endTime: string | null = firstPrice?.end_time ?? null;
              const timeType = firstPrice?.time_type || 'permanent';

              return (
                <Link
                  key={product.id}
                  href={`/promotion-product/${product.id}?promotion=${slug}`}
                  className="group relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all overflow-hidden"
                >
                  {/* Product Image */}
                  <div className="relative aspect-square overflow-hidden bg-gray-50">
                    <SafeImage
                      src={product.image_key || product.image_url}
                      alt={productTranslation?.name || product.slug || 'Product'}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                    
                    {/* Countdown Badge on Image */}
                    <div className="absolute top-2 right-2">
                      <CountdownBadge timeType={timeType} endTime={endTime} language={language} />
                    </div>
                  </div>

                  {/* Product Info */}
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-purple-600">
                      {productTranslation?.name || product.slug || 'Unnamed Product'}
                    </h3>
                    
                    {/* Price Display */}
                    {firstPrice && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg font-bold text-green-600">
                          {firstPrice.currency === 'USD' ? '$' : firstPrice.currency || '$'}
                          {firstPrice.current_price?.toFixed(2)}
                        </span>
                        {firstPrice.original_price && firstPrice.original_price > firstPrice.current_price! && (
                          <span className="text-sm text-gray-400 line-through">
                            {firstPrice.currency === 'USD' ? '$' : firstPrice.currency || '$'}
                            {firstPrice.original_price.toFixed(2)}
                          </span>
                        )}
                        {firstPrice.discount_percent && (
                          <span className="text-xs text-red-600 font-medium">
                            -{firstPrice.discount_percent}%
                          </span>
                        )}
                      </div>
                    )}

                    {/* Store Info */}
                    {firstPrice?.store && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {firstPrice.store.icon_url && (
                          <SafeImage
                            src={firstPrice.store.icon_url}
                            alt={firstPrice.store.name}
                            width={16}
                            height={16}
                            className="rounded"
                          />
                        )}
                        <span>{firstPrice.store.name}</span>
                      </div>
                    )}
                  </div>
                </Link>
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
      </main>
      <SiteFooter />
      <CookieConsent />
    </div>
  );
}