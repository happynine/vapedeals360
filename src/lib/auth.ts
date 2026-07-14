import { getSupabaseClient } from '@/storage/database/supabase-client';

const JWT_SECRET = process.env.JWT_SECRET || 'vapedeals-admin-secret-key-2024';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Verify admin session from x-session header.
 * Returns user_id if valid, or null if unauthenticated.
 */
export async function verifyAdminSession(request: Request): Promise<string | null> {
  const sessionToken = request.headers.get('x-session');
  if (!sessionToken) return null;

  // First try JWT verification (for custom login)
  const payload = verifyJwt(sessionToken);
  if (payload && payload.role === 'admin') {
    return payload.sub;
  }

  // Fallback to Supabase Auth
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(sessionToken);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * Return a 401 JSON response for unauthenticated requests.
 */
export function unauthorizedResponse(): Response {
  return Response.json({ error: 'Unauthorized', success: false }, { status: 401 });
}
