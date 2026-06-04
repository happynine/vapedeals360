import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getPresignedUrl } from '@/lib/storage';

export async function GET(request: Request) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('site_settings')
      .select('*, site_setting_translations(*)')
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return Response.json({ success: true, data: null });

    const logoUrl = await getPresignedUrl(data.logo_url);

    return Response.json({
      success: true,
      data: {
        id: data.id,
        logo_url: data.logo_url,
        logo_url_signed: logoUrl,
        translations: data.site_setting_translations || [],
      },
    });
  } catch (err) {
    console.error('Failed to fetch site settings:', err);
    return Response.json({ success: false, error: 'Failed to fetch site settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { logo_url, translations, site_name } = body;

    // Upsert site_settings row
    let settingsId: number | null = null;
    const { data: existing } = await supabase
      .from('site_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing) {
      settingsId = existing.id;
      const updateData: { logo_url?: string | null; updated_at: string } = { updated_at: new Date().toISOString() };
      if (logo_url !== undefined) updateData.logo_url = logo_url;
      const { error } = await supabase.from('site_settings').update(updateData).eq('id', settingsId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from('site_settings')
        .insert({ logo_url: logo_url || null })
        .select('id')
        .single();
      if (error) throw error;
      settingsId = data.id;
    }

    // Handle site_name shorthand: if site_name is provided without translations, update both languages
    const effectiveTranslations = translations || (site_name ? [
      { language: 'en', site_name },
      { language: 'zh', site_name },
    ] : []);

    // Upsert translations
    if (effectiveTranslations && Array.isArray(effectiveTranslations) && settingsId) {
      for (const tr of effectiveTranslations) {
        if (!tr.language || !tr.site_name) continue;
        const { data: existingTr } = await supabase
          .from('site_setting_translations')
          .select('id')
          .eq('site_setting_id', settingsId)
          .eq('language', tr.language)
          .maybeSingle();

        if (existingTr) {
          await supabase
            .from('site_setting_translations')
            .update({ site_name: tr.site_name })
            .eq('id', existingTr.id);
        } else {
          await supabase
            .from('site_setting_translations')
            .insert({ site_setting_id: settingsId, language: tr.language, site_name: tr.site_name });
        }
      }
    }

    // Return updated data for frontend to refresh
    const { data: updatedData } = await supabase
      .from('site_settings')
      .select('*, site_setting_translations(*)')
      .eq('id', settingsId)
      .single();

    const logoUrlSigned = await getPresignedUrl(updatedData?.logo_url);
    const updatedTranslations = updatedData?.site_setting_translations || [];
    const enTranslation = updatedTranslations.find((t: { language: string }) => t.language === 'en') || updatedTranslations[0];

    return Response.json({
      success: true,
      data: {
        id: settingsId,
        site_name: enTranslation?.site_name || null,
        logo_url: logoUrlSigned,
        translations: updatedTranslations,
      },
    });
  } catch (err) {
    console.error('Failed to update site settings:', err);
    return Response.json({ success: false, error: 'Failed to update site settings' }, { status: 500 });
  }
}
