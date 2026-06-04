import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'fn491374665';

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "auth");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  try {
    const body = await request.json();
    const { username, password } = body as { username: string; password: string };

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      // Generate a simple token (base64 encoded timestamp + random string)
      const token = Buffer.from(`${username}:${Date.now()}:${Math.random().toString(36).slice(2)}`).toString('base64');
      return NextResponse.json({ success: true, token });
    }

    return NextResponse.json({ success: false, error: 'Invalid username or password' }, { status: 401 });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ success: false, error: 'Login failed' }, { status: 500 });
  }
}
