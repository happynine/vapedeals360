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
  language_code: string;
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
  translations: {
    id: number;
    name: string | null;
    cover_image_url: string | null;
    language_code: string;
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

  const fetchProduct = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/promotion-products/${productId}?promotion=${promotionSlug || ''}`);
      if (!response.ok) {
        throw new Error('Failed to fetch product');
      }
      const result = await response.json();
      setData(result);
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
              <div className="h-64 bg-gray-200 rounded"></div>
              <div className="space-y-4">
                <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
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
  const translation = product.promotion_product_translations?.find(t => t.language_code === language) || product.promotion_product_translations?.[0];
  const promotionTranslation = promotion?.translations?.find(t => t.language_code === language) || promotion?.translations?.[0];

  // Get store prices sorted by price
  const validPrices = product.store_prices?.filter(p => p.store_id && p.current_price && !p.no_quote) || [];
  const sortedPrices = [...validPrices].sort((a, b) => (a.current_price || 0) - (b.current_price || 0));
  const lowestPrice = sortedPrices[0];

  // Find countdown info from first price
  const firstPrice = product.store_prices?.[0];
  const timeType = firstPrice?.time_type || 'permanent';
  const startTime = firstPrice?.start_time;
  const endTime = firstPrice?.end_time;

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Navigation */}
        <div className="mb-4">
          {promotionSlug && promotion ? (
            <Link href={`/promotion/${promotionSlug}`} className="inline-flex items-center text-purple-600 hover:text-purple-700">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {language === 'zh' ? `返回 ${promotionTranslation?.name || promotion.slug}` : `Back to ${promotionTranslation?.name || promotion.slug}`}
            </Link>
          ) : (
            <Link href="/" className="inline-flex items-center text-purple-600 hover:text-purple-700">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {language === 'zh' ? '返回首页' : 'Back to Home'}
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Product Image */}
          <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border border-gray-200">
            <SafeImage
              src={product.image_url}
              alt={translation?.name || product.slug || 'Product'}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {translation?.name || product.slug || 'Unnamed Product'}
            </h1>

            {/* Countdown Display */}
            {timeType !== 'permanent' && endTime && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold text-red-700">
                    {language === 'zh' ? '限时优惠' : 'Limited Time Offer'}
                  </span>
                </div>
                <CountdownDisplay endTime={endTime} />
              </div>
            )}

            {/* Lowest Price Badge */}
            {lowestPrice && (
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-green-600">
                  {lowestPrice.currency === 'USD' ? '$' : lowestPrice.currency || '$'}
                  {lowestPrice.current_price?.toFixed(2)}
                </span>
                {lowestPrice.original_price && lowestPrice.original_price > lowestPrice.current_price! && (
                  <div className="flex items-center gap-2">
                    <span className="text-lg text-gray-400 line-through">
                      {lowestPrice.currency === 'USD' ? '$' : lowestPrice.currency || '$'}
                      {lowestPrice.original_price.toFixed(2)}
                    </span>
                    {lowestPrice.discount_percent && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-sm font-medium text-red-600">
                        -{lowestPrice.discount_percent}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            {translation?.description && (
              <div className="text-gray-600">
                <p>{translation.description}</p>
              </div>
            )}

            {/* Notes */}
            {product.notes && (
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500">
                {product.notes}
              </div>
            )}
          </div>
        </div>

        {/* Price Comparison Table */}
        {sortedPrices.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              {language === 'zh' ? '价格对比' : 'Price Comparison'}
            </h2>
            
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {language === 'zh' ? '商城' : 'Store'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {language === 'zh' ? '当前价格' : 'Price'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {language === 'zh' ? '原价' : 'Original'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {language === 'zh' ? '折扣' : 'Discount'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {language === 'zh' ? '倒计时' : 'Time'}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {language === 'zh' ? '操作' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedPrices.map((price, index) => {
                    const isLowest = index === 0;
                    const currencySymbol = price.currency === 'USD' ? '$' : price.currency || '$';
                    
                    return (
                      <tr key={price.id} className={isLowest ? 'bg-green-50' : ''}>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            {price.store?.icon_url && (
                              <SafeImage
                                src={price.store.icon_url}
                                alt={price.store.name}
                                width={32}
                                height={32}
                                className="rounded"
                              />
                            )}
                            <div>
                              <span className="font-medium text-gray-900">{price.store?.name}</span>
                              {isLowest && (
                                <span className="ml-2 inline-flex items-center rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                                  {language === 'zh' ? '最低价' : 'LOWEST'}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={isLowest ? 'text-lg font-bold text-green-600' : 'text-gray-900'}>
                            {currencySymbol}{price.current_price?.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {price.original_price ? (
                            <span className="text-gray-400 line-through">
                              {currencySymbol}{price.original_price.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {price.discount_percent ? (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                              -{price.discount_percent}%
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {price.time_type === 'permanent' ? (
                            <span className="text-xs text-gray-500">
                              {language === 'zh' ? '永久' : 'Permanent'}
                            </span>
                          ) : price.end_time ? (
                            <div className="text-xs">
                              <CountdownDisplay endTime={price.end_time} />
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right">
                          {price.product_url ? (
                            <a
                              href={price.product_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
                            >
                              {language === 'zh' ? '购买' : 'Buy'}
                              <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
      <CookieConsent />
    </div>
  );
}