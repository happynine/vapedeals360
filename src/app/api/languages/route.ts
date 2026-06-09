import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET active languages (public, no auth required)
export async function GET() {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('languages')
      .select('code, name')
      .eq('is_active', true)
      .eq('is_hidden', false)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`Fetch failed: ${error.message}`);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
