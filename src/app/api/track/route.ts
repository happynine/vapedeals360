import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, product_id, store_id, banner_id, session_id, page, referrer, event_type, target_id, metadata } = body as {
      type?: string;
      product_id?: number;
      store_id?: number;
      banner_id?: number;
      session_id?: string;
      page?: string;
      referrer?: string;
      event_type?: string;
      target_id?: number | null;
      metadata?: Record<string, unknown> | null;
    };

    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    // Generate or use session_id
    const sid = session_id || `sid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Get visitor IP (x-forwarded-for may contain multiple IPs, take only the first)
    const rawIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const ip = rawIp.split(',')[0].trim().slice(0, 45);
    const ua = request.headers.get('user-agent') || 'unknown';

    const effectiveType = type || event_type;

    // If it's a page_view or no type specified (legacy support from homepage), record page view
    if (!effectiveType || effectiveType === 'page_view') {
      const { error } = await supabase.from('page_views').insert({
        session_id: sid,
        page: page || '/',
        referrer: referrer || request.headers.get('referer') || null,
        ip: ip,
        user_agent: ua,
        created_at: now,
      });
      if (error) console.error('Track page_view error:', error);
    }

    // If it's a click event, record in click_events
    if (effectiveType && effectiveType !== 'page_view') {
      let finalTargetId: number | null = target_id || null;
      let finalMetadata: Record<string, unknown> = metadata || {};

      if (effectiveType === 'product_click' && product_id) {
        finalTargetId = product_id;
        finalMetadata = { product_id };
      } else if (effectiveType === 'buy_click' && product_id) {
        finalTargetId = product_id;
        finalMetadata = { product_id, store_id: store_id || null };
      } else if (effectiveType === 'visit_store' && store_id) {
        finalTargetId = store_id;
        finalMetadata = { store_id, product_id: product_id || null };
      } else if (effectiveType === 'banner_click' && banner_id) {
        finalTargetId = banner_id;
        finalMetadata = { banner_id };
      }

      const { error } = await supabase.from('click_events').insert({
        session_id: sid,
        event_type: effectiveType,
        target_id: finalTargetId ? String(finalTargetId) : null,
        metadata: finalMetadata ? JSON.stringify(finalMetadata) : null,
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
