import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET all languages
export async function GET(request: Request) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('languages')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`Fetch failed: ${error.message}`);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST create language
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const body = await request.json();
    const { code, name, is_active, is_hidden, sort_order } = body;
    if (!code || !name) {
      return NextResponse.json({ success: false, error: 'Code and name are required' }, { status: 400 });
    }
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('languages')
      .insert({ code, name, is_active: is_active !== false, is_hidden: is_hidden === true, sort_order: sort_order || 0 })
      .select()
      .single();
    if (error) throw new Error(`Insert failed: ${error.message}`);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT update language
export async function PUT(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const body = await request.json();
    const { id, code, name, is_active, is_hidden, sort_order } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }
    const client = getSupabaseClient();
    const updateData: Record<string, unknown> = {};
    if (code !== undefined) updateData.code = code;
    if (name !== undefined) updateData.name = name;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (is_hidden !== undefined) updateData.is_hidden = is_hidden;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    const { data, error } = await client
      .from('languages')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Update failed: ${error.message}`);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE language
export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }
    const client = getSupabaseClient();
    const { error } = await client
      .from('languages')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Delete failed: ${error.message}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
