import { NextRequest, NextResponse } from 'next/server';
import { useVercelBlob } from '@/lib/storage';
import { getS3Storage } from '@/lib/storage';

export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    // If it's already a full URL, redirect to it
    if (key.startsWith('http://') || key.startsWith('https://')) {
      return NextResponse.redirect(key);
    }

    // S3 key - only works in sandbox (not on Vercel)
    if (useVercelBlob) {
      return NextResponse.json({ error: 'S3 image not available. Please re-upload the image.' }, { status: 404 });
    }

    // Dev: use S3Storage to get presigned URL and proxy the image
    const signedUrl = await getS3Storage().generatePresignedUrl({ key, expireTime: 3600 });

    const imageResponse = await fetch(signedUrl);
    if (!imageResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    const buffer = await imageResponse.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get image URL';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
