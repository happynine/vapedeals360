import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { uploadFile } from '@/lib/storage';

// POST operations are never cached - no need for force-dynamic

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "public");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'uploads';

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const result = await uploadFile({
      fileContent: buffer,
      fileName: file.name,
      contentType: file.type || 'image/jpeg',
      folder,
    });

    return NextResponse.json({
      success: true,
      data: {
        key: result.key,   // The value to store in DB (URL for Vercel Blob, S3 key for dev)
        url: result.url,   // The accessible URL
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
