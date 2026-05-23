import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { session_id, page, referrer, ip, user_agent } = body;

    if (!session_id || !page) {
      return Response.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const { error } = await supabase.from('page_views').insert({
      session_id,
      page,
      referrer: referrer || null,
      ip: ip || null,
      user_agent: user_agent || null,
    });

    if (error) throw error;

    // Also record a click event if provided
    if (body.event_type) {
      await supabase.from('click_events').insert({
        session_id,
        event_type: body.event_type,
        target_id: body.target_id || null,
        metadata: body.metadata || null,
      });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('Failed to track:', err);
    return Response.json({ success: false, error: 'Failed to track' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // format: YYYY-MM or "all"

    const startDate = month && month !== 'all' ? `${month}-01T00:00:00Z` : '2000-01-01T00:00:00Z';
    const endDate = month && month !== 'all' ? getNextMonth(month) : '2099-12-31T23:59:59Z';

    // Get all page views for calculations
    const { data: allViews, error: viewsError } = await supabase
      .from('page_views')
      .select('session_id, created_at, page, ip')
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('created_at', { ascending: true })
      .limit(50000);

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
    const newVisitorRatio = totalVV > 0 ? (newVisitors / totalVV * 100).toFixed(1) : '0';
    const bounceRate = totalVV > 0 ? (newVisitors / totalVV * 100).toFixed(1) : '0';

    let totalDuration = 0;
    let durationCount = 0;
    sessions.forEach(s => {
      const dur = new Date(s.endTime).getTime() - new Date(s.startTime).getTime();
      if (dur > 0) { totalDuration += dur; durationCount++; }
    });
    const avgDurationMs = durationCount > 0 ? totalDuration / durationCount : 0;
    const avgDurationMin = (avgDurationMs / 60000).toFixed(1);

    const avgPages = totalVV > 0 ? (totalPV / totalVV).toFixed(1) : '0';

    const chartData = Array.from(dailyStats.entries())
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

    const clickStats: Record<string, { total: number; items: Record<string, number> }> = {};
    (clickData || []).forEach((c: { event_type: string; target_id: string | null }) => {
      if (!clickStats[c.event_type]) clickStats[c.event_type] = { total: 0, items: {} };
      clickStats[c.event_type].total++;
      if (c.target_id) {
        clickStats[c.event_type].items[c.target_id] = (clickStats[c.event_type].items[c.target_id] || 0) + 1;
      }
    });

    return Response.json({
      success: true,
      data: {
        macro: {
          pv: totalPV,
          uv: totalUV,
          vv: totalVV,
          ip_count: totalIPs,
          new_visitor_ratio: newVisitorRatio + '%',
          bounce_rate: bounceRate + '%',
          avg_duration: avgDurationMin + ' min',
          avg_pages: avgPages,
        },
        chart: chartData,
        clicks: clickStats,
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
