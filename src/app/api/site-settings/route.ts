import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getPresignedUrl } from '@/lib/storage';

export async function GET(request: Request) {
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
      return Response.json({ success: true, data: { site_name: 'VapeDeal', logo_url: null } });
    }

    const translations = (data.site_setting_translations || []).map(
      (t: { id: number; site_setting_id: number; language: string; site_name: string }) => ({
        id: t.id,
        site_setting_id: t.site_setting_id,
        language: t.language,
        site_name: t.site_name,
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
        site_name: translation?.site_name || 'VapeDeal',
        logo_url: logoUrl,
        translations,
      },
    });
  } catch (err) {
    console.error('Failed to fetch site settings:', err);
    return Response.json({ success: true, data: { site_name: 'VapeDeal', logo_url: null } });
  }
}
