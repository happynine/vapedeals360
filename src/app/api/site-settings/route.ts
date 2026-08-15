import { getSupabaseClient } from '@/storage/database/supabase-client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getPresignedUrl } from '@/lib/storage';

// API routes for client-side fetching - allow ISR caching at page level
export async function GET(request: Request) {
  const rl = checkRateLimit(request, "public");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  try {
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') || 'en';
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('site_settings')
      .select('*, site_setting_translations(*)')
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return Response.json({ success: true, data: { site_name: null, logo_url: null } });
    }

    const translations = (data.site_setting_translations || []).map(
      (t: { id: number; site_setting_id: number; language: string; site_name: string; disclaimer?: string | null; disclaimer_hidden?: boolean; ai_disclosure?: string | null; ai_disclosure_hidden?: boolean }) => ({
        id: t.id,
        site_setting_id: t.site_setting_id,
        language: t.language,
        site_name: t.site_name,
        disclaimer: t.disclaimer || '',
        disclaimer_hidden: t.disclaimer_hidden ?? false,
        ai_disclosure: t.ai_disclosure || '',
        ai_disclosure_hidden: t.ai_disclosure_hidden ?? false,
      })
    );

    const translation = translations.find((t: { language: string }) => t.language === language)
      || translations.find((t: { language: string }) => t.language === 'en')
      || translations[0];

    const logoUrl = await getPresignedUrl(data.logo_url);

    return Response.json({
      success: true,
      data: {
        id: data.id,
        site_name: translation?.site_name || null,
        logo_url: logoUrl,
        disclaimer: translation?.disclaimer || '',
        disclaimer_hidden: translation?.disclaimer_hidden ?? false,
        ai_disclosure: translation?.ai_disclosure || '',
        ai_disclosure_hidden: translation?.ai_disclosure_hidden ?? false,
        translations,
      },
    });
  } catch (err) {
    console.error('Failed to fetch site settings:', err);
    return Response.json({ success: true, data: { site_name: null, logo_url: null } });
  }
}

