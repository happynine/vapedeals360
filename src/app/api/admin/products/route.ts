import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';
import { deleteFile, uploadFile } from '@/lib/storage';

// 检查促销价格是否已过期
function isPromotionExpired(price: { time_type?: string; end_time?: string | null; start_time?: string | null }): boolean {
  if (!price.time_type || price.time_type === 'permanent') return false;
  if (price.time_type === 'time_range' && price.end_time) {
    return new Date() > new Date(price.end_time);
  }
  if (price.time_type === 'countdown' && price.end_time) {
    return new Date() > new Date(price.end_time);
  }
  return false;
}

// 处理产品的过期促销价格（直接在 product_prices 上原地更新）
async function processExpiredPromotions(client: any, productId: number) {
  const { data: prices } = await client
    .from('product_prices')
    .select('*')
    .eq('product_id', productId)
    .not('promotion_id', 'is', null);

  if (!prices || prices.length === 0) return;

  for (const price of prices) {
    if (isPromotionExpired(price)) {
      const action = price.countdown_action || 'hide';
      if (action === 'convert_to_standard') {
        // 转为标准价：清除促销字段，价格保持 current_price（现价）不变
        await client
          .from('product_prices')
          .update({
            promotion_id: null,
            time_type: 'permanent',
            start_time: null,
            end_time: null,
            countdown_action: 'hide',
            promo_price: null,
            is_featured_in_promotion: false,
          })
          .eq('id', price.id);
        // 更新内存中的数据
        price.promotion_id = null;
        price.time_type = 'permanent';
        price.start_time = null;
        price.end_time = null;
        price.countdown_action = 'hide';
        price.promo_price = null;
        price.is_featured_in_promotion = false;
      } else {
        // hide: 标记为已下架，数据保留
        await client
          .from('product_prices')
          .update({ is_promotion_hidden: true })
          .eq('id', price.id);
        price.is_promotion_hidden = true;
      }
    }
  }
}

// 将价格行映射为数据库写入格式
function mapPriceRow(p: Record<string, unknown>, productId: number) {
  return {
    product_id: productId,
    store_id: p.store_id,
    current_price: p.current_price,
    original_price: p.original_price || null,
    product_url: p.product_url,
    in_stock: p.in_stock !== false,
    discount_percent: p.discount_percent || null,
    currency: p.currency || '$',
    region: p.region || '',
    no_quote: p.no_quote || false,
    promotion_id: p.promotion_id || null,
    time_type: p.time_type || 'permanent',
    start_time: p.start_time || null,
    end_time: p.end_time || null,
    countdown_action: p.countdown_action || 'hide',
    promo_price: p.promo_price || null,
    is_promotion_hidden: p.is_promotion_hidden || false,
    is_featured_in_promotion: p.is_featured_in_promotion || false,
  };
}

