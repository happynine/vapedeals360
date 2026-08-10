import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';
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
export async function GET(request: NextRequest) {
  try {
    const client = getServiceRoleClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;
    const { data: promotions, error: promotionsError } = await client
      .from('promotions')
      .select(`
        *,
        promotion_translations (
          id, language, name, title, description,
          cover_image_key, cover_image_url,
          mobile_cover_image_key, mobile_cover_image_url
        )
      `)
      .order('sort_order', { ascending: true })
      .range(offset, offset + limit - 1);
    if (promotionsError) {
      return NextResponse.json({ error: promotionsError.message }, { status: 500 });
    }
    const { count, error: countError } = await client
      .from('promotions')
      .select('*', { count: 'exact', head: true });
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }
    const promotionsWithProductCount = await Promise.all(
      (promotions || []).map(async (promotion) => {
        const { count: productCount } = await client
          .from('promotion_products')
          .select('*', { count: 'exact', head: true })
          .eq('promotion_id', promotion.id);
        return { ...promotion, product_count: productCount || 0 };
      })
    );
    return NextResponse.json({
      success: true,
      data: {
        promotions: promotionsWithProductCount,
        pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) }
      }
    });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const client = getServiceRoleClient();
    const body = await request.json();
    const { title, slug, special_price, currency, sort_order, is_active, translations, products } = body;
    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }
    const { data: existingPromotion } = await client
      .from('promotions').select('id').eq('slug', slug).single();
    if (existingPromotion) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 400 });
    }
    const { data: promotion, error: promotionError } = await client
      .from('promotions')
      .insert({ title: title || '', slug, special_price, currency: currency || '$', sort_order: sort_order || 0, is_active: is_active ?? true, updated_at: new Date().toISOString() })
      .select().single();
    if (promotionError) {
      return NextResponse.json({ error: promotionError.message }, { status: 500 });
    }
    if (translations && translations.length > 0) {
      const translationsData = translations.map((t: { language: string; name?: string; title?: string; description?: string; cover_image_key?: string; cover_image_url?: string; mobile_cover_image_key?: string; mobile_cover_image_url?: string }) => ({
        promotion_id: promotion.id, language: t.language, name: t.name, title: t.title, description: t.description,
        cover_image_key: t.cover_image_key, cover_image_url: t.cover_image_url,
        mobile_cover_image_key: t.mobile_cover_image_key, mobile_cover_image_url: t.mobile_cover_image_url,
      }));
      const { error: translationsError } = await client.from('promotion_translations').insert(translationsData);
      if (translationsError) {
        await client.from('promotions').delete().eq('id', promotion.id);
        return NextResponse.json({ error: translationsError.message }, { status: 500 });
      }
    }
    if (products && products.length > 0) {
      const productsData = products.map((p: { product_id: number; special_price?: number; currency?: string; time_type?: string; start_time?: string; end_time?: string; countdown_action?: string }) => ({
        promotion_id: promotion.id, product_id: p.product_id, special_price: p.special_price, currency: p.currency,
        time_type: p.time_type || 'permanent', start_time: p.start_time, end_time: p.end_time, countdown_action: p.countdown_action || 'close'
      }));
      const { error: productsError } = await client.from('promotion_products').insert(productsData);
      if (productsError) { console.error('Error linking products:', productsError); }
    }
    return NextResponse.json({ success: true, data: promotion });
  } catch (error) {
    console.error('Error creating promotion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export async function PUT(request: NextRequest) {
  try {
    const client = getServiceRoleClient();
    const body = await request.json();
    const { id, title, slug, special_price, currency, sort_order, is_active, translations, products } = body;
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }
    // 获取旧的翻译数据，用于删除旧图片
    const { data: oldTranslations } = await client
      .from('promotion_translations')
      .select('cover_image_url, mobile_cover_image_url')
      .eq('promotion_id', id);
    const { data: promotion, error: promotionError } = await client
      .from('promotions')
      .update({ title, slug, special_price, currency: currency || '$', sort_order, is_active, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (promotionError) {
      return NextResponse.json({ error: promotionError.message }, { status: 500 });
    }
    if (translations && translations.length > 0) {
      // 收集新翻译中所有引用的图片 URL
      const newImageUrls = new Set<string>();
      for (const t of translations) {
        if (t.cover_image_url) newImageUrls.add(t.cover_image_url);
        if (t.mobile_cover_image_url) newImageUrls.add(t.mobile_cover_image_url);
      }
      await client.from('promotion_translations').delete().eq('promotion_id', id);
      const translationsData = translations.map((t: { language: string; name?: string; title?: string; description?: string; cover_image_key?: string; cover_image_url?: string; mobile_cover_image_key?: string; mobile_cover_image_url?: string }) => ({
        promotion_id: id, language: t.language, name: t.name, title: t.title, description: t.description,
        cover_image_key: t.cover_image_key, cover_image_url: t.cover_image_url,
        mobile_cover_image_key: t.mobile_cover_image_key, mobile_cover_image_url: t.mobile_cover_image_url,
      }));
      const { error: translationsError } = await client.from('promotion_translations').insert(translationsData);
      if (translationsError) {
        return NextResponse.json({ error: translationsError.message }, { status: 500 });
      }
      // 清理不再被引用的旧图片
      if (oldTranslations && oldTranslations.length > 0) {
        for (const oldT of oldTranslations) {
          const oldCover = oldT.cover_image_url as string | null;
          const oldMobileCover = oldT.mobile_cover_image_url as string | null;
          if (oldCover && !newImageUrls.has(oldCover)) {
            await deleteBlobFile(oldCover);
          }
          if (oldMobileCover && !newImageUrls.has(oldMobileCover)) {
            await deleteBlobFile(oldMobileCover);
          }
        }
      }
    }
    if (products !== undefined) {
      await client.from('promotion_products').delete().eq('promotion_id', id);
      if (products.length > 0) {
        const productsData = products.map((p: { product_id: number; special_price?: number; currency?: string; time_type?: string; start_time?: string; end_time?: string; countdown_action?: string }) => ({
          promotion_id: id, product_id: p.product_id, special_price: p.special_price, currency: p.currency,
          time_type: p.time_type || 'permanent', start_time: p.start_time, end_time: p.end_time, countdown_action: p.countdown_action || 'close'
        }));
        const { error: productsError } = await client.from('promotion_products').insert(productsData);
        if (productsError) { console.error('Error linking products:', productsError); }
      }
    }
    return NextResponse.json({ success: true, data: promotion });
  } catch (error) {
    console.error('Error updating promotion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export async function DELETE(request: NextRequest) {
  try {
    const client = getServiceRoleClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }
    // 获取关联的翻译数据以清理 Vercel Blob 图片
    const { data: translations } = await client
      .from('promotion_translations')
      .select('cover_image_url, mobile_cover_image_url')
      .eq('promotion_id', parseInt(id));
    const { error } = await client.from('promotions').delete().eq('id', parseInt(id));
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // 清理关联的 Vercel Blob 图片
    if (translations && translations.length > 0) {
      for (const t of translations) {
        await deleteBlobFile((t as Record<string, unknown>).cover_image_url as string | null);
        await deleteBlobFile((t as Record<string, unknown>).mobile_cover_image_url as string | null);
      }
    }
    return NextResponse.json({ success: true, message: 'Promotion deleted successfully' });
  } catch (error) {
    console.error('Error deleting promotion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
