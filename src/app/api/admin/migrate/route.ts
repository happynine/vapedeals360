import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') !== 'vd360-migrate-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbEnvKeys = Object.keys(process.env).filter(k => 
    k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('SUPABASE') || 
    k.includes('PG') || k.includes('DB_') || k.includes('SQL')
  ).sort();

  const envInfo: Record<string, string> = {};
  for (const key of dbEnvKeys) {
    const val = process.env[key] || '';
    envInfo[key] = val ? val.substring(0, 30) + '...(len=' + val.length + ')' : '(empty)';
  }

  return NextResponse.json({
    dbEnvKeys,
    envInfo,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasPostgresUrl: !!process.env.POSTGRES_URL,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