// GET all products (admin view, including inactive)
export async function GET(request: NextRequest) {
  try {
    const client = getServiceRoleClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const { data, error } = await client
      .from('products')
      .select('*, product_translations(*), product_prices(*, stores(*, store_translations(*))), categories(*, category_translations(*))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Fetch failed: ${error.message}`);

    // Get total count
    const { count, error: countError } = await client
      .from('products')
      .select('*', { count: 'exact', head: true });
    if (countError) throw new Error(`Count failed: ${countError.message}`);

    if (data && data.length > 0) {
      for (const product of data) {
        // 处理过期促销
        await processExpiredPromotions(client, product.id);

        const allPrices = product.product_prices as Record<string, unknown>[] || [];

        // 拆分标准价和促销价（促销价: promotion_id 非空）
        const standardPrices = allPrices.filter(p => !p.promotion_id);
        const promoPrices = allPrices.filter(p => p.promotion_id);

        // 计算活跃促销数量（未下架的）
        const activePromoCount = promoPrices.filter(p => !p.is_promotion_hidden).length;

        product.product_prices = standardPrices;
        (product as Record<string, unknown>).has_promotion = activePromoCount > 0;
        (product as Record<string, unknown>).active_promotion_count = activePromoCount;
        (product as Record<string, unknown>).promotion_prices = promoPrices;
      }
    }

    return NextResponse.json({
      success: true,
      data: { products: data, total: count, page, limit },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST create product
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getServiceRoleClient();
    const body = await request.json();
    const { slug, category_id, image_url, image_url_small, home_image_key, images, is_active, is_featured, sales_region, notes, translations, prices, promotion_prices } = body;

    // Create product
    const { data: product, error: prodError } = await client
      .from('products')
      .insert({
        slug,
        category_id,
        image_url,
        image_url_small,
        home_image_key,
        images: images ? JSON.stringify(images) : null,
        is_active: is_active !== false,
        is_featured: is_featured || false,
        sales_region: sales_region || '不限地区',
        notes: notes || '',
      })
      .select()
      .single();
    if (prodError) throw new Error(`Create product failed: ${prodError.message}`);
    const productId = (product as Record<string, unknown>).id as number;

    // Create translations
    if (translations && translations.length > 0) {
      const transRows = translations.map((t: Record<string, unknown>) => ({
        product_id: productId,
        language: t.language,
        name: t.name,
        description: t.description || null,
        features: t.features ? (typeof t.features === 'string' ? t.features : JSON.stringify(t.features)) : null,
        specs: t.specs ? (typeof t.specs === 'string' ? t.specs : JSON.stringify(t.specs)) : null,
      }));
      const { error: transError } = await client.from('product_translations').insert(transRows);
      if (transError) throw new Error(`Create translations failed: ${transError.message}`);
    }

    // 合并标准价和促销价，统一写入 product_prices
    const allPriceRows = [
      ...(prices || []).map((p: Record<string, unknown>) => mapPriceRow({ ...p, promotion_id: null, time_type: 'permanent' }, productId)),
      ...(promotion_prices || []).map((p: Record<string, unknown>) => mapPriceRow(p, productId)),
    ];

    if (allPriceRows.length > 0) {
      const { error: priceError } = await client.from('product_prices').insert(allPriceRows);
      if (priceError) throw new Error(`Create prices failed: ${priceError.message}`);
    }

    return NextResponse.json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT update product
export async function PUT(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getServiceRoleClient();
    const body = await request.json();
    const { id, slug, category_id, image_url, image_url_small, home_image_key, images, is_active, is_featured, sales_region, notes, translations, prices, promotion_prices } = body;

    // 先处理过期促销
    await processExpiredPromotions(client, id);

    // 获取旧的产品数据，用于删除旧图片和 slug 变更时重命名
    const { data: oldProduct } = await client
      .from('products')
      .select('slug, image_url, image_url_small, home_image_key')
      .eq('id', id)
      .single();

    // 检测 slug 是否变更
    const oldSlug = oldProduct?.slug as string | undefined;
    const slugChanged = !!(oldSlug && slug && oldSlug !== slug);

    // slug 变更时：重命名 R2 图片文件 + 更新 URL
    let effectiveHomeImageKey = home_image_key;
    let effectiveImageUrl = image_url;
    let effectiveImageUrlSmall = image_url_small;

    if (slugChanged && oldProduct) {
      const oldHomeUrl = oldProduct.home_image_key as string | null;
      const oldDetailUrl = oldProduct.image_url as string | null;

      if (oldHomeUrl && oldHomeUrl.includes('/products/')) {
        try {
          const resp = await fetch(oldHomeUrl);
          const buf = Buffer.from(new Uint8Array(await resp.arrayBuffer()));
          const seoName = `${slug}-product-image.jpg`;
          const result = await uploadFile({
            fileContent: buf, fileName: seoName, contentType: 'image/jpeg',
            folder: 'products', customFileName: seoName,
          });
          effectiveHomeImageKey = result.url;
          await deleteFile(oldHomeUrl);
          console.log(`[SEO rename] home: ${oldHomeUrl} -> ${result.url}`);
        } catch (e) {
          console.error('[SEO rename] home image failed:', e);
        }
      }

      if (oldDetailUrl && oldDetailUrl.includes('/products/')) {
        try {
          const resp = await fetch(oldDetailUrl);
          const buf = Buffer.from(new Uint8Array(await resp.arrayBuffer()));
          const seoName = `${slug}-detail-page.jpg`;
          const result = await uploadFile({
            fileContent: buf, fileName: seoName, contentType: 'image/jpeg',
            folder: 'products', customFileName: seoName,
          });
          effectiveImageUrl = result.url;
          effectiveImageUrlSmall = result.url;
          await deleteFile(oldDetailUrl);
          console.log(`[SEO rename] detail: ${oldDetailUrl} -> ${result.url}`);
        } catch (e) {
          console.error('[SEO rename] detail image failed:', e);
        }
      }
    }

    // Add cache-busting to image URLs to prevent CDN stale cache
    const cacheParam = `v=${Date.now()}`;
    if (effectiveHomeImageKey && effectiveHomeImageKey.startsWith('http')) {
      effectiveHomeImageKey = effectiveHomeImageKey.split('?')[0] + '?' + cacheParam;
    }
    if (effectiveImageUrl && effectiveImageUrl.startsWith('http')) {
      effectiveImageUrl = effectiveImageUrl.split('?')[0] + '?' + cacheParam;
    }
    if (effectiveImageUrlSmall && effectiveImageUrlSmall.startsWith('http')) {
      effectiveImageUrlSmall = effectiveImageUrlSmall.split('?')[0] + '?' + cacheParam;
    }

    const { data: product, error: prodError } = await client
      .from('products')
      .update({
        slug,
        category_id,
        image_url: effectiveImageUrl,
        image_url_small: effectiveImageUrlSmall,
        home_image_key: effectiveHomeImageKey || null,
        images: images ? (typeof images === 'string' ? images : JSON.stringify(images)) : null,
        is_active,
        is_featured,
        sales_region: sales_region || '不限地区',
        notes: notes || '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (prodError) throw new Error(`Update product failed: ${prodError.message}`);

    // 删除旧图片文件（当图片被更新时；slug 变更时已在上方处理）
    if (oldProduct && !slugChanged) {
      const oldHomeImageKey = oldProduct.home_image_key as string | null;
      const oldImageUrl = oldProduct.image_url as string | null;
      const oldImageUrlSmall = oldProduct.image_url_small as string | null;

      if (home_image_key !== undefined && oldHomeImageKey && effectiveHomeImageKey) {
        const oldBase = oldHomeImageKey.split('?')[0];
        const newBase = effectiveHomeImageKey.split('?')[0];
        if (oldBase !== newBase) {
          await deleteFile(oldHomeImageKey);
        }
      }

      if (image_url !== undefined && oldImageUrl && effectiveImageUrl) {
        const oldBase = oldImageUrl.split('?')[0];
        const newBase = effectiveImageUrl.split('?')[0];
        if (oldBase !== newBase) {
          await deleteFile(oldImageUrl);
        }
      }

      if (image_url_small !== undefined && oldImageUrlSmall && effectiveImageUrlSmall) {
        const oldBase = oldImageUrlSmall.split('?')[0];
        const newBase = effectiveImageUrlSmall.split('?')[0];
        if (oldBase !== newBase) {
          await deleteFile(oldImageUrlSmall);
        }
      }
    }

    // Update translations
    if (translations && translations.length > 0) {
      await client.from('product_translations').delete().eq('product_id', id);
      const transRows = translations.map((t: Record<string, unknown>) => ({
        product_id: id,
        language: t.language,
        name: t.name,
        description: t.description || null,
        features: t.features ? (typeof t.features === 'string' ? t.features : JSON.stringify(t.features)) : null,
        specs: t.specs ? (typeof t.specs === 'string' ? t.specs : JSON.stringify(t.specs)) : null,
      }));
      const { error: transError } = await client.from('product_translations').insert(transRows);
      if (transError) throw new Error(`Update translations failed: ${transError.message}`);
    }

    // 统一删除旧价格并重新写入（标准价 + 促销价合并到 product_prices）
    if (prices || promotion_prices) {
      await client.from('product_prices').delete().eq('product_id', id);

      const allPriceRows = [
        ...(prices || []).map((p: Record<string, unknown>) => mapPriceRow({ ...p, promotion_id: null, time_type: 'permanent' }, id)),
        ...(promotion_prices || []).map((p: Record<string, unknown>) => mapPriceRow(p, id)),
      ];

      if (allPriceRows.length > 0) {
        const { error: priceError } = await client.from('product_prices').insert(allPriceRows);
        if (priceError) throw new Error(`Update prices failed: ${priceError.message}`);
      }
    }

    return NextResponse.json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE product
export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getServiceRoleClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('Missing id parameter');
    const productId = parseInt(id);

    // 获取产品数据以清理关联的 R2 图片
    const { data: product } = await client
      .from('products')
      .select('image_url, image_url_small, home_image_key')
      .eq('id', productId)
      .single();

    // 删除子表数据（product_prices 现在包含标准价和促销价）
    await client.from('product_translations').delete().eq('product_id', productId);
    await client.from('product_prices').delete().eq('product_id', productId);
    const { error } = await client.from('products').delete().eq('id', productId);
    if (error) throw new Error(`Delete product failed: ${error.message}`);

    // 清理关联的 R2 图片
    if (product) {
      await deleteFile((product as Record<string, unknown>).image_url as string | null);
      await deleteFile((product as Record<string, unknown>).image_url_small as string | null);
      await deleteFile((product as Record<string, unknown>).home_image_key as string | null);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
