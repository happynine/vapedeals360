import { NextRequest, NextResponse } from 'next/server';
import { gunzipSync } from 'node:zlib';
import { getServiceRoleClient } from '@/storage/database/supabase-client';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { parseAwinCsv, dedupeFeedItems, type NormalizedFeedItem } from '@/lib/awin-feed';
import {
  buildPreview,
  slugify,
  type DbCategoryRow,
  type DbPriceRow,
  type DbProductRow,
} from '@/lib/awin-compare';
import { buildPromoMap } from '@/lib/promo-page';
/**
 * Decompress gzip content when the uploaded bytes look gzipped (magic 1f 8b).
 */
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
/**
 * Parse user-supplied category overrides. Accepts either a JSON object
 * (feed category -> internal category slug) or one mapping per line in the
 * form "Feed Category = target-slug". Invalid entries are silently dropped.
 */
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
interface AdvertiserContext {
  advertiserId: string;
  advertiserName: string;
  storeId: number;
  storeName: string;
}
/**
 * Resolve the Awin advertiser to an internal store. Explicit form fields take
 * precedence; otherwise find a store whose slug/name matches the advertiser,
 * and as a last resort create a new store for it.
 */
async function resolveStore(
  supabase: ReturnType<typeof getServiceRoleClient>,
  advertiserId: string,
  advertiserName: string,
  explicitStoreId: string,
): Promise<AdvertiserContext> {
  if (explicitStoreId) {
    const id = Number.parseInt(explicitStoreId, 10);
    if (Number.isFinite(id)) {
      const { data: store } = await supabase
        .from('stores')
        .select('id, slug')
        .eq('id', id)
        .maybeSingle();
      if (store) {
        const name = await getStoreName(supabase, id);
        return { advertiserId, advertiserName, storeId: id, storeName: name };
      }
    }
  }
  const slug = slugify(advertiserName);
  // Try matching an existing store by slug.
  const { data: bySlug } = await supabase
    .from('stores')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (bySlug) {
    const name = await getStoreName(supabase, bySlug.id);
    return { advertiserId, advertiserName, storeId: bySlug.id, storeName: name };
  }
  // Try translation name match.
  const { data: byName } = await supabase
    .from('store_translations')
    .select('store_id, name')
    .eq('name', advertiserName)
    .eq('language', 'en')
    .maybeSingle();
  if (byName) {
    const name = await getStoreName(supabase, byName.store_id);
    return {
      advertiserId,
      advertiserName,
      storeId: byName.store_id,
      storeName: name,
    };
  }
  // Create a new store for the advertiser.
  const { data: created, error } = await supabase
    .from('stores')
    .insert({ slug, website_url: '', is_active: true })
    .select('id')
    .single();
  if (error || !created) {
    throw new Error(`Failed to create store for "${advertiserName}": ${error?.message}`);
  }
  await supabase.from('store_translations').insert({
    store_id: created.id,
    language: 'en',
    name: advertiserName,
  });
  return {
    advertiserId,
    advertiserName,
    storeId: created.id,
    storeName: advertiserName,
  };
}
async function getStoreName(
  supabase: ReturnType<typeof getServiceRoleClient>,
  storeId: number,
): Promise<string> {
  const { data } = await supabase
    .from('store_translations')
    .select('name')
    .eq('store_id', storeId)
    .eq('language', 'en')
    .maybeSingle();
  return data?.name || `Store #${storeId}`;
}
export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const explicitStoreId = (formData.get('store_id') as string) || '';
    const currency = (formData.get('currency') as string) || 'USD';
    const promoUrlsRaw = (formData.get('promo_urls') as string) || '';
    const categoryOverridesRaw =
      (formData.get('category_overrides') as string) || '';
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No feed file uploaded' },
        { status: 400 },
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = maybeGunzip(bytes);
    const feedItems: NormalizedFeedItem[] = dedupeFeedItems(parseAwinCsv(text, currency));
    if (feedItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No products found in feed file' },
        { status: 400 },
      );
    }
    // Fetch promotion pages (non-fatal).
    const { map: promoMap, errors: promoErrors } = await buildPromoMap(
      parsePromoUrls(promoUrlsRaw),
    );
    // All rows in one Awin feed belong to the same advertiser.
    const advertiserId =
      feedItems.find((f) => f.merchantId)?.merchantId || '';
    const advertiserName =
      feedItems.find((f) => f.merchantName)?.merchantName || 'Unknown Advertiser';
    const supabase = getServiceRoleClient();
    const ctx = await resolveStore(
      supabase,
      advertiserId,
      advertiserName,
      explicitStoreId,
    );
    // Fetch current catalog state.
    const { data: productRows, error: productError } = await supabase
      .from('products')
      .select('id, slug, image_url, aw_product_id, merchant_product_id');
    if (productError) throw productError;
    const { data: translationRows, error: translationError } = await supabase
      .from('product_translations')
      .select('product_id, language, name, description')
      .eq('language', 'en');
    if (translationError) throw translationError;
    const { data: priceRows, error: priceError } = await supabase
      .from('product_prices')
      .select('id, product_id, store_id, current_price, product_url, in_stock, currency');
    if (priceError) throw priceError;
    const { data: categoryRows, error: categoryError } = await supabase
      .from('categories')
      .select('id, slug');
    if (categoryError) throw categoryError;
    const { data: categoryTranslationRows, error: ctError } = await supabase
      .from('category_translations')
      .select('category_id, language, name')
      .eq('language', 'en');
    if (ctError) throw ctError;
    // Merge translations into the products.
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
    // Merge category translations.
    const ctById = new Map(
      (categoryTranslationRows ?? []).map((c) => [c.category_id, c]),
    );
    const categories: DbCategoryRow[] = (categoryRows ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: ctById.get(c.id)?.name ?? null,
    }));
    const result = buildPreview({
      advertiserId,
      advertiserName,
      targetStoreId: ctx.storeId,
      targetStoreName: ctx.storeName,
      feedItems,
      products,
      prices,
      categories,
      promoMap,
      categoryOverrides: parseCategoryOverrides(categoryOverridesRaw),
    });
    return NextResponse.json({
      success: true,
      advertiserId,
      advertiserName,
      storeId: ctx.storeId,
      storeName: ctx.storeName,
      generatedAt: new Date().toISOString(),
      totals: result.totals,
      entries: result.entries,
      categoryGroups: result.categoryGroups,
      categoryOverrides: result.categoryOverrides,
      internalCategories: categories.map((c) => ({
        slug: c.slug,
        name: c.name || c.slug,
      })),
      promoCount: result.promoCount,
      unmappedCategories: result.unmappedCategories,
      promoErrors,
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
