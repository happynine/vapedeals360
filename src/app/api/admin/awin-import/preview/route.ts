import { NextRequest, NextResponse } from 'next/server';
import { gunzipSync } from 'node:zlib';
import { getServiceRoleClient } from '@/storage/database/supabase-client';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { parseAwinCsv, dedupeFeedItems } from '@/lib/awin-feed';
import {
  buildPreview,
  type DbCategoryRow,
  type DbExternalIdRow,
  type DbPriceRow,
  type DbProductRow,
} from '@/lib/awin-compare';
import { parseStoreCapabilities } from '@/lib/store-capabilities';
import { buildPromoMap } from '@/lib/promo-page';
import {
  fetchWcCatalog,
  isPlaceholderImage,
  originOf,
} from '@/lib/woo-enrich';
import { getStoreProfile, allStoreProfiles } from '@/lib/store-profiles';
import type {
  AdvertiserInfo,
  AdvertiserMapping,
  StoreInfo,
} from '@/lib/awin-import-types';

/** Decompress gzip content when the uploaded bytes look gzipped (magic 1f 8b). */
function maybeGunzip(bytes: Uint8Array): string {
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const buf = isGzip ? gunzipSync(Buffer.from(bytes)) : Buffer.from(bytes);
  return buf.toString('utf8');
}

/** Split a newline-separated promo URL list into trimmed unique URLs. */
function parsePromoUrls(raw: string): string[] {
  return raw
    .split(/[\r\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Parse user category overrides (JSON or "feed = slug" per line). */
function parseCategoryOverrides(raw: string): Record<string, string> {
  const text = raw.trim();
  if (!text) return {};
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object') {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (typeof k === 'string' && typeof v === 'string' && v.trim()) {
            out[k.trim()] = v.trim();
          }
        }
        return out;
      }
    } catch {
      // fall through to line parsing
    }
  }
  const out: Record<string, string> = {};
  for (const line of text.split(/[\r\n]+/)) {
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

/** Parse the mappings JSON blob the panel sends: advertiserId -> mapping. */
function parseMappings(raw: string): Record<string, AdvertiserMapping> {
  if (!raw.trim()) return {};
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') return obj as Record<string, AdvertiserMapping>;
  } catch {
    // ignore malformed
  }
  return {};
}

