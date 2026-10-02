import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { categoryKey } from '@/lib/awin-compare';

/**
 * Persist Awin ↔ VapeDeals360 mapping configuration so it does not have to be
 * re-entered on every upload.
 *
 * POST JSON:
 * {
 *   advertiserMappings: {
 *     [advertiserId]: { storeId: number, region: string, currency: string }
 *   },
 *   categoryMappings: Array<{
 *     advertiserId?: string | null,   // omitted/null = global default
 *     feedCategory: string,           // raw feed category name; normalized on save
 *     categorySlug: string
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  try {
    const body = (await request.json()) as {
      advertiserMappings?: Record<
        string,
        { storeId?: number; region?: string; currency?: string }
      >;
      categoryMappings?: Array<{
        advertiserId?: string | null;
        feedCategory?: string;
        categorySlug?: string;
      }>;
    };

    const supabase = getServiceRoleClient();
    const now = new Date().toISOString();
    const errors: string[] = [];

    // ① Advertiser → store / region / currency.
    const advEntries = Object.entries(body.advertiserMappings ?? {});
    for (const [advertiserId, m] of advEntries) {
      const storeId = Number(m.storeId);
      const region = (m.region || '').trim().toUpperCase();
      const currency = (m.currency || '').trim().toUpperCase();
      if (!advertiserId || !Number.isInteger(storeId) || !region || !currency) {
        errors.push(`${advertiserId}: incomplete advertiser mapping`);
        continue;
      }
      const { error } = await supabase
        .from('awin_advertiser_mappings')
        .upsert(
          {
            advertiser_id: advertiserId,
            store_id: storeId,
            region,
            currency,
            is_active: true,
            first_seen_at: now,
            last_synced_at: now,
            updated_at: now,
          },
          { onConflict: 'advertiser_id' },
        );
      if (error) errors.push(`${advertiserId}: ${error.message}`);
    }

    // ② Feed category → internal category (global default + per-advertiser).
    const { data: catRows } = await supabase.from('categories').select('slug');
    const validSlugs = new Set((catRows ?? []).map((c) => c.slug));

    // Normalize + dedupe; per-advertiser scope wins over a duplicate global row.
    const normalized = new Map<
      string,
      { advertiser_id: string | null; feed_category: string; category_slug: string }
    >();
    for (const c of body.categoryMappings ?? []) {
      const raw = (c.feedCategory || '').trim();
      const slug = (c.categorySlug || '').trim();
      const key = categoryKey(raw);
      if (!key || !validSlugs.has(slug)) continue;
      // Store the normalized key as feed_category so lookups line up exactly.
      normalized.set(`${c.advertiserId?.trim() || '__global__'}::${key}`, {
        advertiser_id: c.advertiserId?.trim() || null,
        feed_category: key,
        category_slug: slug,
      });
    }
    const categoryRowsToSave = [...normalized.values()];

    // The unique index is on (COALESCE(advertiser_id,...), feed_category),
    // which PostgREST cannot target via onConflict → per-row check then upsert.
    for (const row of categoryRowsToSave) {
      let query = supabase
        .from('awin_category_mappings')
        .select('id')
        .eq('feed_category', row.feed_category);
      query = row.advertiser_id
        ? query.eq('advertiser_id', row.advertiser_id)
        : query.is('advertiser_id', null);
      const { data: existing } = await query;
      if (existing && existing.length > 0) {
        const { error } = await supabase
          .from('awin_category_mappings')
          .update({ category_slug: row.category_slug, updated_at: now })
          .eq('id', existing[0].id);
        if (error) errors.push(`${row.feed_category}: ${error.message}`);
      } else {
        const { error } = await supabase
          .from('awin_category_mappings')
          .insert({ ...row, created_at: now, updated_at: now });
        if (error) errors.push(`${row.feed_category}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      savedAdvertisers: advEntries.length,
      savedCategories: categoryRowsToSave.length,
      errors,
    });
  } catch (error) {
    console.error('Awin mappings save error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Save failed',
      },
      { status: 500 },
    );
  }
}
