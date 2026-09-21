'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/safe-image';
import { BorderBeam } from 'antd';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { cleanAffiliateUrl } from '@/lib/seo';
import { ALL_STATES, LAUNCH_STATES, getStateContent } from '@/lib/states';
import { useLanguage } from '@/hooks/use-language';
import { SiteHeader } from '@/components/site-header';

// 美国专区只展示 USD 报价，DB 中 USD 货币以符号 '$' 存储
const USD_SYMBOL = '$';
const STATE_STORAGE_KEY = 'last_vape_state';

type UsSiteType = 'domestic' | 'international';
type UsShipFrom = 'us_warehouse' | 'intl_warehouse';
interface StoreRegion {
  region: string;
  currency: string;
  us_site_type?: UsSiteType;
  us_ship_from?: UsShipFrom;
  banned_states?: string[];
}
interface StoreTranslation { language: string; name: string }
interface Store {
  id: number;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  translations?: StoreTranslation[];
  regions?: StoreRegion[];
}
interface ProductPrice {
  id: number;
  product_id: number;
  store_id: number;
  current_price: string;
  original_price: string | null;
  product_url: string;
  currency?: string;
  no_quote?: boolean;
  promotion_id?: number | null;
  promo_price?: string | null;
  store?: Store;
}
interface ProductTranslation { language: string; name: string }
interface Product {
  id: number;
  slug: string;
  image_url: string | null;
  image_url_small: string | null;
  home_image_url: string | null;
  translations: ProductTranslation[];
  prices: ProductPrice[];
}

function getTranslation<T extends { language: string }>(list: T[] | undefined | null, language: string): T | undefined {
  if (!list || list.length === 0) return undefined;
  return list.find((x) => x.language === language) || list.find((x) => x.language === 'en') || list[0];
}
function displayPrice(p: ProductPrice): string {
  if (p.promotion_id != null && p.promo_price != null && p.promo_price !== '') return p.promo_price;
  return p.current_price;
}

/** 取商城的 USD 配置（只有显式配齐美国专区字段的才算美国专区商城） */
function storeUsRegion(store: Store | undefined): StoreRegion | undefined {
  return store?.regions?.find((r) => r.currency === 'USD');
}

type ShipFilter = 'all' | UsShipFrom;
const PAGE_SIZE = 26;

