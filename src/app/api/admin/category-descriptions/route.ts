import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// PUT /api/admin/category-descriptions
export async function PUT(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  const body = await request.json();
  const { category_key, language, description } = body;

  if (!category_key || !language) {
    return NextResponse.json({ error: 'category_key and language required' }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  // Upsert
  const { error } = await supabase
    .from('category_descriptions')
    .upsert(
      { category_key, language, description },
      { onConflict: 'category_key,language' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
