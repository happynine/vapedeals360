import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import type {
  CommitEntry,
  CommitRequest,
  CommitResponse,
} from '@/lib/awin-import-types';

/** Ensure a category exists for the given slug; return its id. */
async function ensureCategory(
  supabase: ReturnType<typeof getServiceRoleClient>,
  slug: string,
): Promise<number | null> {
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
  if (error) return null;
  await supabase.from('category_translations').insert({
    category_id: created.id,
    language: 'en',
    name: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  });
  return created.id;
}

/** Link a product to a category (idempotent). */
async function linkProductCategory(
  supabase: ReturnType<typeof getServiceRoleClient>,
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

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();

  const body = (await request.json()) as CommitRequest;
  const { storeId, region, entries } = body;

  if (!storeId || !region || !Array.isArray(entries)) {
    return NextResponse.json(
      { success: false, error: 'store_id, region and entries are required' },
      { status: 400 },
    );
  }

  const supabase = getServiceRoleClient();
  const result: CommitResponse = {
    success: true,
    created: 0,
    updated: 0,
    skipped: 0,
    hidden: 0,
    errors: [],
  };

  const processOne = async (entry: CommitEntry) => {
    // 'missing' rows are handled separately (manual hide decision).
    if (entry.kind === 'missing') {
      const shouldHide = entry.selected;
      if (shouldHide) {
        const price = entry.prices[0];
        if (price?.priceId) {
          const { error } = await supabase
            .from('product_prices')
            .update({ in_stock: false })
            .eq('id', price.priceId);
          if (error) {
            result.errors.push(
              `${entry.slug}: failed to hide price (${error.message})`,
            );
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

    const priceSpec = entry.prices[0];

    // --- Confirmed fuzzy merge: attach feed identity + this store's price to an
    // existing product. We deliberately do NOT overwrite its name/description/
    // image/category — only the link & price are brought over (no auto-clobber).
    if (entry.kind === 'possible_match' && entry.mergeProductId !== null) {
      const mergeId = entry.mergeProductId;
      const idPatch: Record<string, unknown> = {};
      if (entry.awProductId) idPatch.aw_product_id = entry.awProductId;
      if (entry.merchantProductId)
        idPatch.merchant_product_id = entry.merchantProductId;
      if (Object.keys(idPatch).length > 0) {
        const { error } = await supabase
          .from('products')
          .update(idPatch)
          .eq('id', mergeId);
        if (error) {
          result.errors.push(
            `${entry.slug}: merge identity update failed (${error.message})`,
          );
          return;
        }
      }
      // Bring over this store's commission price/link (update or insert).
      if (priceSpec && priceSpec.newPrice !== null) {
        const { data: existingPrice } = await supabase
          .from('product_prices')
          .select('id')
          .eq('product_id', mergeId)
          .eq('store_id', storeId)
          .eq('region', region)
          .maybeSingle();
        const pricePayload = {
          current_price: priceSpec.newPrice,
          currency: priceSpec.currency,
          region,
          product_url: priceSpec.newUrl || null,
          in_stock: priceSpec.inStock,
        };
        const { error: priceErr } = existingPrice
          ? await supabase
              .from('product_prices')
              .update(pricePayload)
              .eq('id', existingPrice.id)
          : await supabase.from('product_prices').insert({
              product_id: mergeId,
              store_id: storeId,
              ...pricePayload,
            });
        if (priceErr) {
          result.errors.push(
            `${entry.slug}: merge price failed (${priceErr.message})`,
          );
          return;
        }
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
        result.errors.push(
          `${entry.slug}: create failed (${productError?.message})`,
        );
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

      if (priceSpec && priceSpec.newPrice !== null) {
        const { error: priceErr } = await supabase.from('product_prices').insert({
          product_id: product.id,
          store_id: storeId,
          current_price: priceSpec.newPrice,
          currency: priceSpec.currency,
          region,
          product_url: priceSpec.newUrl || null,
          in_stock: priceSpec.inStock,
        });
        if (priceErr) {
          result.errors.push(
            `${entry.slug}: price create failed (${priceErr.message})`,
          );
        }
      }
      result.created++;
    } else {
      // --- Update existing product ---
      const productId = entry.productId;

      // Identity fields (keep SKU/aw ids populated).
      const patch: Record<string, unknown> = {};
      if (entry.awProductId) patch.aw_product_id = entry.awProductId;
      if (entry.merchantProductId)
        patch.merchant_product_id = entry.merchantProductId;
      if (entry.imageUrl) patch.image_url = entry.imageUrl;
      if (Object.keys(patch).length > 0) {
        await supabase.from('products').update(patch).eq('id', productId);
      }

      // Update English translation.
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

      // Category (only when mapped).
      if (entry.category) {
        const categoryId = await ensureCategory(supabase, entry.category);
        if (categoryId) {
          await linkProductCategory(supabase, productId, categoryId);
        }
      }

      // Price row for this store: update in place (keeping the row and only
      // swapping price / commission link), or insert when none exists.
      if (priceSpec) {
        if (priceSpec.priceId) {
          const { error } = await supabase
            .from('product_prices')
            .update({
              current_price:
                priceSpec.newPrice === null
                  ? undefined
                  : priceSpec.newPrice,
              currency: priceSpec.currency,
              product_url: priceSpec.newUrl || undefined,
              in_stock: priceSpec.inStock,
            })
            .eq('id', priceSpec.priceId);
          if (error) {
            result.errors.push(
              `${entry.slug}: price update failed (${error.message})`,
            );
          }
        } else if (priceSpec.newPrice !== null) {
          const { error } = await supabase.from('product_prices').insert({
            product_id: productId,
            store_id: storeId,
            current_price: priceSpec.newPrice,
            currency: priceSpec.currency,
            region,
            product_url: priceSpec.newUrl || null,
            in_stock: priceSpec.inStock,
          });
          if (error) {
            result.errors.push(
              `${entry.slug}: price insert failed (${error.message})`,
            );
          }
        }
      }
      result.updated++;
    }
  };

  // Process sequentially to keep the catalog consistent and errors ordered.
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

  if (result.errors.length > 0) result.success = false;
  return NextResponse.json(result);
}
