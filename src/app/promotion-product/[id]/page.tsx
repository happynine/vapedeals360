'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { ProductDetailClient, Product, ProductPrice, Store, StoreTranslation } from '@/components/product-detail-client';

export default function PromotionProductPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const productId = params.id as string;
  const promotionSlug = searchParams.get('promotion');

  const [rawData, setRawData] = useState<{
    product: Record<string, unknown>;
    promotion: Record<string, unknown> | null;
  } | null>(null);
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
      setRawData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [productId, promotionSlug]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  // Map promotion product data to standard Product interface
  const product: Product | null = useMemo(() => {
    if (!rawData?.product) return null;

    const pp = rawData.product as {
      id: number;
      slug: string | null;
      category_id: number | null;
      image_key: string | null;
      image_url: string | null;
      is_active: boolean | null;
      is_featured: boolean | null;
      notes: string | null;
      promotion_product_translations: {
        id: number;
        name: string | null;
        description: string | null;
        language: string;
        features?: string | null;
        specs?: string | null;
      }[];
      store_prices: {
        id: number;
        store_id: number | null;
        region: string | null;
        current_price: number | null;
        original_price: number | null;
        discount_percent: number | null;
        currency: string | null;
        product_url: string | null;
        no_quote: boolean | null;
        store_type: string;
        time_type: string;
        end_time: string | null;
        countdown_action: string;
        store?: {
          id: number;
          name: string;
          icon_url: string | null;
          logo_url: string | null;
          store_url: string | null;
          translations?: { id: number; name: string; language: string }[];
        };
      }[];
    };

    // Filter promotion prices (only show promotion store type, and not closed)
    const filteredPrices = (pp.store_prices || []).filter(p => {
      if (p.store_type !== 'promotion') return false;
      if (!p.store_id || !p.current_price || p.no_quote) return false;
      // Filter out prices where countdown has ended with 'close' action
      if (p.time_type !== 'permanent' && p.end_time && p.countdown_action === 'close') {
        if (new Date(p.end_time).getTime() <= Date.now()) return false;
      }
      return true;
    });

    // Map prices to ProductPrice interface
    const mappedPrices = filteredPrices.map(p => ({
      id: p.id,
      product_id: pp.id,
      store_id: p.store_id as number || 0,
      current_price: String(p.current_price),
      original_price: p.original_price ? String(p.original_price) : null,
      product_url: p.product_url || '',
      in_stock: true,
      discount_percent: p.discount_percent,
      currency: p.currency || '$',
      region: p.region,
      no_quote: false,
      store: p.store ? {
        id: p.store.id,
        slug: String(p.store.id),
        logo_url: p.store?.logo_url || p.store?.icon_url || null,
        website_url: p.store?.store_url || null,
        store_type: p.store_type,
        is_active: true,
        translations: (p.store?.translations || []).map((t: Record<string, unknown>) => ({
          id: t.id as number,
          store_id: p.store?.id as number,
          language: t.language as string,
          name: t.name as string,
        })),
      } as Store : undefined,
    })) as ProductPrice[];

    // Map translations to ProductTranslation interface
    const mappedTranslations = (pp.promotion_product_translations || []).map(t => ({
      id: t.id,
      product_id: pp.id,
      language: t.language,
      name: t.name || pp.slug || '',
      description: t.description || null,
      features: t.features || null,
      specs: t.specs || null,
    }));

    return {
      id: pp.id,
      slug: pp.slug || '',
      category_id: pp.category_id,
      image_url: pp.image_key || pp.image_url || null,
      images: null,
      is_active: pp.is_active ?? true,
      is_featured: pp.is_featured ?? false,
      created_at: new Date().toISOString(),
      updated_at: null,
      translations: mappedTranslations,
      prices: mappedPrices,
      category: null,
    } satisfies Product;
  }, [rawData]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <div className="mx-auto max-w-[1380px] px-4 py-8 bg-white flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="aspect-square rounded-2xl bg-gray-100 animate-pulse" />
            <div className="space-y-4">
              <div className="h-8 w-3/4 rounded bg-gray-100 animate-pulse" />
              <div className="h-12 w-1/3 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <div className="min-h-[50vh] flex items-center justify-center bg-white flex-1">
          <div className="text-center">
            <p className="text-lg text-gray-400">Product not found</p>
            <Link href="/" className="mt-4 inline-block text-purple-700 hover:underline">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader activeTab="vape-deals" />
      <ProductDetailClient product={product} />
    </div>
  );
}