export function UsZoneMall() {
  const { language } = useLanguage();
  const zh = language === 'zh';

  const [siteTab, setSiteTab] = useState<UsSiteType>('domestic');
  const [shipFilter, setShipFilter] = useState<ShipFilter>('all');
  const [stateCode, setStateCode] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // 仅在客户端读取 localStorage，避免 hydration 不一致
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STATE_STORAGE_KEY);
      if (saved && ALL_STATES.some((s) => s.code === saved)) setStateCode(saved);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // 拉取足量 USD 商品（含全部商城报价），前端按商城属性过滤
    fetch(`/api/products?currency=USD&limit=300&sort_by=id&sort_order=desc`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.success) setProducts(json.data.products || []);
      })
      .catch(() => { if (!cancelled) setProducts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // 任一筛选条件变化回到第一页
  useEffect(() => { setPage(1); }, [siteTab, shipFilter, stateCode]);

  // 判断一条商城报价是否通过当前筛选
  const offerVisible = (p: ProductPrice): boolean => {
    if (p.no_quote) return false;
    if ((p.currency || '$') !== USD_SYMBOL) return false;
    const store = p.store;
    if (!store || store.is_active === false) return false;
    const us = storeUsRegion(store);
    // 必须显式配齐美国专区字段，否则不进入美国专区
    if (!us || !us.us_site_type || !us.us_ship_from) return false;
    if (us.us_site_type !== siteTab) return false;
    if (shipFilter !== 'all' && us.us_ship_from !== shipFilter) return false;
    if (stateCode && (us.banned_states || []).includes(stateCode)) return false;
    return true;
  };

  // 过滤后仍有可售商城的产品才展示
  const visibleProducts = useMemo(() => {
    return products
      .map((product) => ({ product, prices: product.prices.filter(offerVisible) }))
      .filter((x) => x.prices.length > 0)
      .sort((a, b) => {
        const la = Math.min(...a.prices.map((p) => parseFloat(displayPrice(p))));
        const lb = Math.min(...b.prices.map((p) => parseFloat(displayPrice(p))));
        return lb - la;
      });
  }, [products, siteTab, shipFilter, stateCode]);

  const totalPages = Math.max(1, Math.ceil(visibleProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = visibleProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectedState = ALL_STATES.find((s) => s.code === stateCode);

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader activeTab="shop-by-state" />

      <main className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Popular states 导航卡：只做法律查阅入口，不参与商品过滤 */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            {zh ? '各州电子烟法规' : 'Vaping Laws by State'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {zh
              ? '订购前，请您仔细了解您所在的州制定的电子烟相关法律规定、在线运输限制以及 PMTA 目录状态。避免您下单后出现海关扣押、当地法律无法邮寄等问题，导致您无法收货。'
              : 'Before ordering, please carefully review your state\u2019s vaping laws, online shipping restrictions and PMTA directory status to avoid customs seizure or local-law shipping blocks that prevent delivery.'}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {LAUNCH_STATES.map((state) => {
              const c = getStateContent(state);
              return (
                <Link
                  key={state.code}
                  href={`/vape-laws/${state.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-purple-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-bold text-gray-900">{state.name}</h3>
                    <span className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700">{state.code}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm text-gray-600">{c?.headline}</p>
                  <span className="mt-3 text-sm font-medium text-purple-700 group-hover:underline">
                    {zh ? `查看${state.name}法规 →` : `View ${state.name} rules →`}
                  </span>
                </Link>
              );
            })}
            {/* 查看更多 → 法律 Hub 二级页 */}
            <Link
              href="/vape-laws/laws"
              className="group flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-purple-300 bg-purple-50/40 p-5 text-center transition-all hover:border-purple-400 hover:bg-purple-50"
            >
              <span className="text-base font-bold text-purple-800">{zh ? '查看更多' : 'View more'}</span>
              <span className="mt-1 text-xs text-purple-600">
                {zh ? '更多美国各州电子烟相关法律' : 'More US state vaping rules'}
              </span>
              <ArrowRight className="mt-2 h-5 w-5 text-purple-500 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>

        {/* 筛选条 */}
        <section className="mt-8 flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-xl border border-purple-300">
            <button
              type="button"
              onClick={() => setSiteTab('domestic')}
              className={`px-6 py-2.5 text-sm font-semibold transition-colors ${siteTab === 'domestic' ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 hover:bg-purple-50'}`}
            >
              {zh ? '美国商城' : 'US Stores'}
            </button>
            <button
              type="button"
              onClick={() => setSiteTab('international')}
              className={`px-6 py-2.5 text-sm font-semibold transition-colors ${siteTab === 'international' ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 hover:bg-purple-50'}`}
            >
              {zh ? '国际商城' : 'International Stores'}
            </button>
          </div>

          <div className="relative">
            <select
              value={shipFilter}
              onChange={(e) => setShipFilter(e.target.value as ShipFilter)}
              className="appearance-none rounded-xl border border-gray-300 bg-white py-2.5 pl-4 pr-9 text-sm font-medium text-gray-700 hover:border-purple-300 focus:outline-none"
            >
              <option value="all">{zh ? '不限发货仓' : 'Any warehouse'}</option>
              <option value="us_warehouse">{zh ? '美国仓发货' : 'Ships from US warehouse'}</option>
              <option value="intl_warehouse">{zh ? '国际仓发货' : 'Ships from international warehouse'}</option>
            </select>
            <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-gray-400" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-500">{zh ? '我的收货地' : 'Ship to'}</span>
            <div className="relative">
              <select
                value={mounted ? stateCode : ''}
                onChange={(e) => {
                  const code = e.target.value;
                  setStateCode(code);
                  try {
                    if (code) localStorage.setItem(STATE_STORAGE_KEY, code);
                    else localStorage.removeItem(STATE_STORAGE_KEY);
                  } catch { /* ignore */ }
                }}
                className="appearance-none rounded-xl border border-gray-300 bg-white py-2.5 pl-4 pr-9 text-sm font-medium text-gray-700 hover:border-purple-300 focus:outline-none min-w-[150px]"
              >
                <option value="">{zh ? '选择州' : 'Select state'}</option>
                {ALL_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{zh ? s.name : s.name}</option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-gray-400" />
            </div>
          </div>
        </section>

        {/* 商品网格 */}
        {loading ? (
          <div className="py-24 text-center text-sm text-gray-400">{zh ? '加载中…' : 'Loading…'}</div>
        ) : pageItems.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
            <p className="text-sm text-gray-500">
              {zh
                ? '当前筛选下暂无可售商品。后台为 USD 商城配置「分类/发货地」后才会在此展示。'
                : 'No eligible products under these filters yet. Configure US-zone category & warehouse for USD stores in the admin to list them here.'}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {pageItems.map(({ product, prices }, idx) => {
                const t = getTranslation(product.translations, language);
                const sorted = [...prices].sort((a, b) => parseFloat(displayPrice(a)) - parseFloat(displayPrice(b)));
                const lowest = sorted[0];
                const originals = prices.map((p) => (p.original_price ? parseFloat(p.original_price) : NaN)).filter((n) => !Number.isNaN(n));
                const highestOrig = originals.length ? Math.max(...originals).toFixed(2) : null;
                const singleDiscount = prices.length === 1 && highestOrig && parseFloat(displayPrice(prices[0])) < parseFloat(highestOrig)
                  ? Math.round((parseFloat(highestOrig) - parseFloat(displayPrice(prices[0]))) / parseFloat(highestOrig) * 100)
                  : null;
                return (
                  <BorderBeam
                    key={product.id}
                    color={[{ color: '#2f54eb', percent: 0 }, { color: '#722ed1', percent: 44 }, { color: '#ff85c0', percent: 100 }]}
                    size={120}
                    duration={4}
                    lineWidth={1}
                    outset={0}
                  >
                    <div className="group hover-border-beam relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
                      <Link
                        href={`/product/${product.slug}`}
                        className="relative block aspect-square overflow-hidden bg-gray-50"
                        onClick={() => {
                          const sid = sessionStorage.getItem('vp_session_id') || '';
                          fetch('/api/track', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type: 'product_click', session_id: sid, product_id: product.id }),
                          }).catch(() => {});
                        }}
                      >
                        {(product.home_image_url || product.image_url) && (
                          <SafeImage
                            src={product.home_image_url || product.image_url_small || product.image_url}
                            alt={t?.name || ''}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                            sizes="(max-width:640px) 50vw, 20vw"
                            loading={idx < 5 ? 'eager' : 'lazy'}
                          />
                        )}
                        {singleDiscount != null && (
                          <div className="absolute left-2 top-2 z-10 rounded-lg bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                            -{singleDiscount}%
                          </div>
                        )}
                      </Link>
                      <div className="p-3">
                        <Link href={`/product/${product.slug}`}>
                          <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-gray-900 group-hover:text-purple-700 sm:text-sm">
                            {t?.name}
                          </h3>
                        </Link>
                        <div className="mt-1.5 flex items-baseline gap-2">
                          <span className="text-base font-bold tabular-nums text-emerald-600 sm:text-2xl">
                            ${displayPrice(lowest)}
                          </span>
                          {prices.length >= 2 && (
                            <span className="text-xs font-medium text-emerald-600">{zh ? '最低价' : 'Lowest'}</span>
                          )}
                          {prices.length < 2 && highestOrig && parseFloat(highestOrig) > parseFloat(displayPrice(lowest)) && (
                            <span className="text-xs text-gray-400 line-through tabular-nums sm:text-sm">${highestOrig}</span>
                          )}
                        </div>
                        <div className="mt-2 hidden space-y-1.5 sm:block">
                          {sorted.slice(0, 3).map((price) => {
                            const st = getTranslation(price.store?.translations, language);
                            return (
                              <div key={price.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-purple-50">
                                    {price.store?.logo_url ? (
                                      <img
                                        src={price.store.logo_url.startsWith('http') ? price.store.logo_url : `/api/image?key=${encodeURIComponent(price.store.logo_url)}`}
                                        alt=""
                                        className="h-full w-full object-contain"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <span className="text-[10px] font-bold text-purple-600">{st?.name?.charAt(0) || '?'}</span>
                                    )}
                                  </div>
                                  <span className="truncate text-xs text-gray-500">{st?.name || 'Store'}</span>
                                </div>
                                <div className="flex flex-shrink-0 items-center gap-2">
                                  <span className="text-xs font-semibold tabular-nums text-emerald-600">${displayPrice(price)}</span>
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
                                        body: JSON.stringify({ type: 'buy_click', session_id: sid, product_id: price.product_id, store_id: price.store_id }),
                                      }).catch(() => {});
                                    }}
                                    className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 transition-all hover:bg-purple-700 hover:text-white"
                                  >
                                    {zh ? '购买' : 'Buy'}
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                          {sorted.length > 3 && (
                            <Link href={`/product/${product.slug}`} className="block py-1 text-center text-xs text-purple-700 hover:underline">
                              {zh ? `查看全部 ${sorted.length} 家商城` : `View all ${sorted.length} stores`}
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </BorderBeam>
                );
              })}
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="rounded-lg border border-gray-300 p-2 disabled:opacity-40"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    className={`h-9 w-9 rounded-lg text-sm font-medium ${safePage === i + 1 ? 'bg-purple-600 text-white' : 'border border-gray-300 text-gray-600 hover:border-purple-300'}`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="rounded-lg border border-gray-300 p-2 disabled:opacity-40"
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
