import { getSupabaseClient } from '@/storage/database/supabase-client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const rl = checkRateLimit(request, "public");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // format: YYYY-MM or "all"
    const region = searchParams.get('region'); // USA, UK, Canada, Russia, Japan, Europe, Global, or null for all

    const startDate = month && month !== 'all' ? `${month}-01T00:00:00Z` : '2000-01-01T00:00:00Z';
    const endDate = month && month !== 'all' ? getNextMonth(month) : '2099-12-31T23:59:59Z';

    // Build base query with optional region filter
    let pageViewsQuery = supabase
      .from('page_views')
      .select('session_id, created_at, page, ip, region')
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('created_at', { ascending: true })
      .limit(50000);

    // Apply region filter if specified
    if (region && region !== 'all') {
      pageViewsQuery = pageViewsQuery.eq('region', region);
    }

    const { data: allViews, error: viewsError } = await pageViewsQuery;

    if (viewsError) throw viewsError;

    // Calculate metrics from raw data
    const sessions = new Map<string, { pages: number; ips: Set<string>; startTime: string; endTime: string }>();
    const dailyStats = new Map<string, { pv: number; sessions: Set<string>; ips: Set<string> }>();

    (allViews || []).forEach((v: { session_id: string; created_at: string; page: string; ip: string | null }) => {
      if (!sessions.has(v.session_id)) {
        sessions.set(v.session_id, { pages: 0, ips: new Set(), startTime: v.created_at, endTime: v.created_at });
      }
      const s = sessions.get(v.session_id)!;
      s.pages++;
      if (v.ip) s.ips.add(v.ip);
      if (v.created_at < s.startTime) s.startTime = v.created_at;
      if (v.created_at > s.endTime) s.endTime = v.created_at;

      const day = v.created_at.substring(0, 10);
      if (!dailyStats.has(day)) {
        dailyStats.set(day, { pv: 0, sessions: new Set(), ips: new Set() });
      }
      const d = dailyStats.get(day)!;
      d.pv++;
      d.sessions.add(v.session_id);
      if (v.ip) d.ips.add(v.ip);
    });

    const totalPV = allViews?.length || 0;
    const totalUV = sessions.size;
    const totalVV = sessions.size;
    const allIPs = new Set<string>();
    sessions.forEach(s => s.ips.forEach(ip => allIPs.add(ip)));
    const totalIPs = allIPs.size;

    const newVisitors = Array.from(sessions.values()).filter(s => s.pages === 1).length;
    const newVisitorRatio = totalVV > 0 ? (newVisitors / totalVV * 100) : 0;
    const bounceRate = totalVV > 0 ? (newVisitors / totalVV * 100) : 0;

    let totalDuration = 0;
    let durationCount = 0;
    sessions.forEach(s => {
      const dur = new Date(s.endTime).getTime() - new Date(s.startTime).getTime();
      if (dur > 0) { totalDuration += dur; durationCount++; }
    });
    const avgDurationSec = durationCount > 0 ? (totalDuration / durationCount / 1000) : 0;

    const avgPages = totalVV > 0 ? (totalPV / totalVV) : 0;

    // Trend data for chart (daily PV/UV)
    const trend = Array.from(dailyStats.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        pv: d.pv,
        uv: d.sessions.size,
        ip: d.ips.size,
      }));

    // Click events stats
    const { data: clickData } = await supabase
      .from('click_events')
      .select('event_type, target_id')
      .gte('created_at', startDate)
      .lt('created_at', endDate);

    // Map event_type to the keys the admin page expects
    const clickRates: Record<string, number> = {};
    (clickData || []).forEach((c: { event_type: string }) => {
      const eventType = c.event_type;
      if (eventType === 'product_click') {
        clickRates['product_card'] = (clickRates['product_card'] || 0) + 1;
      } else if (eventType === 'buy_click') {
        clickRates['buy_button'] = (clickRates['buy_button'] || 0) + 1;
      } else if (eventType === 'visit_store') {
        clickRates['visit_store'] = (clickRates['visit_store'] || 0) + 1;
      } else if (eventType === 'banner_click') {
        clickRates['banner'] = (clickRates['banner'] || 0) + 1;
      }
    });

    return Response.json({
      success: true,
      data: {
        summary: {
          pv: totalPV,
          uv: totalUV,
          vv: totalVV,
          ip: totalIPs,
          new_visitor_rate: newVisitorRatio,
          bounce_rate: bounceRate,
          avg_duration: avgDurationSec,
          avg_pages: avgPages,
        },
        trend,
        clickRates,
      },
    });
  } catch (err) {
    console.error('Failed to get analytics:', err);
    return Response.json({ success: false, error: 'Failed to get analytics' }, { status: 500 });
  }
}

function getNextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return `${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00Z`;
}
