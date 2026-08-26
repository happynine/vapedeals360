import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, unknown>[] = [];
  try {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    // Extract project ref from URL
    const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
    results.push({ project_ref: projectRef, service_key_length: serviceKey.length });
    
    // Try pooler connection with service role key as password
    // Supabase pooler format: postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
    // Try different regions
    const regions = ['us-east-1', 'us-east-2', 'us-west-1', 'eu-west-1', 'ap-southeast-1', 'ap-northeast-1'];
    
    const { Client } = await import('pg');
    
    for (const region of regions) {
      const host = `aws-0-${region}.pooler.supabase.com`;
      const connStr = `postgresql://postgres.${projectRef}:${serviceKey}@${host}:6543/postgres`;
      try {
        const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 5000 });
        await client.connect();
        results.push({ region, status: 'connected' });
        
        // Run migrations
        const migrations = [
          "ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS promo_price TEXT",
          "UPDATE product_prices SET promo_price = current_price::text WHERE promotion_id IS NOT NULL AND promo_price IS NULL",
          "ALTER TABLE product_prices DROP COLUMN IF EXISTS standard_price",
        ];
        for (const sql of migrations) {
          try {
            await client.query(sql);
            results.push({ sql: sql.substring(0, 80), status: 'ok' });
          } catch (e) {
            results.push({ sql: sql.substring(0, 80), error: (e as Error).message });
          }
        }
        
        // Verify
        const verify = await client.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name='product_prices' AND column_name IN ('promo_price','standard_price')"
        );
        results.push({ columns: verify.rows });
        
        await client.end();
        return NextResponse.json({ success: true, results, region_used: region });
      } catch (e) {
        results.push({ region, status: 'failed', error: (e as Error).message.substring(0, 200) });
      }
    }
    
    return NextResponse.json({ success: false, results });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message, results }, { status: 500 });
  }
}
