import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';

// All tables to export (in dependency order for import)
const TABLES = [
  'site_settings',
  'social_links',
  'system_settings',
  'categories',
  'category_translations',
  'stores',
  'store_translations',
  'products',
  'product_translations',
  'product_prices',
  'banners',
  'banner_translations',
  'promotions',
  'promotion_translations',
  'promotion_products',
  'best_vapes',
  'best_vape_translations',
  'news',
  'news_translations',
  'user_feedback',
  'health_check',
];

export async function GET() {
  try {
    const supabase = getServiceRoleClient();
    const backup: Record<string, unknown[]> = {};

    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select('*');
      if (error) {
        console.error(`Error exporting ${table}:`, error);
        backup[table] = [];
      } else {
        backup[table] = data || [];
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: backup,
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ success: false, error: 'Export failed' }, { status: 500 });
  }
}
