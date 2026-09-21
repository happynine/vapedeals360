import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getServiceRoleClient } from '@/storage/database/supabase-client';
import { deleteFile, extractKeyFromUrl } from '@/lib/storage';

export const runtime = 'nodejs';

// GET /api/admin/authors?language=en
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const language = searchParams.get('language');

  const supabase = getServiceRoleClient();
  let query = supabase.from('authors').select('*');
  if (language) query = query.eq('language', language);
  const { data, error } = await query.order('language', { ascending: true }).order('id', { ascending: true });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

// POST /api/admin/authors
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();

  const body = await request.json();
  const { name, avatar_url, bio, language, is_active, domain, title } = body;
  if (!name || !name.trim()) {
    return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
  }
  const authorDomain = domain === 'best_vapes' ? 'best_vapes' : 'news';

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('authors')
    .insert({
      name: name.trim(),
      avatar_url: avatar_url || null,
      bio: bio || null,
      language: language || 'en',
      is_active: is_active === false ? false : true,
      domain: authorDomain,
      title: title ? String(title).trim() : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

// PUT /api/admin/authors
export async function PUT(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();

  const body = await request.json();
  const { id, name, avatar_url, bio, language, is_active, domain, title } = body;
  if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

  const supabase = getServiceRoleClient();

  // Clean up old avatar when replaced
  if (avatar_url !== undefined) {
    const { data: old } = await supabase.from('authors').select('avatar_url').eq('id', id).single();
    if (old?.avatar_url && old.avatar_url !== avatar_url) {
      const key = extractKeyFromUrl(old.avatar_url);
      if (key) { try { await deleteFile(key); } catch { /* ignore */ } }
    }
  }

  const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updateFields.name = name.trim();
  if (avatar_url !== undefined) updateFields.avatar_url = avatar_url;
  if (bio !== undefined) updateFields.bio = bio;
  if (language !== undefined) updateFields.language = language;
  if (is_active !== undefined) updateFields.is_active = is_active;
  if (domain !== undefined) updateFields.domain = domain === 'best_vapes' ? 'best_vapes' : 'news';
  if (title !== undefined) updateFields.title = title ? String(title).trim() : null;

  const { data, error } = await supabase.from('authors').update(updateFields).eq('id', id).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

// DELETE /api/admin/authors?id=
export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

  const supabase = getServiceRoleClient();
  const { data: old } = await supabase.from('authors').select('avatar_url').eq('id', parseInt(id)).single();

  const { error } = await supabase.from('authors').delete().eq('id', parseInt(id));
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  // FK sets content_page_translations.author_id to NULL automatically.
  // Remove avatar file (R2 keys only; external URLs can't be deleted).
  if (old?.avatar_url) {
    const key = extractKeyFromUrl(old.avatar_url);
    if (key) { try { await deleteFile(key); } catch { /* ignore */ } }
  }

  return NextResponse.json({ success: true });
}
