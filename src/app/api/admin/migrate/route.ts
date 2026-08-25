import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Temporary migration endpoint - will be removed after migration
// Requires ?key=vd360-migrate-2026 to execute

export const dynamic = 'force-dynamic';

const MIGRATION_KEY = 'vd360-migrate-2026';

async function getPool(): Promise<Pool> {
  // Try various env var names that Vercel/Supabase might use
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    '';

  if (connectionString) {
    return new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }

  // Fallback: construct from Supabase URL + service role key
  const supaUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (supaUrl) {
    const host = supaUrl.replace('https://', '').replace('http://', '').split('.')[0];
    const fullHost = `${host}.supabase.co`;
    // Try with service role as password (won't work for direct PG but worth trying)
    return new Pool({
      host: fullHost,
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: serviceKey,
      ssl: { rejectUnauthorized: false },
    });
  }

  throw new Error('No database connection string found in environment variables');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') !== MIGRATION_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Array<{ step: string; status: string; detail?: string }> = [];
  let pool: Pool | null = null;

  try {
    pool = await getPool();

    // Test connection
    const testResult = await pool.query('SELECT current_database(), current_user');
    results.push({ step: 'connection', status: 'ok', detail: `db=${testResult.rows[0].current_database} user=${testResult.rows[0].current_user}` });

    // ============================================
    // Step 1: Add new columns to product_prices
    // ============================================
    const columnsToAdd = [
      { name: 'promotion_id', type: 'INTEGER REFERENCES promotions(id) ON DELETE SET NULL' },
      { name: 'time_type', type: "TEXT DEFAULT 'permanent' CHECK (time_type IN ('permanent','time_range','countdown'))" },
      { name: 'start_time', type: 'TIMESTAMPTZ' },
      { name: 'end_time', type: 'TIMESTAMPTZ' },
      { name: 'countdown_action', type: "TEXT DEFAULT 'hide' CHECK (countdown_action IN ('convert_to_standard','hide'))" },
      { name: 'standard_price', type: 'NUMERIC(10,2)' },
      { name: 'is_promotion_hidden', type: 'BOOLEAN DEFAULT false' },
      { name: 'is_featured_in_promotion', type: 'BOOLEAN DEFAULT false' },
    ];

    for (const col of columnsToAdd) {
      try {
        await pool.query(`ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        results.push({ step: `add_column_${col.name}`, status: 'ok' });
      } catch (e: any) {
        results.push({ step: `add_column_${col.name}`, status: 'error', detail: e.message });
      }
    }

    // ============================================
    // Step 2: Migrate existing promotion data
    // ============================================
    try {
      // Check if there are promotion prices to migrate
      const promoCheck = await pool.query(`SELECT COUNT(*) as cnt FROM promotion_product_prices`);
      const promoCount = parseInt(promoCheck.rows[0].cnt);
      results.push({ step: 'check_promo_prices', status: 'ok', detail: `${promoCount} existing promotion prices` });

      if (promoCount > 0) {
        // Insert promotion prices into product_prices
        const migrateQuery = `
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
            COALESCE(ppp.countdown_action, 'close'),
            ppp.standard_price,
            false,
            pp.is_featured,
            ppp.created_at,
            NOW()
          FROM promotion_product_prices ppp
          JOIN promotion_products pp ON pp.id = ppp.promotion_product_id
          WHERE pp.product_id IS NOT NULL
          ON CONFLICT DO NOTHING
        `;
        const migrateResult = await pool.query(migrateQuery);
        results.push({ step: 'migrate_promo_prices', status: 'ok', detail: `${migrateResult.rowCount} rows inserted into product_prices` });

        // Note about countdown_action='close' mapping
        // In the old system, 'close' was used. In new system we use 'hide'.
        // Update any 'close' values to 'hide' for the new schema
        await pool.query(`UPDATE product_prices SET countdown_action = 'hide' WHERE countdown_action = 'close' AND promotion_id IS NOT NULL`);
        results.push({ step: 'normalize_countdown_action', status: 'ok' });
      }
    } catch (e: any) {
      results.push({ step: 'migrate_promo_prices', status: 'error', detail: e.message });
    }

    // ============================================
    // Step 3: Verify
    // ============================================
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'product_prices'
      ORDER BY ordinal_position
    `);
    const columns = verifyResult.rows.map((r: any) => ({
      name: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable,
      default: r.column_default,
    }));

    const promoPricesInNew = await pool.query(`SELECT COUNT(*) as cnt FROM product_prices WHERE promotion_id IS NOT NULL`);

    return NextResponse.json({
      success: true,
      results,
      verification: {
        product_prices_columns: columns,
        promotion_prices_in_product_prices: parseInt(promoPricesInNew.rows[0].cnt),
      },
    });
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      results,
      error: e.message,
      hint: 'If connection failed, the DATABASE_URL env var may not be set. You can run the SQL manually in Supabase Dashboard.',
    }, { status: 500 });
  } finally {
    if (pool) await pool.end();
  }
}
