import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getPresignedUrl } from '@/lib/storage';

function getClient() {
  return getSupabaseClient();
}

// GET - List all banners with translations
export async function GET() {
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
  try {
    const client = getClient();
    const body = await request.json();
    const { id, image_key, mobile_image_key, link_url, sort_order, is_active, translations } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Banner ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (image_key !== undefined) updateData.image_key = image_key || null;
    if (mobile_image_key !== undefined) updateData.mobile_image_key = mobile_image_key || null;
    if (link_url !== undefined) updateData.link_url = link_url || null;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (is_active !== undefined) updateData.is_active = is_active;
    updateData.updated_at = new Date().toISOString();

    const { error } = await client.from('banners').update(updateData).eq('id', id);
    if (error) throw new Error(`Update banner failed: ${error.message}`);

    // Update translations: delete old, insert new
    if (translations && Array.isArray(translations)) {
      await client.from('banner_translations').delete().eq('banner_id', id);

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
  try {
    const client = getClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Banner ID is required' }, { status: 400 });
    }

    // Delete translations first (cascade should handle this, but be explicit)
    await client.from('banner_translations').delete().eq('banner_id', parseInt(id));
    const { error } = await client.from('banners').delete().eq('id', parseInt(id));
    if (error) throw new Error(`Delete banner failed: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete banner';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
