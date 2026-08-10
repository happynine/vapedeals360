import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';

interface SyncPrice {
  store: { name: string; website_url?: string };
  price: number;
  currency?: string;
  link?: string;
}

interface SyncProduct {
  action: 'create' | 'update_prices' | string;
  slug: string;
  name?: string;
  category?: string;
  image_url?: string;
  description?: string;
  prices?: SyncPrice[];
}

interface SyncPackage {
  sync_type?: string;
  products: SyncProduct[];
}

/**
 * Convert a string to a URL-friendly slug.
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Find or create a store by name. Creates a slug from the store name.
 */
async function findOrCreateStore(
  supabase: ReturnType<typeof getServiceRoleClient>,
  storeData: { name: string; website_url?: string },
): Promise<number> {
  const slug = slugify(storeData.name);

  // Try to find by slug first
  const { data: existingBySlug } = await supabase
    .from('stores')
    .select('id, slug')
    .eq('slug', slug)
    .limit(1)
    .single();

  if (existingBySlug) {
    return existingBySlug.id;
  }

  // Try to find by store_translations name
  const { data: existingByName } = await supabase
    .from('store_translations')
    .select('store_id, name')
    .eq('name', storeData.name)
    .eq('language', 'en')
    .limit(1)
    .single();

  if (existingByName) {
    return (existingByName as { store_id: number }).store_id;
  }

  // Create new store
  const { data: newStore, error: storeError } = await supabase
    .from('stores')
    .insert({
      slug,
      website_url: storeData.website_url || '',
      is_active: true,
    })
    .select('id')
    .single();

  if (storeError || !newStore) {
    throw new Error(`Failed to create store "${storeData.name}": ${storeError?.message}`);
  }

  // Create store translation (en)
  await supabase.from('store_translations').insert({
    store_id: (newStore as { id: number }).id,
    language: 'en',
    name: storeData.name,
  });

  return (newStore as { id: number }).id;
}

/**
 * Find a category by its slug.
 */
async function findCategoryBySlug(
  supabase: ReturnType<typeof getServiceRoleClient>,
  categorySlug: string,
): Promise<number | null> {
  const slug = slugify(categorySlug);
  const { data } = await supabase
    .from('categories')
    .select('id, slug')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();

  return data ? (data as { id: number }).id : null;
}

/**
 * Find product by slug.
 */
async function findProductBySlug(
  supabase: ReturnType<typeof getServiceRoleClient>,
  slug: string,
): Promise<{ id: number } | null> {
  const { data } = await supabase
    .from('products')
    .select('id, slug')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();

  return data ? { id: (data as { id: number }).id } : null;
}

/**
 * Replace all prices for a product with new prices.
 */
async function replaceProductPrices(
  supabase: ReturnType<typeof getServiceRoleClient>,
  productId: number,
  prices: SyncPrice[],
): Promise<{ updated: number; skipped: number }> {
  // Delete existing prices
  const { error: deleteError } = await supabase
    .from('product_prices')
    .delete()
    .eq('product_id', productId);

  if (deleteError) {
    throw new Error(`Failed to delete existing prices: ${deleteError.message}`);
  }

  let updated = 0;
  let skipped = 0;

  for (const price of prices) {
    try {
      const storeId = await findOrCreateStore(supabase, {
        name: price.store.name,
        website_url: price.store.website_url,
      });

      const { error: insertError } = await supabase.from('product_prices').insert({
        product_id: productId,
        store_id: storeId,
        current_price: price.price,
        product_url: price.link || '',
        in_stock: true,
        currency: price.currency || '$',
      });

      if (insertError) {
        console.error(`Failed to insert price for product ${productId}:`, insertError);
        skipped++;
      } else {
        updated++;
      }
    } catch (err) {
      console.error(`Error processing price for store "${price.store.name}":`, err);
      skipped++;
    }
  }

  return { updated, skipped };
}

export async function POST(request: NextRequest) {
  try {
    let syncData: SyncPackage;

    const contentType = request.headers.get('content-type') || '';

    // Support both multipart/form-data (file upload) and application/json
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'No file uploaded' },
          { status: 400 },
        );
      }

      const text = await file.text();
      syncData = JSON.parse(text);
    } else {
      syncData = await request.json();
    }

    if (!syncData.products || !Array.isArray(syncData.products)) {
      return NextResponse.json(
        { success: false, error: 'Invalid sync package: products array required' },
        { status: 400 },
      );
    }

    const supabase = getServiceRoleClient();
    const stats = {
      created: 0,
      price_updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const product of syncData.products) {
      try {
        if (product.action === 'create') {
          // Check if product already exists by slug
          const existing = await findProductBySlug(supabase, product.slug);
          if (existing) {
            // Skip - already exists
            stats.skipped++;
            continue;
          }

          // Find category (optional)
          let categoryId: number | null = null;
          if (product.category) {
            categoryId = await findCategoryBySlug(supabase, product.category);
          }

          // Create product
          const { data: newProduct, error: productError } = await supabase
            .from('products')
            .insert({
              slug: product.slug,
              category_id: categoryId,
              image_url: product.image_url || null,
              is_active: true,
              is_featured: false,
            })
            .select('id')
            .single();

          if (productError || !newProduct) {
            throw new Error(`Failed to create product: ${productError?.message}`);
          }

          const productId = (newProduct as { id: number }).id;

          // Create product translation (en)
          if (product.name) {
            await supabase.from('product_translations').insert({
              product_id: productId,
              language: 'en',
              name: product.name,
              description: product.description || null,
            });
          }

          // Insert prices
          if (product.prices && product.prices.length > 0) {
            await replaceProductPrices(supabase, productId, product.prices);
          }

          stats.created++;
        } else if (product.action === 'update_prices') {
          // Find product by slug
          const existing = await findProductBySlug(supabase, product.slug);
          if (!existing) {
            stats.skipped++;
            continue;
          }

          if (product.prices && product.prices.length > 0) {
            await replaceProductPrices(supabase, existing.id, product.prices);
            stats.price_updated++;
          } else {
            stats.skipped++;
          }
        } else {
          stats.skipped++;
          stats.errors.push(`Unknown action "${product.action}" for slug "${product.slug}"`);
        }
      } catch (err) {
        console.error(`Error processing product "${product.slug}":`, err);
        stats.skipped++;
        stats.errors.push(
          `Product "${product.slug}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return NextResponse.json({
      success: true,
      sync_type: syncData.sync_type || 'crawler_to_backend',
      total_processed: syncData.products.length,
      created: stats.created,
      price_updated: stats.price_updated,
      skipped: stats.skipped,
      errors: stats.errors.slice(0, 50), // Limit error count
    });
  } catch (error) {
    console.error('Crawler sync import error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Import failed',
      },
      { status: 500 },
    );
  }
}
