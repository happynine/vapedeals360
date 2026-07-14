import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "auth");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  try {
    const body = await request.json();
    const { username, password } = body as { username: string; password: string };

    // 使用硬编码的账号密码验证（不依赖 Supabase Auth）
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'funan9999@gmail.com';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fn491374665';

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { success: false, error: 'Invalid login credentials' },
        { status: 401 }
      );
    }

    // 生成简单的 session token
    const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');

    return NextResponse.json({ success: true, token });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ success: false, error: 'Login failed' }, { status: 500 });
  }
}
