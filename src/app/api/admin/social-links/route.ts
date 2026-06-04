import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/admin/social-links - Get all social links for admin
export async function GET(request: Request) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('social_links')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// POST /api/admin/social-links - Create a social link
export async function POST(request: Request) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  const supabase = getSupabaseClient();
  const body = await request.json();
  const { platform, url, icon, sort_order } = body;

  if (!platform || !url) {
    return NextResponse.json({ success: false, error: 'Platform and URL are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('social_links')
    .insert({ platform, url, icon: icon || null, sort_order: sort_order || 0, is_active: true })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// PUT /api/admin/social-links - Update a social link
export async function PUT(request: Request) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  const supabase = getSupabaseClient();
  const body = await request.json();
  const { id, platform, url, icon, sort_order, is_active } = body;

  if (!id) {
    return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (platform !== undefined) updates.platform = platform;
  if (url !== undefined) updates.url = url;
  if (icon !== undefined) updates.icon = icon;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from('social_links')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// DELETE /api/admin/social-links - Delete a social link
export async function DELETE(request: Request) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('social_links')
    .delete()
    .eq('id', Number(id));

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
