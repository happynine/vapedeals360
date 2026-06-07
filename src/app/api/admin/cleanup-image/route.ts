import { NextRequest, NextResponse } from 'next/server';
import { deleteFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/cleanup-image
 * Delete an orphaned image from storage by its key or URL.
 * Used when an image is resized in the editor - the old full-size version is deleted.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const key = body.key as string | undefined;

    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    const deleted = await deleteFile(key);
    if (deleted) {
      console.log('[cleanup-image] Deleted:', key);
    } else {
      console.log('[cleanup-image] Skipped (not found or external):', key);
    }

    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error('[cleanup-image] Error:', err);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}