/** Built-in mapping defaults before the user configures an advertiser. */
const DEFAULT_MAPPINGS: Record<string, AdvertiserMapping> = {
  '50315': { storeId: 1, region: 'USA', currency: 'USD' },
};

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const promoUrlsRaw = (formData.get('promo_urls') as string) || '';
    const categoryOverridesRaw =
      (formData.get('category_overrides') as string) || '';
    const mappingsRaw = (formData.get('mappings') as string) || '';
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No feed file uploaded' },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = maybeGunzip(bytes);
    const feedItems = dedupeFeedItems(parseAwinCsv(text, 'USD'));
    if (feedItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No products found in feed file' },
        { status: 400 },
      );
    }

    const supabase = getServiceRoleClient();

    // Advertisers discovered in the file (first-seen order).
    const order: string[] = [];
    const meta = new Map<
      string,
      { name: string; count: number; currency: string }
    >();
    for (const f of feedItems) {
      const key = f.merchantId || f.merchantName || 'unknown';
      const row = meta.get(key);
      if (!row) {
        order.push(key);
        meta.set(key, { name: f.merchantName || 'Unknown Advertiser', count: 1, currency: f.currency });
      } else {
        row.count++;
      }
    }

    // Existing server-side mappings (table may not exist yet → empty).
    const dbMappings = new Map<string, AdvertiserMapping & { advertiserName?: string; feedUrl?: string }>();
    const { data: mappingRows } = await supabase
      .from('awin_advertiser_mappings')
      .select('advertiser_id, advertiser_name, region, currency, store_id, feed_url');
    for (const m of mappingRows ?? []) {
      dbMappings.set(m.advertiser_id, {
        storeId: m.store_id,
        region: m.region,
        currency: m.currency,
        advertiserName: m.advertiser_name || '',
        feedUrl: m.feed_url || '',
      });
    }

    // Persisted category mappings (table absent until migration → empty).
    let savedCategoryMappings: Array<{
      advertiser_id: string | null;
      feed_category: string;
      category_slug: string;
    }> = [];
    const catMapRes = await supabase
      .from('awin_category_mappings')
      .select('advertiser_id, feed_category, category_slug');
    if (!catMapRes.error) savedCategoryMappings = catMapRes.data ?? [];

    const clientMappings = parseMappings(mappingsRaw);

    // Resolve effective mapping per advertiser: client choice > DB > default.
    const effective: Record<string, AdvertiserMapping | null> = {};
    for (const adv of order) {
      effective[adv] =
        clientMappings[adv] ?? dbMappings.get(adv) ?? DEFAULT_MAPPINGS[adv] ?? null;
    }

    // Only advertisers actually present in this file gate readiness; saved
    // extras with zero products must not block the preview.
    const allMapped = order.every((adv) => {
      const m = effective[adv];
      return !!m && !!m.storeId && !!m.region && !!m.currency;
    });

    const fileAdvertisers: AdvertiserInfo[] = order.map((adv) => {
      const m = meta.get(adv)!;
      return {
        advertiserId: adv,
        advertiserName: m.name,
        productCount: m.count,
        suggestedCurrency: m.currency,
        mapping: effective[adv],
      };
    });

    // Advertisers saved earlier but absent from THIS file (e.g. added manually,
    // or a different feed). Keep them visible and editable, with zero products.
    const extraAdvertisers: AdvertiserInfo[] = [];
    for (const [adv, m] of dbMappings) {
      if (order.includes(adv)) continue;
      extraAdvertisers.push({
        advertiserId: adv,
        advertiserName: m.advertiserName || adv,
        productCount: 0,
        suggestedCurrency: m.currency,
        mapping: { storeId: m.storeId, region: m.region, currency: m.currency },
      });
    }
    // Stable order: advertisers present in the file first, then saved extras.
    const advertisers = [...fileAdvertisers, ...extraAdvertisers];

    // Internal stores for the mapping dropdowns.
    const { data: storeRows } = await supabase
      .from('stores')
      .select('id, slug, logo_url, store_type, regions, store_translations(name, language)');
    const stores: StoreInfo[] = (storeRows ?? [])
      .map((s: any) => {
        const caps = parseStoreCapabilities(s.regions);
        const en = (s.store_translations ?? []).find(
          (t: any) => t.language === 'en',
        );
        return {
          id: s.id,
          slug: s.slug,
          name: en?.name || s.slug,
          logoUrl: s.logo_url ?? null,
          regions: caps.regions,
          currencies: caps.currencies,
        };
      })
      .sort((a: StoreInfo, b: StoreInfo) =>
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
      );

    const baseResponse = {
      success: true,
      advertisers,
      stores,
      generatedAt: new Date().toISOString(),
      categoryOverrides: parseCategoryOverrides(categoryOverridesRaw),
      savedCategoryMappings,
      storeProfiles: allStoreProfiles(),
    };


    if (!allMapped) {
      return NextResponse.json({
        ...baseResponse,
        ready: false,
        totals: {},
        entries: [],
        categoryGroups: [],
        promoCount: 0,
        unmappedCategories: [],
        promoErrors: [],
        internalCategories: [],
      });
    }

    // All advertisers mapped → build targets and compute the full preview.
    const storeById = new Map<number, StoreInfo>(stores.map((s) => [s.id, s]));
    const targets = order.map((adv) => {
      const m = effective[adv]!;
      const s = storeById.get(m.storeId);
      return {
        advertiserId: adv,
        advertiserName: meta.get(adv)!.name,
        storeId: m.storeId,
        storeName: s?.name || s?.slug || `Store #${m.storeId}`,
        region: m.region,
      };
    });

    // Promotion pages (non-fatal).
    const { map: promoMap, errors: promoErrors } = await buildPromoMap(
      parsePromoUrls(promoUrlsRaw),
    );

    // Catalog state.
    const { data: productRows, error: productError } = await supabase
      .from('products')
      .select('id, slug, image_url, aw_product_id, merchant_product_id');
    if (productError) throw productError;
    const { data: translationRows, error: translationError } = await supabase
      .from('product_translations')
      .select('product_id, name, description')
      .eq('language', 'en');
    if (translationError) throw translationError;
    const { data: priceRows, error: priceError } = await supabase
      .from('product_prices')
      .select('id, product_id, store_id, current_price, original_price, discount_percent, product_url, in_stock, currency, region');
    if (priceError) throw priceError;
    const { data: categoryRows, error: categoryError } = await supabase
      .from('categories')
      .select('id, slug');
    if (categoryError) throw categoryError;
    const { data: categoryTranslationRows, error: ctError } = await supabase
      .from('category_translations')
      .select('category_id, name')
      .eq('language', 'en');
    if (ctError) throw ctError;
    // External ids (table absent until migration → empty, matching degrades).
    let externalIds: DbExternalIdRow[] = [];
    const extRes = await supabase
      .from('product_external_ids')
      .select('product_id, network, advertiser_id, aw_product_id, merchant_product_id');
    if (!extRes.error) externalIds = extRes.data ?? [];

    const trByProduct = new Map(
      (translationRows ?? []).map((t) => [t.product_id, t]),
    );
    const products: DbProductRow[] = (productRows ?? []).map((p) => {
      const t = trByProduct.get(p.id);
      return {
        id: p.id,
        slug: p.slug,
        image_url: p.image_url,
        aw_product_id: p.aw_product_id ?? null,
        merchant_product_id: p.merchant_product_id ?? null,
        name: t?.name ?? null,
        description: t?.description ?? null,
      };
    });
    const prices: DbPriceRow[] = priceRows ?? [];
    const ctById = new Map(
      (categoryTranslationRows ?? []).map((c) => [c.category_id, c]),
    );
    const categories: DbCategoryRow[] = (categoryRows ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: ctById.get(c.id)?.name ?? null,
    }));

    // Best-effort WooCommerce enrichment for advertisers whose feed rows only
    // carry placeholder images. One catalog fetch per store origin; failures
    // never block the preview.
    const wooEnrichment = new Map<
      string,
      { imageUrl: string; categorySlugs: string[] }
    >();
    if (feedItems.some((f) => isPlaceholderImage(f.imageUrl))) {
      const originByAdv = new Map<string, string>();
      for (const f of feedItems) {
        const adv = f.merchantId || f.merchantName;
        if (!adv || originByAdv.has(adv)) continue;
        // Prefer the store's proven profile; fall back to feed-URL derivation.
        const profile = getStoreProfile(adv);
        const origin =
          profile?.origin || originOf(f.merchantUrl || f.deepLink);
        if (origin) originByAdv.set(adv, origin);
      }
      for (const [adv, origin] of originByAdv) {
        try {
          const catalog = await fetchWcCatalog(origin);
          if (!catalog) continue;
          for (const f of feedItems) {
            const fAdv = f.merchantId || f.merchantName;
            if (fAdv !== adv || !f.merchantProductId) continue;
            const wcId = Number.parseInt(f.merchantProductId, 10);
            if (!Number.isFinite(wcId)) continue;
            const data = catalog.get(wcId);
            if (data && (data.imageUrl || data.categorySlugs.length)) {
              wooEnrichment.set(`${adv}::${f.merchantProductId}`, data);
            }
          }
        } catch {
          // ignore — fall back to feed-only data for this store.
        }
      }
    }

    const result = buildPreview({
      targets,
      feedItems,
      products,
      prices,
      categories,
      stores: targets.length
        ? stores.map((s) => ({ id: s.id, slug: s.slug, name: s.name, logoUrl: s.logoUrl ?? null }))
        : [],
      externalIds,
      promoMap,
      categoryOverrides: baseResponse.categoryOverrides,
      savedCategoryMappings,
      wooEnrichment,
    });

    return NextResponse.json({
      ...baseResponse,
      ready: true,
      totals: result.totals,
      entries: result.entries,
      categoryGroups: result.categoryGroups,
      promoCount: result.promoCount,
      unmappedCategories: result.unmappedCategories,
      promoErrors,
      internalCategories: categories.map((c) => ({
        slug: c.slug,
        name: c.name || c.slug,
      })),
    });
  } catch (error) {
    console.error('Awin preview error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Preview failed',
      },
      { status: 500 },
    );
  }
}
