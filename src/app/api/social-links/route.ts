import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/social-links - Get active social links for frontend
export async function GET() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('social_links')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
