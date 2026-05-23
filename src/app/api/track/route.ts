import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, product_id, store_id, banner_id, session_id, page } = body as {
      type: string;
      product_id?: number;
      store_id?: number;
      banner_id?: number;
      session_id?: string;
      page?: string;
    };

    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    // Generate or use session_id
    const sid = session_id || `sid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Get visitor IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (type === 'page_view') {
      // Record page view
      const { error } = await supabase.from('page_views').insert({
        session_id: sid,
        page: page || '/',
        referrer: request.headers.get('referer') || null,
        ip: ip,
        user_agent: ua,
        created_at: now,
      });
      if (error) console.error('Track page_view error:', error);
    } else {
      // Record click event
      let targetId: number | null = null;
      let metadata: Record<string, unknown> = {};

      if (type === 'product_click' && product_id) {
        targetId = product_id;
        metadata = { product_id };
      } else if (type === 'buy_click' && product_id) {
        targetId = product_id;
        metadata = { product_id, store_id: store_id || null };
      } else if (type === 'visit_store' && store_id) {
        targetId = store_id;
        metadata = { store_id, product_id: product_id || null };
      } else if (type === 'banner_click' && banner_id) {
        targetId = banner_id;
        metadata = { banner_id };
      }

      const { error } = await supabase.from('click_events').insert({
        session_id: sid,
        event_type: type,
        target_id: targetId,
        metadata: metadata,
        created_at: now,
      });
      if (error) console.error('Track click error:', error);
    }

    return NextResponse.json({ success: true, session_id: sid });
  } catch (err) {
    console.error('Track error:', err);
    return NextResponse.json({ success: true }); // Always succeed to not block UX
  }
}
