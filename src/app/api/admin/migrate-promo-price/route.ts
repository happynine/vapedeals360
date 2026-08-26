import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, unknown>[] = [];
  try {
    // Use Supabase service role client to query data for migration
    const client = getServiceRoleClient();
    
    // Step 1: Try to add promo_price column using a raw query through pg
    // We need DATABASE_URL for direct pg connection
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
    results.push({ database_url_available: !!dbUrl, prefix: dbUrl ? dbUrl.substring(0, 25) : 'none' });
    
    if (dbUrl) {
      const { Client } = await import('pg');
      const pg = new Client({ connectionString: dbUrl });
      await pg.connect();
      
      const migrations = [
        "ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS promo_price TEXT",
        "UPDATE product_prices SET promo_price = current_price::text WHERE promotion_id IS NOT NULL AND promo_price IS NULL",
        "ALTER TABLE product_prices DROP COLUMN IF EXISTS standard_price",
      ];
      
      for (const sql of migrations) {
        try {
          await pg.query(sql);
          results.push({ sql: sql.substring(0, 80), status: 'ok' });
        } catch (e) {
          results.push({ sql: sql.substring(0, 80), error: (e as Error).message });
        }
      }
      await pg.end();
    } else {
      results.push({ error: 'No DATABASE_URL found, listing relevant env vars', keys: Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG')) });
    }
    
    // Verify column structure
    const { data, error } = await client
      .from('product_prices')
      .select('id,promo_price,current_price,promotion_id')
      .not('promotion_id', 'is', 'null');
    if (error) {
      results.push({ verify_error: error.message });
    } else {
      results.push({ promotion_rows: data?.length, sample: data?.slice(0, 3) });
    }
    
    return NextResponse.json({ success: true, results });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message, results }, { status: 500 });
  }
}
