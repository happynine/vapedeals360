import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET - 获取活动列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') || 'en';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // 获取活动列表
    const { data: promotions, error: promotionsError } = await client
      .from('promotions')
      .select(`
        *,
        promotion_translations (
          id,
          language,
          name,
          cover_image_key,
          cover_image_url
        )
      `)
      .order('sort_order', { ascending: true })
      .range(offset, offset + limit - 1);

    if (promotionsError) {
      return NextResponse.json({ error: promotionsError.message }, { status: 500 });
    }

    // 获取总数
    const { count, error: countError } = await client
      .from('promotions')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    // 为每个活动获取产品数量
    const promotionsWithProductCount = await Promise.all(
      (promotions || []).map(async (promotion) => {
        const { count: productCount } = await client
          .from('promotion_products')
          .select('*', { count: 'exact', head: true })
          .eq('promotion_id', promotion.id);

        return {
          ...promotion,
          product_count: productCount || 0
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        promotions: promotionsWithProductCount,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - 创建新活动
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();

    const {
      title,
      slug,
      special_price,
      currency,
      sort_order,
      is_active,
      translations,
      products
    } = body;

    // 验证必填字段
    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    // 检查slug是否已存在
    const { data: existingPromotion } = await client
      .from('promotions')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existingPromotion) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 400 });
    }

    // 创建活动（不含时间字段，时间字段在产品级别）
    const { data: promotion, error: promotionError } = await client
      .from('promotions')
      .insert({
        title: title || '',
        slug,
        special_price,
        currency: currency || '$',
        sort_order: sort_order || 0,
        is_active: is_active ?? true,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (promotionError) {
      return NextResponse.json({ error: promotionError.message }, { status: 500 });
    }

    // 创建翻译
    if (translations && translations.length > 0) {
      const translationsData = translations.map((t: { language: string; name?: string; title?: string; description?: string; cover_image_key?: string; cover_image_url?: string }) => ({
        promotion_id: promotion.id,
        language: t.language,
        name: t.name,
        title: t.title,
        description: t.description,
        cover_image_key: t.cover_image_key,
        cover_image_url: t.cover_image_url
      }));

      const { error: translationsError } = await client
        .from('promotion_translations')
        .insert(translationsData);

      if (translationsError) {
        // 回滚活动创建
        await client.from('promotions').delete().eq('id', promotion.id);
        return NextResponse.json({ error: translationsError.message }, { status: 500 });
      }
    }

    // 关联产品（包含时间字段）
    if (products && products.length > 0) {
      const productsData = products.map((p: { product_id: number; special_price?: number; currency?: string; time_type?: string; start_time?: string; end_time?: string; countdown_action?: string }) => ({
        promotion_id: promotion.id,
        product_id: p.product_id,
        special_price: p.special_price,
        currency: p.currency,
        time_type: p.time_type || 'permanent',
        start_time: p.start_time,
        end_time: p.end_time,
        countdown_action: p.countdown_action || 'close'
      }));

      const { error: productsError } = await client
        .from('promotion_products')
        .insert(productsData);

      if (productsError) {
        console.error('Error linking products:', productsError);
      }
    }

    return NextResponse.json({
      success: true,
      data: promotion
    });
  } catch (error) {
    console.error('Error creating promotion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - 更新活动
export async function PUT(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();

    const {
      id,
      title,
      slug,
      special_price,
      currency,
      sort_order,
      is_active,
      translations,
      products
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // 更新活动（不含时间字段）
    const { data: promotion, error: promotionError } = await client
      .from('promotions')
      .update({
        title,
        slug,
        special_price,
        currency: currency || '$',
        sort_order,
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (promotionError) {
      return NextResponse.json({ error: promotionError.message }, { status: 500 });
    }

    // 更新翻译
    if (translations && translations.length > 0) {
      // 先删除旧的翻译
      await client.from('promotion_translations').delete().eq('promotion_id', id);

      // 插入新的翻译
      const translationsData = translations.map((t: { language: string; name?: string; title?: string; description?: string; cover_image_key?: string; cover_image_url?: string }) => ({
        promotion_id: id,
        language: t.language,
        name: t.name,
        title: t.title,
        description: t.description,
        cover_image_key: t.cover_image_key,
        cover_image_url: t.cover_image_url
      }));

      const { error: translationsError } = await client
        .from('promotion_translations')
        .insert(translationsData);

      if (translationsError) {
        return NextResponse.json({ error: translationsError.message }, { status: 500 });
      }
    }

    // 更新产品关联（包含时间字段）
    if (products !== undefined) {
      // 先删除旧的关联
      await client.from('promotion_products').delete().eq('promotion_id', id);

      // 插入新的关联
      if (products.length > 0) {
        const productsData = products.map((p: { product_id: number; special_price?: number; currency?: string; time_type?: string; start_time?: string; end_time?: string; countdown_action?: string }) => ({
          promotion_id: id,
          product_id: p.product_id,
          special_price: p.special_price,
          currency: p.currency,
          time_type: p.time_type || 'permanent',
          start_time: p.start_time,
          end_time: p.end_time,
          countdown_action: p.countdown_action || 'close'
        }));

        const { error: productsError } = await client
          .from('promotion_products')
          .insert(productsData);

        if (productsError) {
          console.error('Error linking products:', productsError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: promotion
    });
  } catch (error) {
    console.error('Error updating promotion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - 删除活动
export async function DELETE(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // 删除活动（关联的翻译和产品会自动删除）
    const { error } = await client
      .from('promotions')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Promotion deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting promotion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}