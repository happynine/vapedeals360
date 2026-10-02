import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import type {
  CommitEntry,
  CommitRequest,
  CommitResponse,
} from '@/lib/awin-import-types';

type Supa = ReturnType<typeof getServiceRoleClient>;

/** Original price + derived discount percent for a price payload. */
function originalFields(
  newPrice: number | null,
  newOriginalPrice: number | null,
): { original_price?: number | null; discount_percent?: number | null } {
  if (newOriginalPrice === null) return {};
  let discountPercent: number | null = null;
  if (newPrice !== null && newOriginalPrice > 0 && newPrice < newOriginalPrice) {
    discountPercent = Math.round(
      ((newOriginalPrice - newPrice) / newOriginalPrice) * 1000,
    ) / 10;
  }
  return { original_price: newOriginalPrice, discount_percent: discountPercent };
}

/** Ensure a category exists for the given slug; return its id. */
async function ensureCategory(supabase: Supa, slug: string): Promise<number | null> {
  if (!slug) return null;
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('categories')
    .insert({ slug, is_active: true })
    .select('id')
    .single();
  if (error || !created) return null;
  await supabase.from('category_translations').insert({
    category_id: created.id,
    language: 'en',
    name: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  });
  return created.id;
}

/** Link a product to a category (idempotent). */
async function linkProductCategory(
  supabase: Supa,
  productId: number,
  categoryId: number,
) {
  const { data: existing } = await supabase
    .from('product_categories')
    .select('product_id')
    .eq('product_id', productId)
    .eq('category_id', categoryId)
    .maybeSingle();
  if (!existing) {
    await supabase
      .from('product_categories')
      .insert({ product_id: productId, category_id: categoryId });
  }
}

