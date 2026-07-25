import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// Tables that have auto-increment IDs - need to reset sequences after import
const TABLES_WITH_SEQUENCE = [
  'categories', 'stores', 'products', 'banners', 'promotions',
  'best_vapes', 'news', 'product_prices', 'promotion_products',
  'user_feedback', 'site_settings', 'social_links', 'system_settings',
];

// Translation tables that reference parent tables
const TRANSLATION_TABLES: Record<string, string> = {
  category_translations: 'categories',
  store_translations: 'stores',
  product_translations: 'products',
  banner_translations: 'banners',
  promotion_translations: 'promotions',
  best_vape_translations: 'best_vapes',
  news_translations: 'news',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, mode } = body;

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid backup data' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const results: Record<string, { inserted: number; error?: string }> = {};

    // mode: 'append' (default) or 'replace' (clear tables first)
    const isReplace = mode === 'replace';

    for (const [table, rows] of Object.entries(data)) {
      if (!Array.isArray(rows) || rows.length === 0) {
        results[table] = { inserted: 0 };
        continue;
      }

      // Clear table if replace mode
      if (isReplace) {
        const { error: deleteError } = await supabase.from(table).delete().neq('id', 0);
        if (deleteError) {
          console.error(`Error clearing ${table}:`, deleteError);
        }
      }

      // Insert rows
      const { data: inserted, error } = await supabase.from(table).insert(rows).select();

      if (error) {
        console.error(`Error importing ${table}:`, error);
        results[table] = { inserted: 0, error: error.message };
      } else {
        results[table] = { inserted: Array.isArray(inserted) ? inserted.length : rows.length };
      }
    }

    // Reset sequences for tables with auto-increment IDs
    if (isReplace) {
      for (const table of TABLES_WITH_SEQUENCE) {
        if (data[table]) {
          await supabase.rpc('reset_sequence', { table_name: table });
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ success: false, error: 'Import failed' }, { status: 500 });
  }
}
