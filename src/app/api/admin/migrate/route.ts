import { NextRequest, NextResponse } from 'next/server';
import { Pool, Client } from 'pg';

export const dynamic = 'force-dynamic';
const MIGRATION_KEY = 'vd360-migrate-2026';

async function tryConnect(): Promise<{ client: Client; method: string }> {
  const supaUrl = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const host = supaUrl.replace('https://', '').replace('http://', '');

  const attempts = [
    // Method 1: Direct connection as postgres with JWT as password
    { host, port: 5432, database: 'postgres', user: 'postgres', password: serviceKey, ssl: { rejectUnauthorized: false } },
    // Method 2: Pooler session mode
    { host: 'aws-0-us-east-1.pooler.supabase.com', port: 5432, database: 'postgres', user: `postgres.${host.split('.')[0]}`, password: serviceKey, ssl: { rejectUnauthorized: false } },
    // Method 3: Pooler transaction mode
    { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, database: 'postgres', user: `postgres.${host.split('.')[0]}`, password: serviceKey, ssl: { rejectUnauthorized: false } },
    // Method 4: authenticator user with JWT
    { host, port: 5432, database: 'postgres', user: 'authenticator', password: serviceKey, ssl: { rejectUnauthorized: false } },
    // Method 5: Direct connection with DATABASE_URL if available
    ...(process.env.DATABASE_URL ? [{ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }] : []),
  ];

  const errors: string[] = [];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const c = new Client(attempts[i]);
      await c.connect();
      const result = await c.query('SELECT current_user, current_database()');
      return { client: c, method: `method_${i + 1}: user=${result.rows[0].current_user} db=${result.rows[0].current_database}` };
    } catch (e: any) {
      errors.push(`method_${i + 1}: ${e.message}`);
      try { (attempts[i] as any).client?.end(); } catch {}
    }
  }
  throw new Error('All connection attempts failed:\n' + errors.join('\n'));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') !== MIGRATION_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Array<{ step: string; status: string; detail?: string }> = [];
  let client: Client | null = null;

  try {
    const { client: c, method } = await tryConnect();
    client = c;
    results.push({ step: 'connection', status: 'ok', detail: method });

    // Step 1: Add columns to product_prices
    const columnsToAdd = [
      { name: 'promotion_id', type: 'INTEGER' },
      { name: 'time_type', type: "TEXT NOT NULL DEFAULT 'permanent'" },
      { name: 'start_time', type: 'TIMESTAMPTZ' },
      { name: 'end_time', type: 'TIMESTAMPTZ' },
      { name: 'countdown_action', type: "TEXT NOT NULL DEFAULT 'hide'" },
      { name: 'standard_price', type: 'NUMERIC(10,2)' },
      { name: 'is_promotion_hidden', type: 'BOOLEAN NOT NULL DEFAULT false' },
      { name: 'is_featured_in_promotion', type: 'BOOLEAN NOT NULL DEFAULT false' },
    ];

    for (const col of columnsToAdd) {
      try {
        await client.query(`ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        results.push({ step: `add_column_${col.name}`, status: 'ok' });
      } catch (e: any) {
        results.push({ step: `add_column_${col.name}`, status: 'error', detail: e.message });
      }
    }

    // Add FK constraint for promotion_id (separately, IF NOT EXISTS for constraints needs DO block)
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_prices_promotion_id_fkey') THEN
            ALTER TABLE product_prices ADD CONSTRAINT product_prices_promotion_id_fkey
            FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);
      results.push({ step: 'add_fk_promotion_id', status: 'ok' });
    } catch (e: any) {
      results.push({ step: 'add_fk_promotion_id', status: 'error', detail: e.message });
    }

    // Step 2: Migrate promotion data
    try {
      const promoCheck = await client.query('SELECT COUNT(*) as cnt FROM promotion_product_prices');
      const promoCount = parseInt(promoCheck.rows[0].cnt);
      results.push({ step: 'check_existing_promos', status: 'ok', detail: `${promoCount} rows` });

      if (promoCount > 0) {
        const migrateResult = await client.query(`
          INSERT INTO product_prices (
            product_id, store_id, current_price, original_price, product_url,
            in_stock, discount_percent, currency, region, no_quote,
            promotion_id, time_type, start_time, end_time,
            countdown_action, standard_price,
            is_promotion_hidden, is_featured_in_promotion,
            created_at, updated_at
          )
          SELECT
            pp.product_id,
            ppp.store_id,
            ppp.current_price,
            ppp.original_price,
            ppp.product_url,
            ppp.in_stock,
            ppp.discount_percent,
            ppp.currency,
            ppp.region,
            ppp.no_quote,
            pp.promotion_id,
            COALESCE(ppp.time_type, 'permanent'),
            ppp.start_time,
            ppp.end_time,
            CASE WHEN ppp.countdown_action = 'close' THEN 'hide'
                 WHEN ppp.countdown_action = 'original_price' THEN 'hide'
                 ELSE COALESCE(ppp.countdown_action, 'hide') END,
            ppp.standard_price,
            false,
            COALESCE(pp.is_featured, false),
            ppp.created_at,
            NOW()
          FROM promotion_product_prices ppp
          JOIN promotion_products pp ON pp.id = ppp.promotion_product_id
          WHERE pp.product_id IS NOT NULL
        `);
        results.push({ step: 'migrate_data', status: 'ok', detail: `${migrateResult.rowCount} rows inserted` });
      }
    } catch (e: any) {
      results.push({ step: 'migrate_data', status: 'error', detail: e.message });
    }

    // Step 3: Verify
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'product_prices'
      ORDER BY ordinal_position
    `);
    const newPromoCount = await client.query(`SELECT COUNT(*) as cnt FROM product_prices WHERE promotion_id IS NOT NULL`);

    return NextResponse.json({
      success: true,
      results,
      verification: {
        columns: cols.rows,
        promotion_prices_in_product_prices: parseInt(newPromoCount.rows[0].cnt),
      },
    });
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      results,
      error: e.message,
      stack: e.stack?.substring(0, 500),
    }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}
