import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();

  // Try various env var names for direct Postgres connection
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.DIRECT_URL ||
    process.env.PG_URL;

  if (!connectionString) {
    // Try to construct from Supabase URL and service role key
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      // Extract host from Supabase URL (e.g. https://xxx.supabase.co)
      const host = supabaseUrl.replace('https://', '').replace('http://', '');
      return NextResponse.json({
        success: false,
        error: 'No DATABASE_URL found',
        debug: {
          env_keys: Object.keys(process.env).filter(k =>
            k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG') || k.includes('SUPABASE_DB') || k.includes('DIRECT')
          ),
          supabase_host: host,
        }
      }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: 'No database connection configured' }, { status: 500 });
  }

  const pool = new Pool({ connectionString });
  try {
    await pool.query(`
      ALTER TABLE content_page_translations
        ADD COLUMN IF NOT EXISTS disclaimer TEXT,
        ADD COLUMN IF NOT EXISTS disclaimer_hidden BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS ai_disclosure TEXT,
        ADD COLUMN IF NOT EXISTS ai_disclosure_hidden BOOLEAN NOT NULL DEFAULT false;
    `);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
