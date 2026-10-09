import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

// 手动按需再验证入口：必须是已登录管理员，防止外部任意触发缓存重建。
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, 'admin');
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();

  const path = request.nextUrl.searchParams.get('path');

  if (!path || !path.startsWith('/')) {
    return NextResponse.json({ error: 'A valid path parameter is required' }, { status: 400 });
  }

  try {
    revalidatePath(path);
    return NextResponse.json({ revalidated: true, path, now: Date.now() });
  } catch {
    return NextResponse.json({ error: 'Error revalidating' }, { status: 500 });
  }
}
