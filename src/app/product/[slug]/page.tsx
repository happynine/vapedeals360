'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

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

function getTranslation<T extends { language: string }>(translations: T[], language: string): T {
  return translations.find((t) => t.language === language) || translations.find((t) => t.language === 'en') || translations[0];
}

export default function ProductDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [product, setProduct] = useState<Product | null>(null);
  const [language, setLanguage] = useState<string>('en');
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="aspect-square rounded-2xl bg-secondary animate-pulse" />
            <div className="space-y-4">
              <div className="h-8 w-3/4 rounded bg-secondary animate-pulse" />
              <div className="h-12 w-1/3 rounded bg-secondary animate-pulse" />
              <div className="h-4 w-full rounded bg-secondary animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">{language === 'zh' ? '产品未找到' : 'Product not found'}</p>
          <Link href="/" className="mt-4 inline-block text-primary hover:underline">{language === 'zh' ? '返回首页' : 'Back to Home'}</Link>
        </div>
      </div>
    );
  }

  const t = getTranslation(product.translations, language);
  const catT = product.category ? getTranslation(product.category.translations, language) : null;
  const features: string[] = t?.features ? (typeof t.features === 'string' ? JSON.parse(t.features) : t.features) : [];
  const specs: Record<string, string> = t?.specs ? (typeof t.specs === 'string' ? JSON.parse(t.specs) : t.specs) : {};
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
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">{language === 'zh' ? '首页' : 'Home'}</Link>
          <span>/</span>
          {catT && <span className="hover:text-foreground">{catT.name}</span>}
          {catT && <span>/</span>}
          <span className="text-foreground truncate">{t?.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Image Gallery */}
          <div>
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-secondary border border-border">
              {selectedImage && (
                <Image src={selectedImage} alt={t?.name || ''} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" priority />
              )}
              {discount && (
                <div className="absolute top-4 left-4 z-10 rounded-xl bg-destructive px-4 py-1.5 text-lg font-bold text-white animate-pulse-deal">
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
                    className={`relative h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${selectedImage === img ? 'border-primary' : 'border-border hover:border-primary/50'}`}
                  >
                    <Image src={img} alt="" fill className="object-cover" sizes="64px" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Product Info */}
          <div>
            {/* Category badge */}
            {catT && (
              <span className="inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent mb-3">
                {catT.name}
              </span>
            )}

            <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
              {t?.name}
            </h1>

            {/* Price Summary */}
            <div className="mt-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-green-400 tabular-nums">
                  ${lowestPrice?.current_price || '—'}
                </span>
                {highestOriginal > 0 && (
                  <span className="text-lg text-muted-foreground line-through tabular-nums">
                    ${highestOriginal.toFixed(2)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {language === 'zh' ? '最低价，来自' : 'Lowest price from'} {sortedPrices.length} {language === 'zh' ? '家商城' : 'stores'}
              </p>
              {discount && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-lg bg-green-400/10 px-3 py-1 text-sm font-semibold text-green-400">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                  {language === 'zh' ? `省 $${(highestOriginal - parseFloat(lowestPrice?.current_price || '0')).toFixed(2)}` : `Save $${(highestOriginal - parseFloat(lowestPrice?.current_price || '0')).toFixed(2)}`}
                </div>
              )}
            </div>

            {/* Description */}
            {t?.description && (
              <div className="mt-6">
                <h2 className="text-lg font-semibold text-foreground mb-2">
                  {language === 'zh' ? '产品描述' : 'Description'}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{t.description}</p>
              </div>
            )}

            {/* Features */}
            {features.length > 0 && (
              <div className="mt-6">
                <h2 className="text-lg font-semibold text-foreground mb-2">
                  {language === 'zh' ? '产品亮点' : 'Key Features'}
                </h2>
                <ul className="space-y-2">
                  {features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <svg className="h-4 w-4 flex-shrink-0 mt-0.5 text-accent" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
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
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            {language === 'zh' ? '价格对比' : 'Price Comparison'}
          </h2>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-secondary/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                  className={`grid grid-cols-12 gap-4 px-5 py-4 items-center border-t border-border transition-colors hover:bg-secondary/30 ${isLowest ? 'bg-green-400/5' : ''}`}
                >
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold text-accent">
                      {st?.name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-foreground">{st?.name || 'Store'}</span>
                      {isLowest && (
                        <span className="ml-2 inline-block rounded bg-green-400/10 px-1.5 py-0.5 text-[10px] font-bold text-green-400">
                          {language === 'zh' ? '最低价' : 'LOWEST'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`text-lg font-bold tabular-nums ${isLowest ? 'text-green-400' : 'text-foreground'}`}>
                      ${price.current_price}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    {price.original_price ? (
                      <span className="text-sm text-muted-foreground line-through tabular-nums">${price.original_price}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="col-span-2 text-center">
                    {priceDiscount ? (
                      <span className="inline-block rounded-md bg-destructive/10 px-2 py-0.5 text-sm font-semibold text-destructive">
                        -{priceDiscount}%
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="col-span-2 text-center">
                    <a
                      href={price.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all hover:scale-105"
                    >
                      {language === 'zh' ? '前往购买' : 'Visit Store'}
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Specs Table */}
        {Object.keys(specs).length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
              <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              {language === 'zh' ? '规格参数' : 'Specifications'}
            </h2>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {Object.entries(specs).map(([key, value], idx) => (
                <div
                  key={key}
                  className={`flex items-center px-5 py-3 ${idx > 0 ? 'border-t border-border' : ''} ${idx % 2 === 0 ? 'bg-secondary/20' : ''}`}
                >
                  <span className="w-40 flex-shrink-0 text-sm font-medium text-muted-foreground">{key}</span>
                  <span className="text-sm text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back to Home */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            {language === 'zh' ? '返回首页' : 'Back to All Deals'}
          </Link>
        </div>
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
