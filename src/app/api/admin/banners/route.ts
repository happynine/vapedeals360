import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';
import { getPresignedUrl } from '@/lib/storage';
import { del } from '@vercel/blob';

function getClient() {
  return getServiceRoleClient();
}

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

// GET - List all banners with translations
export async function GET(request: Request) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getClient();
    const { data, error } = await client
      .from('banners')
      .select('*, banner_translations(*)')
      .order('sort_order', { ascending: true });

    if (error) throw new Error(`Fetch banners failed: ${error.message}`);

    // Generate accessible URLs for image keys
    const bannersWithUrls = await Promise.all(
      (data || []).map(async (banner: Record<string, unknown>) => {
        const translations = (banner.banner_translations || []) as Record<string, unknown>[];
        const translationsWithUrls = await Promise.all(
          translations.map(async (t) => {
            const imgKey = t.image_key as string | null;
            const imageUrl = await getPresignedUrl(imgKey);
            return { ...t, image_url: imageUrl };
          })
        );

        const defaultImageUrl = await getPresignedUrl(banner.image_key as string | null);
        const defaultMobileImageUrl = await getPresignedUrl(banner.mobile_image_key as string | null);

        return {
          ...banner,
          banner_translations: translationsWithUrls,
          image_url: defaultImageUrl,
          mobile_image_url: defaultMobileImageUrl,
        };
      })
    );

    return NextResponse.json({ success: true, data: bannersWithUrls });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch banners';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST - Create banner
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getClient();
    const body = await request.json();
    const { image_key, mobile_image_key, link_url, sort_order, is_active, translations } = body;

    const { data, error } = await client
      .from('banners')
      .insert({
        image_key: image_key || null,
        mobile_image_key: mobile_image_key || null,
        link_url: link_url || null,
        sort_order: sort_order || 0,
        is_active: is_active !== false,
      })
      .select()
      .single();

    if (error) throw new Error(`Create banner failed: ${error.message}`);

    const banner = data as Record<string, unknown>;

    // Insert translations
    if (translations && Array.isArray(translations) && translations.length > 0) {
      const translationRecords = translations.map((t: { language: string; image_key?: string; title?: string; subtitle?: string }) => ({
        banner_id: banner.id,
        language: t.language,
        image_key: t.image_key || null,
        title: t.title || null,
        subtitle: t.subtitle || null,
      }));

      const { error: tError } = await client.from('banner_translations').insert(translationRecords);
      if (tError) throw new Error(`Create banner translations failed: ${tError.message}`);
    }

    return NextResponse.json({ success: true, data: banner });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create banner';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT - Update banner
export async function PUT(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getClient();
    const body = await request.json();
    const { id, image_key, mobile_image_key, link_url, sort_order, is_active, translations } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Banner ID is required' }, { status: 400 });
    }

    // 获取旧的 banner 数据，用于删除旧图片
    const { data: oldBanner } = await client
      .from('banners')
      .select('image_key, mobile_image_key')
      .eq('id', id)
      .single();

    const updateData: Record<string, unknown> = {};
    if (image_key !== undefined) updateData.image_key = image_key || null;
    if (mobile_image_key !== undefined) updateData.mobile_image_key = mobile_image_key || null;
    if (link_url !== undefined) updateData.link_url = link_url || null;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (is_active !== undefined) updateData.is_active = is_active;
    updateData.updated_at = new Date().toISOString();

    const { error } = await client.from('banners').update(updateData).eq('id', id);
    if (error) throw new Error(`Update banner failed: ${error.message}`);

    // 删除旧的 Vercel Blob 文件（当 image_key 被更新时）
    if (oldBanner) {
      const oldImageKey = oldBanner.image_key as string | null;
      const oldMobileImageKey = oldBanner.mobile_image_key as string | null;
      
      // 如果 image_key 被更新且旧值与新值不同，删除旧文件
      if (image_key !== undefined && oldImageKey && oldImageKey !== (image_key || null)) {
        await deleteBlobFile(oldImageKey);
      }
      
      // 如果 mobile_image_key 被更新且旧值与新值不同，删除旧文件
      if (mobile_image_key !== undefined && oldMobileImageKey && oldMobileImageKey !== (mobile_image_key || null)) {
        await deleteBlobFile(oldMobileImageKey);
      }
    }

    // Update translations: delete old, insert new
    if (translations && Array.isArray(translations)) {
      // 获取旧的翻译记录，用于删除旧图片
      const { data: oldTranslations } = await client
        .from('banner_translations')
        .select('image_key')
        .eq('banner_id', id);
      
      await client.from('banner_translations').delete().eq('banner_id', id);

      // 删除旧翻译图片（只删除不在新翻译中使用的）
      if (oldTranslations && oldTranslations.length > 0) {
        const newImageKeys = new Set(
          translations.map((t: { image_key?: string }) => t.image_key || null).filter(Boolean)
        );
        
        for (const t of oldTranslations) {
          const oldKey = t.image_key as string | null;
          if (oldKey && !newImageKeys.has(oldKey)) {
            await deleteBlobFile(oldKey);
          }
        }
      }

      if (translations.length > 0) {
        const translationRecords = translations.map((t: { language: string; image_key?: string; title?: string; subtitle?: string }) => ({
          banner_id: id,
          language: t.language,
          image_key: t.image_key || null,
          title: t.title || null,
          subtitle: t.subtitle || null,
        }));

        const { error: tError } = await client.from('banner_translations').insert(translationRecords);
        if (tError) throw new Error(`Update banner translations failed: ${tError.message}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update banner';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE - Delete banner
export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Banner ID is required' }, { status: 400 });
    }

    // 获取要删除的 banner 数据和翻译记录，用于删除关联图片
    const { data: bannerToDelete } = await client
      .from('banners')
      .select('image_key, mobile_image_key')
      .eq('id', parseInt(id))
      .single();

    const { data: translationsToDelete } = await client
      .from('banner_translations')
      .select('image_key')
      .eq('banner_id', parseInt(id));

    // Delete translations first (cascade should handle this, but be explicit)
    await client.from('banner_translations').delete().eq('banner_id', parseInt(id));
    const { error } = await client.from('banners').delete().eq('id', parseInt(id));
    if (error) throw new Error(`Delete banner failed: ${error.message}`);

    // 删除关联的 Vercel Blob 文件
    if (bannerToDelete) {
      await deleteBlobFile(bannerToDelete.image_key);
      await deleteBlobFile(bannerToDelete.mobile_image_key);
    }
    if (translationsToDelete && translationsToDelete.length > 0) {
      for (const t of translationsToDelete) {
        await deleteBlobFile(t.image_key);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete banner';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
