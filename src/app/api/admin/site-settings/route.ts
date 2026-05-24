import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getPresignedUrl } from '@/lib/storage';

export async function GET() {
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
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { logo_url, translations } = body;

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

    // Upsert translations
    if (translations && Array.isArray(translations) && settingsId) {
      for (const tr of translations) {
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

    return Response.json({ success: true });
  } catch (err) {
    console.error('Failed to update site settings:', err);
    return Response.json({ success: false, error: 'Failed to update site settings' }, { status: 500 });
  }
}
