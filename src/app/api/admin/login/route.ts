import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "auth");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  try {
    const body = await request.json();
    const { username, password } = body as { username: string; password: string };

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: username,
      password,
    });

    if (error || !data.session) {
      return NextResponse.json(
        { success: false, error: error?.message || 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Use Supabase access token as admin token
    return NextResponse.json({ success: true, token: data.session.access_token });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ success: false, error: 'Login failed' }, { status: 500 });
  }
}
