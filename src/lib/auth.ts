import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * Verify admin session from x-session header.
 * Returns user_id if valid, or null if unauthenticated.
 */
export async function verifyAdminSession(request: Request): Promise<string | null> {
  const sessionToken = request.headers.get('x-session');
  if (!sessionToken) return null;

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
