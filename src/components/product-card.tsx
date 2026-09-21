'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/safe-image';
import { BorderBeam } from 'antd';
import { cleanAffiliateUrl } from '@/lib/seo';

// Types and pure helpers live in a server-safe module so API routes can import
// them without pulling in this client component.
export type {
  StoreTranslation,
  Store,
  ProductPrice,
  ProductTranslation,
  Product,
} from '@/lib/product-utils';
import { getTranslation, getDisplayPrice, getLowestPrice } from '@/lib/product-utils';
export { getTranslation, getDisplayPrice, getLowestPrice };
import type {
  Product,
  ProductPrice,
  ProductTranslation,
  Store,
} from '@/lib/product-utils';

function getHighestOriginal(prices: ProductPrice[]): string | null {
  if (!prices || prices.length === 0) return null;
  const originals = prices.filter((p) => p.original_price).map((p) => parseFloat(p.original_price!));
  return originals.length > 0 ? Math.max(...originals).toFixed(2) : null;
}

function getDiscountDisplay(
  prices: ProductPrice[],
):
  | { type: 'save'; currency: string; amount: string }
  | { type: 'percent'; value: number }
  | null {
  if (!prices || prices.length === 0) return null;

  if (prices.length >= 2) {
    const byCurrency: Record<string, ProductPrice[]> = {};
    prices.forEach((p) => {
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
      const priceValues = curPrices.map((p) => parseFloat(getDisplayPrice(p)));
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
      const priceValues = curPrices.map((p) => parseFloat(getDisplayPrice(p)));
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
      const percent = Math.round(((original - current) / original) * 100);
      return { type: 'percent', value: percent };
    }
  }

  return null;
}

interface ProductCardProps {
  product: Product;
  language: string;
  currencySymbol: string;
  index?: number;
}

/**
 * Full product card identical to the Vape Deals grid: cover + Save badge,
 * name, lowest price, per-store offer rows with Buy buttons.
 */
export function ProductCard({
  product,
  language,
  currencySymbol,
  index = 0,
}: ProductCardProps) {
  const t = getTranslation(product.translations, language);

  // Only prices in the currently selected currency.
  const displayPrices = product.prices.filter((p) => {
    if (p.no_quote) return false;
    if (p.store && !p.store.is_active) return false;
    return (p.currency || '$') === currencySymbol;
  });

  if (displayPrices.length === 0) return null;

  const lowest = getLowestPrice(displayPrices);
  const highestOrig = getHighestOriginal(displayPrices);
  const discountInfo = getDiscountDisplay(displayPrices);
  const sortedPrices = [...displayPrices].sort(
    (a, b) => parseFloat(getDisplayPrice(a)) - parseFloat(getDisplayPrice(b)),
  );

  return (
    <BorderBeam
      color={[
        { color: '#2f54eb', percent: 0 },
        { color: '#722ed1', percent: 44 },
        { color: '#ff85c0', percent: 100 },
      ]}
      size={120}
      duration={4}
      lineWidth={1}
      outset={0}
      className="animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="group hover-border-beam rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-all relative">
        <Link
          href={`/product/${product.slug}`}
          className="block relative aspect-square bg-gray-50 overflow-hidden"
          onClick={() => {
            const sid = sessionStorage.getItem('vp_session_id') || '';
            fetch('/api/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'product_click',
                session_id: sid,
                product_id: product.id,
              }),
            }).catch(() => {});
          }}
        >
          {product.home_image_url || product.image_url ? (
            <SafeImage
              src={product.home_image_url || product.image_url_small || product.image_url}
              alt={t?.name || ''}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              loading={index < 4 ? 'eager' : 'lazy'}
              priority={index < 2}
            />
          ) : null}
          {discountInfo && (
            <div className="absolute top-2 left-2 z-10 rounded-lg bg-red-500 px-2 py-0.5 text-xs font-bold text-white animate-pulse-deal">
              {discountInfo.type === 'percent'
                ? `-${discountInfo.value}%`
                : `Save ${discountInfo.currency}${discountInfo.amount}`}
            </div>
          )}
          {product.is_featured && (
            <div className="absolute top-2 right-2 z-10 rounded-lg bg-purple-700 px-2 py-0.5 text-xs font-semibold text-white">
              {language === 'zh' ? '精选' : 'Featured'}
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
              {lowest?.currency || '$'}
              {lowest ? getDisplayPrice(lowest) : '—'}
            </span>
            {highestOrig && displayPrices.length >= 2 && (
              <span className="text-[10px] sm:text-xs text-emerald-600 font-medium ml-0.5">
                {language === 'zh' ? '最低价' : 'Lowest'}
              </span>
            )}
            {highestOrig && displayPrices.length < 2 && (
              <span className="text-xs sm:text-sm text-gray-400 line-through tabular-nums">
                {lowest?.currency || '$'}
                {highestOrig}
              </span>
            )}
          </div>
          {/* Mobile: only show top store price; Desktop: show full store list */}
          <div className="mt-1.5 sm:hidden">
            {sortedPrices.slice(0, 1).map((price) => {
              const st = price.store ? getTranslation(price.store.translations, language) : null;
              return (
                <div
                  key={price.id}
                  className="flex items-center justify-between gap-1 rounded-md bg-gray-50 px-2 py-1"
                >
                  <span className="text-[10px] text-gray-500 truncate">
                    {st?.name || 'Store'}
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-600 tabular-nums">
                    {price.currency || '$'}
                    {getDisplayPrice(price)}
                  </span>
                </div>
              );
            })}
            {sortedPrices.length > 1 && (
              <Link
                href={`/product/${product.slug}`}
                className="block text-center text-[10px] text-purple-700 hover:underline py-0.5"
              >
                +{sortedPrices.length - 1} {language === 'zh' ? '家商城' : 'stores'}
              </Link>
            )}
          </div>
          <div className="hidden sm:block mt-3 space-y-1.5">
            {sortedPrices.slice(0, 3).map((price) => {
              const st = price.store ? getTranslation(price.store.translations, language) : null;
              return (
                <div
                  key={price.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="h-5 w-5 flex-shrink-0 rounded bg-purple-50 flex items-center justify-center overflow-hidden">
                      {price.store?.logo_url ? (
                        <img
                          src={
                            price.store.logo_url.startsWith('http')
                              ? price.store.logo_url
                              : `/api/image?key=${encodeURIComponent(price.store.logo_url)}`
                          }
                          alt=""
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-[10px] font-bold text-purple-600">
                          {st?.name?.charAt(0) || '?'}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 truncate">{st?.name || 'Store'}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-semibold text-emerald-600 tabular-nums">
                      {price.currency || '$'}
                      {getDisplayPrice(price)}
                    </span>
                    <a
                      href={cleanAffiliateUrl(price.product_url)}
                      target="_blank"
                      rel="sponsored nofollow noopener noreferrer"
                      onClick={(e) => {
                        e.stopPropagation();
                        const sid = sessionStorage.getItem('vp_session_id') || '';
                        fetch('/api/track', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            type: 'buy_click',
                            session_id: sid,
                            product_id: price.product_id,
                            store_id: price.store_id,
                          }),
                        }).catch(() => {});
                      }}
                      className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 hover:bg-purple-700 hover:text-white transition-all"
                    >
                      {language === 'zh' ? '购买' : 'Buy'}
                    </a>
                  </div>
                </div>
              );
            })}
            {sortedPrices.length > 3 && (
              <Link
                href={`/product/${product.slug}`}
                className="block text-center text-xs text-purple-700 hover:underline py-1"
              >
                {language === 'zh'
                  ? `查看全部 ${sortedPrices.length} 家商城`
                  : `View all ${sortedPrices.length} stores`}
              </Link>
            )}
          </div>
        </div>
      </div>
    </BorderBeam>
  );
}
