'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';

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

function getTranslation<T extends { language: string }>(translations: T[] | undefined | null, language: string): T | undefined {
  if (!translations || translations.length === 0) return undefined;
  return translations.find((t) => t.language === language) || translations.find((t) => t.language === 'en') || translations[0];
}

function getLowestPrice(prices: ProductPrice[]): ProductPrice | null {
  if (!prices || prices.length === 0) return null;
  return prices.reduce((min, p) => parseFloat(p.current_price) < parseFloat(min.current_price) ? p : min, prices[0]);
}

function getHighestOriginal(prices: ProductPrice[]): string | null {
  if (!prices || prices.length === 0) return null;
  const originals = prices.filter((p) => p.original_price).map((p) => parseFloat(p.original_price!));
  return originals.length > 0 ? Math.max(...originals).toFixed(2) : null;
}

interface Banner {
  id: number;
  image_url: string | null;
  link_url: string | null;
  title: string | null;
  subtitle: string | null;
}

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [language, setLanguage] = useState<string>('en');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        language,
        page: page.toString(),
        limit: '20',
      });
      if (selectedCategory) {
        params.set('category_id', selectedCategory.toString());
      }
      const res = await fetch(`/api/products?${params}`);
      const json = await res.json();
      if (json.success) {
        setCategories(json.data.categories || []);
        setProducts(json.data.products || []);
        setTotalPages(json.data.pagination?.totalPages || 1);
        setTotal(json.data.pagination?.total || 0);
      }
      // Fetch featured
      const featRes = await fetch(`/api/products?featured=true&limit=5&language=${language}`);
      const featJson = await featRes.json();
      if (featJson.success) {
        setFeaturedProducts(featJson.data.products || []);
      }
      // Fetch banners
      const bannerRes = await fetch(`/api/banners?language=${language}`);
      const bannerJson = await bannerRes.json();
      if (bannerJson.success) {
        setBanners(bannerJson.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [language, page, selectedCategory]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredProducts = searchQuery
    ? products.filter((p) => {
        const t = getTranslation(p.translations, language);
        return t?.name?.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : products;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">V</div>
              <span className="text-xl font-bold tracking-tight">VapeDeal</span>
            </Link>

            <div className="flex items-center gap-3">
              {/* Search Bar */}
              <div className="relative w-48 sm:w-64">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  placeholder={language === 'zh' ? '搜索产品...' : 'Search products...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                />
              </div>
              {/* Language Switcher */}
              <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
                <button
                  onClick={() => setLanguage('en')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${language === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  EN
                </button>
                <button
                  onClick={() => setLanguage('zh')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${language === 'zh' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  中文
                </button>
              </div>
              <Link href="/admin" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Admin
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* Banner Carousel */}
        {banners.length > 0 && (
          <div className="mb-8">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
              <BannerCarousel banners={banners} language={language} />
            </div>
          </div>
        )}

        {/* Featured Deals Banner */}
        {featuredProducts.length > 0 && page === 1 && !selectedCategory && !searchQuery && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive animate-pulse-deal">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" /></svg>
                {language === 'zh' ? '今日特价' : 'HOT DEALS'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {featuredProducts.slice(0, 3).map((product) => {
                const t = getTranslation(product.translations, language);
                const lowest = getLowestPrice(product.prices);
                const highestOrig = getHighestOriginal(product.prices);
                const discount = lowest?.original_price
                  ? Math.round(((parseFloat(lowest.original_price) - parseFloat(lowest.current_price)) / parseFloat(lowest.original_price)) * 100)
                  : null;
                return (
                  <Link key={product.id} href={`/product/${product.slug}`} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 card-glow">
                    {discount && (
                      <div className="absolute top-3 right-3 z-10 rounded-lg bg-destructive px-2 py-0.5 text-xs font-bold text-white">
                        -{discount}%
                      </div>
                    )}
                    <div className="flex gap-4">
                      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-secondary">
                        {product.image_url && (
                          <Image src={product.image_url} alt={t?.name || ''} fill className="object-cover" sizes="96px" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">{t?.name}</h3>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-xl font-bold text-green-400 tabular-nums">${lowest?.current_price || '—'}</span>
                          {highestOrig && (
                            <span className="text-sm text-muted-foreground line-through tabular-nums">${highestOrig}</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {product.prices.length} {language === 'zh' ? '家商城比价' : 'stores compared'}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Category Filter */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setSelectedCategory(null); setPage(1); }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${selectedCategory === null ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
            >
              {language === 'zh' ? '全部' : 'All'}
            </button>
            {categories.map((cat) => {
              const ct = getTranslation(cat.translations, language);
              return (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategory(cat.id); setPage(1); }}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${selectedCategory === cat.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
                >
                  {cat.icon} {ct?.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Count */}
        <div className="mb-4 text-sm text-muted-foreground">
          {language === 'zh'
            ? `共 ${total} 个产品`
            : `${total} products found`}
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-4 animate-pulse">
                <div className="h-48 w-full rounded-xl bg-secondary" />
                <div className="mt-4 h-4 w-3/4 rounded bg-secondary" />
                <div className="mt-2 h-6 w-1/2 rounded bg-secondary" />
                <div className="mt-3 space-y-2">
                  <div className="h-8 w-full rounded bg-secondary" />
                  <div className="h-8 w-full rounded bg-secondary" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="h-16 w-16 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
            <p className="mt-4 text-lg text-muted-foreground">{language === 'zh' ? '暂无产品' : 'No products found'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product, idx) => {
              const t = getTranslation(product.translations, language);
              const lowest = getLowestPrice(product.prices);
              const highestOrig = getHighestOriginal(product.prices);
              const discount = lowest?.original_price
                ? Math.round(((parseFloat(lowest.original_price) - parseFloat(lowest.current_price)) / parseFloat(lowest.original_price)) * 100)
                : null;
              const sortedPrices = [...product.prices].sort((a, b) => parseFloat(a.current_price) - parseFloat(b.current_price));

              return (
                <div
                  key={product.id}
                  className="group rounded-2xl border border-border bg-card overflow-hidden card-glow animate-fade-in-up"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  {/* Product Image */}
                  <Link href={`/product/${product.slug}`} className="block relative aspect-square bg-secondary overflow-hidden">
                    {product.image_url && (
                      <Image
                        src={product.image_url}
                        alt={t?.name || ''}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      />
                    )}
                    {discount && (
                      <div className="absolute top-2 left-2 z-10 rounded-lg bg-destructive px-2 py-0.5 text-xs font-bold text-white animate-pulse-deal">
                        -{discount}%
                      </div>
                    )}
                    {product.is_featured && (
                      <div className="absolute top-2 right-2 z-10 rounded-lg bg-primary/90 px-2 py-0.5 text-xs font-semibold text-white">
                        {language === 'zh' ? '精选' : 'Featured'}
                      </div>
                    )}
                  </Link>

                  {/* Product Info */}
                  <div className="p-4">
                    <Link href={`/product/${product.slug}`}>
                      <h3 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                        {t?.name}
                      </h3>
                    </Link>

                    {/* Price */}
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-green-400 tabular-nums">
                        ${lowest?.current_price || '—'}
                      </span>
                      {highestOrig && (
                        <span className="text-sm text-muted-foreground line-through tabular-nums">
                          ${highestOrig}
                        </span>
                      )}
                    </div>

                    {/* Store Price List */}
                    <div className="mt-3 space-y-1.5">
                      {sortedPrices.slice(0, 3).map((price) => {
                        const st = price.store ? getTranslation(price.store.translations, language) : null;
                        return (
                          <div key={price.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-2.5 py-1.5">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="h-5 w-5 flex-shrink-0 rounded bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
                                {st?.name?.charAt(0) || '?'}
                              </div>
                              <span className="text-xs text-muted-foreground truncate">{st?.name || 'Store'}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs font-semibold text-green-400 tabular-nums">${price.current_price}</span>
                              <a
                                href={price.product_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-all"
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
                          className="block text-center text-xs text-primary hover:underline py-1"
                        >
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {language === 'zh' ? '上一页' : 'Previous'}
            </button>
            <span className="px-4 py-2 text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {language === 'zh' ? '下一页' : 'Next'}
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">V</div>
              <span className="text-sm font-semibold">VapeDeal</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {language === 'zh' ? '比较电子烟价格，找到最优惠的交易' : 'Compare vape prices. Find the best deals.'}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Banner Carousel Component
function BannerCarousel({ banners, language }: { banners: Banner[]; language: string }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;

  const banner = banners[current];

  const content = (
    <div className="relative w-full aspect-[21/6] sm:aspect-[21/5] lg:aspect-[21/4] overflow-hidden bg-gradient-to-r from-purple-900 via-purple-800 to-cyan-900">
      {banner.image_url ? (
        <Image
          src={banner.image_url}
          alt={banner.title || 'Banner'}
          fill
          className="object-cover"
          sizes="100vw"
          priority={current === 0}
        />
      ) : null}
      {/* Overlay gradient */}
      <div className={`absolute inset-0 ${banner.image_url ? 'bg-gradient-to-r from-black/60 via-black/20 to-transparent' : ''}`} />
      {/* Text content */}
      <div className="absolute inset-0 flex flex-col justify-center px-6 sm:px-10 lg:px-16">
        {banner.title && (
          <h2 className="text-lg sm:text-2xl lg:text-3xl font-bold text-white drop-shadow-lg max-w-lg">
            {banner.title}
          </h2>
        )}
        {banner.subtitle && (
          <p className="mt-1 sm:mt-2 text-xs sm:text-sm lg:text-base text-white/80 drop-shadow max-w-md">
            {banner.subtitle}
          </p>
        )}
      </div>
      {/* Dots indicator */}
      {banners.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {banners.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrent(idx)}
              className={`h-1.5 rounded-full transition-all ${idx === current ? 'w-6 bg-white' : 'w-1.5 bg-white/50'}`}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (banner.link_url) {
    return (
      <a href={banner.link_url} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }

  return content;
}