function eventFor(
  oldPrice: number | null,
  newPrice: number | null,
): { event: string; changePercent: number | null } {
  if (oldPrice === null) return { event: 'new_product', changePercent: null };
  if (newPrice === null) return { event: 'delisted', changePercent: null };
  if (newPrice < oldPrice) {
    return {
      event: 'price_down',
      changePercent: Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(2)),
    };
  }
  if (newPrice > oldPrice) {
    return {
      event: 'price_up',
      changePercent: Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(2)),
    };
  }
  return { event: 'info_changed', changePercent: 0 };
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();

  const body = (await request.json()) as CommitRequest;
  const { mappings, entries, fileName } = body;

  if (!mappings || typeof mappings !== 'object' || !Array.isArray(entries)) {
    return NextResponse.json(
      { success: false, error: 'mappings and entries are required' },
      { status: 400 },
    );
  }

  const supabase = getServiceRoleClient();
  const result: CommitResponse = {
    success: true,
    batchId: null,
    created: 0,
    updated: 0,
    skipped: 0,
    hidden: 0,
    errors: [],
  };

  // Create the audit batch up front (fails loudly if migration not applied).
  const { data: batch, error: batchErr } = await supabase
    .from('awin_import_batches')
    .insert({
      mode: 'mapping',
      source: 'upload',
      file_name: fileName || '',
      advertisers_count: Object.keys(mappings).length,
      products_total: entries.filter((e) => e.kind !== 'missing').length,
      status: 'applied',
    })
    .select('id')
    .single();
  if (batchErr || !batch) {
    return NextResponse.json(
      {
        success: false,
        error: `无法写入批次表，请确认已执行建表 migration（awin_import_batches）：${batchErr?.message}`,
      },
      { status: 500 },
    );
  }
  result.batchId = batch.id;

  // Persist/update advertiser mappings (upsert keyed by advertiser_id).
  for (const [advertiserId, m] of Object.entries(mappings)) {
    const { error } = await supabase.from('awin_advertiser_mappings').upsert(
      {
        advertiser_id: advertiserId,
        store_id: m.storeId,
        region: m.region,
        currency: m.currency,
        is_active: true,
        first_seen_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'advertiser_id' },
    );
    if (error) {
      result.errors.push(`${advertiserId}: mapping upsert failed (${error.message})`);
    }
  }

  /** Record one append-only history row. */
  const addHistory = async (args: {
    productId: number;
    storeId: number;
    region: string;
    currency: string;
    price: number | null;
    inStock: boolean;
    oldPrice: number | null;
  }) => {
    const { event, changePercent } = eventFor(args.oldPrice, args.price);
    const stockEvent = !args.inStock ? 'out_of_stock' : null;
    await supabase.from('product_price_history').insert({
      product_id: args.productId,
      store_id: args.storeId,
      region: args.region,
      currency: args.currency,
      price: args.price,
      in_stock: args.inStock,
      event_type: stockEvent ?? event,
      price_prev: args.oldPrice,
      change_percent: changePercent,
      batch_id: batch.id,
    });
  };

  /** Link an external identity to a product (deduplicated). */
  const linkExternalId = async (args: {
    productId: number;
    advertiserId: string;
    awProductId: string;
    merchantProductId: string;
    primary?: boolean;
  }) => {
    if (!args.awProductId) return;
    const { data: existing } = await supabase
      .from('product_external_ids')
      .select('id')
      .eq('advertiser_id', args.advertiserId)
      .eq('aw_product_id', args.awProductId)
      .maybeSingle();
    if (existing) return;
    await supabase.from('product_external_ids').insert({
      product_id: args.productId,
      network: 'awin',
      advertiser_id: args.advertiserId,
      aw_product_id: args.awProductId,
      merchant_product_id: args.merchantProductId,
      is_primary: !!args.primary,
      first_seen_at: new Date().toISOString(),
    });
  };

  const processOne = async (entry: CommitEntry) => {
    // Missing → manual hide decision.
    if (entry.kind === 'missing') {
      if (entry.selected) {
        const price = entry.prices[0];
        if (price?.priceId) {
          const { error } = await supabase
            .from('product_prices')
            .update({ in_stock: false })
            .eq('id', price.priceId);
          if (error) {
            result.errors.push(`${entry.slug}: hide failed (${error.message})`);
          } else {
            result.hidden++;
          }
        }
      } else {
        result.skipped++;
      }
      return;
    }

    if (!entry.selected) {
      result.skipped++;
      return;
    }

    const spec = entry.prices[0];
    const region = spec?.region || mappings[entry.advertiserId]?.region || '';
    const targetStore = spec?.storeId ?? mappings[entry.advertiserId]?.storeId ?? null;

    // --- Confirmed fuzzy merge: attach identity + price, keep content unless
    //     the user explicitly picked the feed value for a product-level field.
    if (entry.kind === 'possible_match' && entry.mergeProductId !== null) {
      const mergeId = entry.mergeProductId;
      const choices = entry.fieldChoices;

      const productPatch: Record<string, unknown> = {};
      if (entry.awProductId) productPatch.aw_product_id = entry.awProductId;
      if (entry.merchantProductId) productPatch.merchant_product_id = entry.merchantProductId;
      if (choices?.image === 'feed' && entry.imageUrl)
        productPatch.image_url = entry.imageUrl;
      if (Object.keys(productPatch).length > 0) {
        const { error: idErr } = await supabase
          .from('products')
          .update(productPatch)
          .eq('id', mergeId);
        if (idErr) {
          result.errors.push(`${entry.slug}: merge identity failed (${idErr.message})`);
          return;
        }
      }

      // Name / description overwrite only when the feed source was picked.
      const trPatch: Record<string, string> = {};
      if (choices?.name === 'feed' && entry.name) trPatch.name = entry.name;
      if (choices?.description === 'feed' && entry.description)
        trPatch.description = entry.description;
      if (Object.keys(trPatch).length > 0) {
        const { error: trErr } = await supabase
          .from('product_translations')
          .update(trPatch)
          .eq('product_id', mergeId)
          .eq('language', 'en');
        if (trErr) {
          result.errors.push(`${entry.slug}: merge fields failed (${trErr.message})`);
          return;
        }
      }

      await linkExternalId({
        productId: mergeId,
        advertiserId: entry.advertiserId,
        awProductId: entry.awProductId,
        merchantProductId: entry.merchantProductId,
      });

      if (spec && spec.newPrice !== null && targetStore !== null) {
        const { data: existingPrice } = await supabase
          .from('product_prices')
          .select('id, current_price, currency')
          .eq('product_id', mergeId)
          .eq('store_id', targetStore)
          .eq('region', region)
          .maybeSingle();
        const payload = {
          current_price: spec.newPrice,
          currency: spec.currency,
          product_url: spec.newUrl || null,
          in_stock: spec.inStock,
          has_commission: true,
          ...originalFields(spec.newPrice, spec.newOriginalPrice),
        };
        const oldPrice = existingPrice?.current_price
          ? Number(existingPrice.current_price)
          : null;
        const { error: priceErr } = existingPrice
          ? await supabase.from('product_prices').update(payload).eq('id', existingPrice.id)
          : await supabase.from('product_prices').insert({
              product_id: mergeId,
              store_id: targetStore,
              region,
              ...payload,
            });
        if (priceErr) {
          result.errors.push(`${entry.slug}: merge price failed (${priceErr.message})`);
          return;
        }
        await addHistory({
          productId: mergeId,
          storeId: targetStore,
          region,
          currency: spec.currency,
          price: spec.newPrice,
          inStock: spec.inStock,
          oldPrice,
        });
      }
      result.updated++;
      return;
    }

    if (entry.kind === 'new' || entry.productId === null) {
      // --- Create product ---
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          slug: entry.slug,
          image_url: entry.imageUrl || null,
          aw_product_id: entry.awProductId || null,
          merchant_product_id: entry.merchantProductId || null,
        })
        .select('id')
        .single();
      if (productError || !product) {
        result.errors.push(`${entry.slug}: create failed (${productError?.message})`);
        return;
      }

      await supabase.from('product_translations').insert({
        product_id: product.id,
        language: 'en',
        name: entry.name,
        description: entry.description || null,
      });

      const categoryId = await ensureCategory(supabase, entry.category);
      if (categoryId) await linkProductCategory(supabase, product.id, categoryId);

      await linkExternalId({
        productId: product.id,
        advertiserId: entry.advertiserId,
        awProductId: entry.awProductId,
        merchantProductId: entry.merchantProductId,
        primary: true,
      });

      if (spec && spec.newPrice !== null && targetStore !== null) {
        const { error: priceErr } = await supabase.from('product_prices').insert({
          product_id: product.id,
          store_id: targetStore,
          region,
          current_price: spec.newPrice,
          currency: spec.currency,
          product_url: spec.newUrl || null,
          in_stock: spec.inStock,
          has_commission: true,
          ...originalFields(spec.newPrice, spec.newOriginalPrice),
        });
        if (priceErr) {
          result.errors.push(`${entry.slug}: price create failed (${priceErr.message})`);
        } else {
          await addHistory({
            productId: product.id,
            storeId: targetStore,
            region,
            currency: spec.currency,
            price: spec.newPrice,
            inStock: spec.inStock,
            oldPrice: null,
          });
        }
      }
      result.created++;
    } else {
      // --- Update existing product (hard matched) ---
      const productId = entry.productId;

      const patch: Record<string, unknown> = {};
      if (entry.awProductId) patch.aw_product_id = entry.awProductId;
      if (entry.merchantProductId)
        patch.merchant_product_id = entry.merchantProductId;
      if (entry.imageUrl) patch.image_url = entry.imageUrl;
      if (Object.keys(patch).length > 0) {
        await supabase.from('products').update(patch).eq('id', productId);
      }

      const { data: existingTr } = await supabase
        .from('product_translations')
        .select('product_id')
        .eq('product_id', productId)
        .eq('language', 'en')
        .maybeSingle();
      const trPayload = {
        name: entry.name,
        description: entry.description || null,
      };
      if (existingTr) {
        await supabase
          .from('product_translations')
          .update(trPayload)
          .eq('product_id', productId)
          .eq('language', 'en');
      } else {
        await supabase.from('product_translations').insert({
          product_id: productId,
          language: 'en',
          ...trPayload,
        });
      }

      if (entry.category) {
        const categoryId = await ensureCategory(supabase, entry.category);
        if (categoryId) await linkProductCategory(supabase, productId, categoryId);
      }

      await linkExternalId({
        productId,
        advertiserId: entry.advertiserId,
        awProductId: entry.awProductId,
        merchantProductId: entry.merchantProductId,
      });

      if (spec && targetStore !== null) {
        if (spec.priceId) {
          const { data: before } = await supabase
            .from('product_prices')
            .select('current_price')
            .eq('id', spec.priceId)
            .maybeSingle();
          const { error } = await supabase
            .from('product_prices')
            .update({
              current_price:
                spec.newPrice === null ? undefined : spec.newPrice,
              currency: spec.currency,
              product_url: spec.newUrl || undefined,
              in_stock: spec.inStock,
              has_commission: true,
              ...(spec.newPrice !== null
                ? originalFields(spec.newPrice, spec.newOriginalPrice)
                : {}),
            })
            .eq('id', spec.priceId);
          if (error) {
            result.errors.push(`${entry.slug}: price update failed (${error.message})`);
          } else if (spec.newPrice !== null) {
            await addHistory({
              productId,
              storeId: targetStore,
              region,
              currency: spec.currency,
              price: spec.newPrice,
              inStock: spec.inStock,
              oldPrice: before?.current_price ? Number(before.current_price) : null,
            });
          }
        } else if (spec.newPrice !== null) {
          const { error } = await supabase.from('product_prices').insert({
            product_id: productId,
            store_id: targetStore,
            region,
            current_price: spec.newPrice,
            currency: spec.currency,
            product_url: spec.newUrl || null,
            in_stock: spec.inStock,
            has_commission: true,
            ...originalFields(spec.newPrice, spec.newOriginalPrice),
          });
          if (error) {
            result.errors.push(`${entry.slug}: price insert failed (${error.message})`);
          } else {
            await addHistory({
              productId,
              storeId: targetStore,
              region,
              currency: spec.currency,
              price: spec.newPrice,
              inStock: spec.inStock,
              oldPrice: null,
            });
          }
        }
      }
      result.updated++;
    }
  };

  for (const entry of entries) {
    try {
      await processOne(entry);
    } catch (error) {
      result.errors.push(
        `${entry.slug || entry.awProductId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  // Finalize batch aggregates.
  await supabase
    .from('awin_import_batches')
    .update({
      finished_at: new Date().toISOString(),
      counts: {
        created: result.created,
        updated: result.updated,
        hidden: result.hidden,
        skipped: result.skipped,
        errors: result.errors.length,
      },
    })
    .eq('id', batch.id);

  if (result.errors.length > 0) result.success = false;
  return NextResponse.json(result);
}
