import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
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
// GET all stores
export async function GET(request: Request) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getServiceRoleClient();
    const { data, error } = await client
      .from('stores')
      .select('*, store_translations(*)')
      .order('id', { ascending: true });
    if (error) throw new Error(`Fetch failed: ${error.message}`);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stores API] Update error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
// POST create store
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getServiceRoleClient();
    const body = await request.json();
    const { slug, logo_url, website_url, website_urls, is_active, store_type, regions, notes, translations } = body;
    // Check for duplicate slug
    if (slug) {
      const { data: existing } = await client
        .from('stores')
        .select('id')
        .ilike('slug', slug)
        .limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json({ success: false, error: 'Slug already exists' }, { status: 409 });
      }
    }
    const { data: store, error: storeError } = await client
      .from('stores')
      .insert({ slug, logo_url, website_url, website_urls: website_urls || [], is_active: is_active !== false, store_type: store_type || 'store', regions: regions || [], notes: notes || '' })
      .select()
      .single();
    if (storeError) throw new Error(`Create store failed: ${storeError.message}`);
    if (translations && translations.length > 0) {
      const transRows = translations.map((t: { language: string; name: string }) => ({
        store_id: (store as Record<string, unknown>).id,
        language: t.language,
        name: t.name,
      }));
      const { error: transError } = await client.from('store_translations').insert(transRows);
      if (transError) throw new Error(`Create translations failed: ${transError.message}`);
    }
    return NextResponse.json({ success: true, data: store });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stores API] Update error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
// PUT update store
export async function PUT(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getServiceRoleClient();
    const body = await request.json();
    const { id, slug, logo_url, website_url, website_urls, is_active, store_type, regions, notes, translations } = body;
    
    console.log('[Stores API] Update request:', { id, slug, store_type, hasTranslations: !!translations });
    // Check for duplicate slug (exclude current store)
    if (slug) {
      const { data: existing } = await client
        .from('stores')
        .select('id')
        .ilike('slug', slug)
        .neq('id', id)
        .limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json({ success: false, error: 'Slug already exists' }, { status: 409 });
      }
    }
    // 获取旧的门店数据，用于删除旧图片
    const { data: oldStore } = await client
      .from('stores')
      .select('logo_url')
      .eq('id', id)
      .single();
    const { data: store, error: storeError } = await client
      .from('stores')
      .update({ slug, logo_url, website_url, website_urls: website_urls || [], is_active, store_type, regions, notes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (storeError) throw new Error(`Update store failed: ${storeError.message}`);
    // 删除旧的 Vercel Blob 图片（当 logo_url 被更新时）
    if (oldStore) {
      const oldLogoUrl = oldStore.logo_url as string | null;
      if (oldLogoUrl && oldLogoUrl !== (logo_url || null)) {
        await deleteBlobFile(oldLogoUrl);
      }
    }
    if (translations && translations.length > 0) {
      await client.from('store_translations').delete().eq('store_id', id);
      const transRows = translations.map((t: { language: string; name: string }) => ({
        store_id: id,
        language: t.language,
        name: t.name,
      }));
      const { error: transError } = await client.from('store_translations').insert(transRows);
      if (transError) throw new Error(`Update translations failed: ${transError.message}`);
    }
    return NextResponse.json({ success: true, data: store });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stores API] Update error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
// DELETE store
export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getServiceRoleClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('Missing id parameter');
    // 获取门店数据以清理关联的 Vercel Blob 图片
    const { data: store } = await client
      .from('stores')
      .select('logo_url')
      .eq('id', parseInt(id))
      .single();
    const { error } = await client.from('stores').delete().eq('id', parseInt(id));
    if (error) throw new Error(`Delete store failed: ${error.message}`);
    // 清理关联的 Vercel Blob 图片
    if (store) {
      await deleteBlobFile((store as Record<string, unknown>).logo_url as string | null);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stores API] Update error:', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
