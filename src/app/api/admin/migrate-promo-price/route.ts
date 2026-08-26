import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, unknown>[] = [];
  try {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
    
    const { Client } = await import('pg');
    
    // Try multiple connection formats
    const connections = [
      // Direct connection
      { name: 'direct-5432', host: `db.${projectRef}.supabase.co`, port: 5432, user: 'postgres', password: serviceKey },
      // Pooler on 6543 with postgres.[ref] user
      { name: 'pooler-6543-ref-user', host: 'aws-0-us-west-1.pooler.supabase.com', port: 6543, user: `postgres.${projectRef}`, password: serviceKey },
      // Pooler on 5432 session mode
      { name: 'pooler-5432-ref-user', host: 'aws-0-us-west-1.pooler.supabase.com', port: 5432, user: `postgres.${projectRef}`, password: serviceKey },
      // Pooler on 6543 with plain postgres user
      { name: 'pooler-6543-plain', host: 'aws-0-us-west-1.pooler.supabase.com', port: 6543, user: 'postgres', password: serviceKey },
      // Try new Supabase pooler domain format
      { name: 'pooler-new-6543', host: 'aws-1-us-west-1.pooler.supabase.com', port: 6543, user: `postgres.${projectRef}`, password: serviceKey },
    ];
    
    for (const conn of connections) {
      try {
        const client = new Client({
          host: conn.host,
          port: conn.port,
          user: conn.user,
          password: conn.password,
          database: 'postgres',
          connectionTimeoutMillis: 8000,
          ssl: { rejectUnauthorized: false },
        });
        await client.connect();
        results.push({ ...conn, status: 'connected' });
        
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
        
        const verify = await client.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name='product_prices' AND column_name IN ('promo_price','standard_price')"
        );
        results.push({ columns: verify.rows });
        
        await client.end();
        return NextResponse.json({ success: true, results, connected_via: conn.name });
      } catch (e) {
        results.push({ name: conn.name, host: conn.host, port: conn.port, user: conn.user, status: 'failed', error: (e as Error).message.substring(0, 200) });
      }
    }
    
    return NextResponse.json({ success: false, results });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message, results }, { status: 500 });
  }
}
