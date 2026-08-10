import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';
import { getPresignedUrl } from '@/lib/storage';
import { del } from '@vercel/blob';

// 删除 Vercel Blob 文件的辅助函数（失败不影响主流程）
async function deleteBlobFile(fileUrl: string | null | undefined) {
  if (!fileUrl) return;
  try {
    await del(fileUrl);
    console.log('Deleted blob file:', fileUrl);
  } catch (e) {
    console.warn('Failed to delete blob file:', fileUrl, e);
  }
}

// 检查促销价格是否已过期
function isPromotionExpired(price: { time_type?: string; end_time?: string | null; start_time?: string | null }): boolean {
  if (!price.time_type || price.time_type === 'permanent') return false;
  const now = new Date();
  if (price.time_type === 'time_range' && price.end_time) {
    return now > new Date(price.end_time);
  }
  if (price.time_type === 'countdown' && price.end_time) {
    return now > new Date(price.end_time);
  }
  return false;
}

// 处理过期的促销价格：自动转为标准价或隐藏
async function processExpiredPromotions(client: any, promotionProductId: number) {
  const { data: prices } = await client
    .from('promotion_product_prices')
    .select('*')
    .eq('promotion_product_id', promotionProductId);

  if (!prices || prices.length === 0) return;

  for (const price of prices) {
    if (isPromotionExpired(price)) {
      const action = price.countdown_action || 'close';

      // 获取 promotion_product 信息
      const { data: pp } = await client
        .from('promotion_products')
        .select('product_id, slug, category_id')
        .eq('id', promotionProductId)
        .single();

      if (!pp?.product_id) continue;

      if (action === 'convert_to_standard') {
        // 转为标准商城价：在 product_prices 创建记录
        // 如果设置了 standard_price 则用它作为现价，否则用促销价
        const targetPrice = price.standard_price || price.current_price;
        const existingStandardPrice = await client
          .from('product_prices')
          .select('id')
          .eq('product_id', pp.product_id)
          .eq('store_id', price.store_id)
          .eq('region', price.region || '')
          .single();

        if (!existingStandardPrice.data) {
          await client.from('product_prices').insert({
            product_id: pp.product_id,
            store_id: price.store_id,
            current_price: targetPrice,
            original_price: price.original_price || null,
            product_url: price.product_url,
            in_stock: true,
            discount_percent: price.discount_percent || null,
            currency: price.currency || '$',
            region: price.region || '',
            no_quote: price.no_quote || false,
          });
        }
      }

      // 删除过期的促销价格记录
      await client
        .from('promotion_product_prices')
        .delete()
        .eq('id', price.id);
    }
  }
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

    // 为每个产品添加促销状态信息
    if (data && data.length > 0) {
      const productIds = data.map((p: Record<string, unknown>) => p.id as number);

      // 批量获取所有相关促销产品
      const { data: promoProducts } = await client
        .from('promotion_products')
        .select('id, product_id, promotion_id, is_active, promotion_product_prices(*)')
        .in('product_id', productIds);

      // 按产品ID分组
      const promoByProduct: Record<number, Array<Record<string, unknown>>> = {};
      (promoProducts || []).forEach((pp: Record<string, unknown>) => {
        const pid = pp.product_id as number;
        if (!promoByProduct[pid]) promoByProduct[pid] = [];
        promoByProduct[pid].push(pp);
      });

      // 处理过期促销并为每个产品添加标记
      for (const product of data) {
        const pid = product.id;
        const promos = promoByProduct[pid] || [];

        // 处理过期的促销价格
        for (const promo of promos) {
          await processExpiredPromotions(client, promo.id as number);
        }

        // 重新获取促销数据（处理过期后可能已变化）
        const { data: updatedPromos } = await client
          .from('promotion_products')
          .select('id, product_id, promotion_id, is_active, promotion_product_prices(*, stores(*, store_translations(*)))')
          .eq('product_id', pid);

        // 统计有效的促销数量 & 收集完整促销价格数据
        let activePromoCount = 0;
        const allPromotionPrices: Array<Record<string, unknown>> = [];
        (updatedPromos || []).forEach((promo: Record<string, unknown>) => {
          const prices = (promo.promotion_product_prices || []) as Array<{ time_type?: string; end_time?: string | null }>;
          const hasActivePrice = prices.some(p => !isPromotionExpired(p));
          if (hasActivePrice || prices.length === 0) {
            activePromoCount++;
          }
          // 收集完整的促销价格数据（含 promotion_id），供前端编辑使用
          ((promo.promotion_product_prices || []) as Array<Record<string, unknown>>).forEach((pp: Record<string, unknown>) => {
            if (!isPromotionExpired(pp)) {
              allPromotionPrices.push({
                ...pp,
                promotion_id: promo.promotion_id,
              });
            }
          });
        });

        (product as Record<string, unknown>).has_promotion = activePromoCount > 0;
        (product as Record<string, unknown>).active_promotion_count = activePromoCount;
        (product as Record<string, unknown>).promotion_prices = allPromotionPrices;
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
    // Create prices
    if (prices && prices.length > 0) {
      const priceRows = prices.map((p: Record<string, unknown>) => ({
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
      }));
      const { error: priceError } = await client.from('product_prices').insert(priceRows);
      if (priceError) throw new Error(`Create prices failed: ${priceError.message}`);
    }
    // Create promotion products and prices
    if (promotion_prices && promotion_prices.length > 0) {
      // Group by promotion_id
      const promotionGroups: Record<number, typeof promotion_prices> = {};
      for (const pp of promotion_prices) {
        const promoId = pp.promotion_id;
        if (!promotionGroups[promoId]) promotionGroups[promoId] = [];
        promotionGroups[promoId].push(pp);
      }
      for (const [promoIdStr, promoPrices] of Object.entries(promotionGroups)) {
        const promoId = parseInt(promoIdStr);
        // Check if promotion_product already exists for this product and promotion
        const { data: existingPromoProduct } = await client
          .from('promotion_products')
          .select('id')
          .eq('product_id', productId)
          .eq('promotion_id', promoId)
          .single();
        let promoProductId = existingPromoProduct?.id;
        if (!promoProductId) {
          // Create promotion_product
          const { data: newPromoProduct, error: ppError } = await client
            .from('promotion_products')
            .insert({
              product_id: productId,
              promotion_id: promoId,
              slug: slug,
              category_id: category_id || null,
              image_key: image_url || null,
              home_image_key: home_image_key || null,
              image_url: image_url || null,
              is_active: is_active !== false,
              is_featured: is_featured || false,
            })
            .select()
            .single();
          if (ppError) throw new Error(`Create promotion product failed: ${ppError.message}`);
          promoProductId = newPromoProduct.id;
          // Create translation
          const enTrans = translations?.find((t: Record<string, unknown>) => t.language === 'en');
          if (enTrans) {
            await client.from('promotion_product_translations').insert({
              promotion_product_id: promoProductId,
              language: 'en',
              name: enTrans.name,
              description: enTrans.description || null,
              features: enTrans.features || null,
              specs: enTrans.specs || null,
            });
          }
        }
        // Create promotion product prices
        const promoPriceRows = promoPrices.map((p: Record<string, unknown>) => ({
          promotion_product_id: promoProductId,
          store_id: p.store_id,
          current_price: p.current_price,
          original_price: p.original_price || null,
          product_url: p.product_url,
          discount_percent: p.discount_percent || null,
          currency: p.currency || '$',
          region: p.region || '',
          no_quote: p.no_quote || false,
          store_type: 'promotion',
          time_type: p.time_type || 'permanent',
          start_time: p.start_time || null,
          end_time: p.end_time || null,
          countdown_action: p.countdown_action || 'close',
          standard_price: p.standard_price || null,
        }));
        const { error: promoPriceError } = await client.from('promotion_product_prices').insert(promoPriceRows);
        if (promoPriceError) throw new Error(`Create promotion prices failed: ${promoPriceError.message}`);
      }
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

    // 先处理过期促销：根据 countdown_action 自动转换或隐藏
    const { data: existingPromos } = await client
      .from('promotion_products')
      .select('id')
      .eq('product_id', id);

    if (existingPromos && existingPromos.length > 0) {
      for (const promo of existingPromos) {
        await processExpiredPromotions(client, promo.id);
      }
    }

    // 获取旧的产品数据，用于删除旧图片
    const { data: oldProduct } = await client
      .from('products')
      .select('image_url, image_url_small, home_image_key')
      .eq('id', id)
      .single();
    const { data: product, error: prodError } = await client
      .from('products')
      .update({
        slug,
        category_id,
        image_url,
        image_url_small,
        home_image_key: home_image_key || null,
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
    // 删除旧的 Vercel Blob 文件（当图片被更新时）
    if (oldProduct) {
      const oldHomeImageKey = oldProduct.home_image_key as string | null;
      const oldImageUrl = oldProduct.image_url as string | null;
      const oldImageUrlSmall = oldProduct.image_url_small as string | null;
      
      // 如果 home_image_key 被更新且旧值与新值不同，删除旧文件
      if (home_image_key !== undefined && oldHomeImageKey && oldHomeImageKey !== (home_image_key || null)) {
        await deleteBlobFile(oldHomeImageKey);
      }
      
      // 如果 image_url 被更新且旧值与新值不同，删除旧文件
      if (image_url !== undefined && oldImageUrl && oldImageUrl !== (image_url || null)) {
        await deleteBlobFile(oldImageUrl);
      }
      
      // 如果 image_url_small 被更新且旧值与新值不同，删除旧文件
      if (image_url_small !== undefined && oldImageUrlSmall && oldImageUrlSmall !== (image_url_small || null)) {
        await deleteBlobFile(oldImageUrlSmall);
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
    // Update prices
    if (prices && prices.length > 0) {
      await client.from('product_prices').delete().eq('product_id', id);
      const priceRows = prices.map((p: Record<string, unknown>) => ({
        product_id: id,
        store_id: p.store_id,
        current_price: p.current_price,
        original_price: p.original_price || null,
        product_url: p.product_url,
        in_stock: p.in_stock !== false,
        discount_percent: p.discount_percent || null,
        currency: p.currency || '$',
        region: p.region || '',
        no_quote: p.no_quote || false,
      }));
      const { error: priceError } = await client.from('product_prices').insert(priceRows);
      if (priceError) throw new Error(`Update prices failed: ${priceError.message}`);
    }

    // 清理已无促销价格的促销产品记录
    const { data: remainingPromos } = await client
      .from('promotion_products')
      .select('id')
      .eq('product_id', id);
    if (remainingPromos) {
      for (const promo of remainingPromos) {
        const { count: priceCount } = await client
          .from('promotion_product_prices')
          .select('*', { count: 'exact', head: true })
          .eq('promotion_product_id', promo.id);
        if (priceCount === 0) {
          await client.from('promotion_product_translations').delete().eq('promotion_product_id', promo.id);
          await client.from('promotion_products').delete().eq('id', promo.id);
        }
      }
    }

    // Update promotion products and prices
    if (promotion_prices && promotion_prices.length > 0) {
      // Get existing promotion products for this product
      const { data: existingPromoProducts } = await client
        .from('promotion_products')
        .select('id, promotion_id')
        .eq('product_id', id);
      const existingPromoProductMap = new Map((existingPromoProducts || []).map((pp: Record<string, unknown>) => [pp.promotion_id as number, pp.id as number]));
      // Group by promotion_id
      const promotionGroups: Record<number, typeof promotion_prices> = {};
      for (const pp of promotion_prices) {
        const promoId = pp.promotion_id;
        if (!promotionGroups[promoId]) promotionGroups[promoId] = [];
        promotionGroups[promoId].push(pp);
      }
      for (const [promoIdStr, promoPrices] of Object.entries(promotionGroups)) {
        const promoId = parseInt(promoIdStr);
        let promoProductId = existingPromoProductMap.get(promoId);
        if (!promoProductId) {
          // Create promotion_product
          const { data: newPromoProduct, error: ppError } = await client
            .from('promotion_products')
            .insert({
              product_id: id,
              promotion_id: promoId,
              slug: slug,
              category_id: category_id || null,
              image_key: image_url || null,
              home_image_key: home_image_key || null,
              image_url: image_url || null,
              is_active: is_active !== false,
              is_featured: is_featured || false,
            })
            .select()
            .single();
          if (ppError) throw new Error(`Create promotion product failed: ${ppError.message}`);
          promoProductId = newPromoProduct.id;
          // Create translation
          const enTrans = translations?.find((t: Record<string, unknown>) => t.language === 'en');
          if (enTrans) {
            await client.from('promotion_product_translations').insert({
              promotion_product_id: promoProductId,
              language: 'en',
              name: enTrans.name,
              description: enTrans.description || null,
              features: enTrans.features || null,
              specs: enTrans.specs || null,
            });
          }
        } else {
          // Update existing promotion_product
          await client
            .from('promotion_products')
            .update({
              slug: slug,
              category_id: category_id || null,
              image_key: image_url || null,
              home_image_key: home_image_key || null,
              image_url: image_url || null,
              is_active: is_active !== false,
              is_featured: is_featured || false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', promoProductId);
          // Update translation
          const enTrans = translations?.find((t: Record<string, unknown>) => t.language === 'en');
          if (enTrans) {
            await client.from('promotion_product_translations').delete().eq('promotion_product_id', promoProductId);
            await client.from('promotion_product_translations').insert({
              promotion_product_id: promoProductId,
              language: 'en',
              name: enTrans.name,
              description: enTrans.description || null,
              features: enTrans.features || null,
              specs: enTrans.specs || null,
            });
          }
        }
        // Delete existing prices and insert new ones
        await client.from('promotion_product_prices').delete().eq('promotion_product_id', promoProductId);
        const promoPriceRows = promoPrices.map((p: Record<string, unknown>) => ({
          promotion_product_id: promoProductId,
          store_id: p.store_id,
          current_price: p.current_price,
          original_price: p.original_price || null,
          product_url: p.product_url,
          discount_percent: p.discount_percent || null,
          currency: p.currency || '$',
          region: p.region || '',
          no_quote: p.no_quote || false,
          store_type: 'promotion',
          time_type: p.time_type || 'permanent',
          start_time: p.start_time || null,
          end_time: p.end_time || null,
          countdown_action: p.countdown_action || 'close',
          standard_price: p.standard_price || null,
        }));
        const { error: promoPriceError } = await client.from('promotion_product_prices').insert(promoPriceRows);
        if (promoPriceError) throw new Error(`Update promotion prices failed: ${promoPriceError.message}`);
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
    // 获取产品数据以清理关联的 Vercel Blob 图片
    const { data: product } = await client
      .from('products')
      .select('image_url, image_url_small, home_image_key')
      .eq('id', productId)
      .single();
    // 先删除子表数据，避免外键约束冲突
    await client.from('product_translations').delete().eq('product_id', productId);
    await client.from('product_prices').delete().eq('product_id', productId);
    // 清理促销产品关联
    const { data: promoProducts } = await client
      .from('promotion_products')
      .select('id')
      .eq('product_id', productId);
    if (promoProducts) {
      for (const pp of promoProducts) {
        await client.from('promotion_product_prices').delete().eq('promotion_product_id', pp.id);
        await client.from('promotion_product_translations').delete().eq('promotion_product_id', pp.id);
        await client.from('promotion_products').delete().eq('id', pp.id);
      }
    }
    const { error } = await client.from('products').delete().eq('id', productId);
    if (error) throw new Error(`Delete product failed: ${error.message}`);
    // 清理关联的 Vercel Blob 图片
    if (product) {
      await deleteBlobFile((product as Record<string, unknown>).image_url as string | null);
      await deleteBlobFile((product as Record<string, unknown>).image_url_small as string | null);
      await deleteBlobFile((product as Record<string, unknown>).home_image_key as string | null);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
