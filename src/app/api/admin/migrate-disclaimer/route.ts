import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();

  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    return NextResponse.json({ success: false, error: 'No DATABASE_URL configured' }, { status: 500 });
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
