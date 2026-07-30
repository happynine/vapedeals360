import { NextRequest, NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    // Verify R2 credentials
    if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
      return NextResponse.json({ error: 'R2 credentials not configured' }, { status: 400 });
    }

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true,
    });

    const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://${process.env.R2_BUCKET_NAME}.r2.dev`;

    // List all files in Vercel Blob
    const { blobs } = await list({ limit: 1000 });
    const results: { file: string; status: string; url?: string; error?: string }[] = [];

    for (const blob of blobs) {
      const key = blob.pathname;
      try {
        // Download from Vercel Blob
        const response = await fetch(blob.url);
        if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/octet-stream';

        // Upload to R2
        await s3Client.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
          })
        );

        results.push({ file: key, status: 'success', url: `${R2_PUBLIC_URL}/${key}` });
      } catch (err) {
        results.push({ file: key, status: 'failed', error: err instanceof Error ? err.message : 'unknown' });
      }
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return NextResponse.json({
      message: `Migration complete: ${succeeded} succeeded, ${failed} failed, ${blobs.length} total`,
      results,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Migration failed',
    }, { status: 500 });
  }
}
