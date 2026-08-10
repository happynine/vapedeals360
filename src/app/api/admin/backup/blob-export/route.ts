import { NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

// R2 config (same as storage.ts)
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://${process.env.R2_BUCKET_NAME || 'vapedeals360-images'}.r2.dev`;

function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: true,
  });
}

export async function GET() {
  try {
    const hasR2 = !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);

    if (!hasR2) {
      return NextResponse.json({ success: false, error: 'R2 storage not configured' }, { status: 500 });
    }

    const client = getR2Client();
    const files: Array<{ url: string; pathname: string; size: number; uploadedAt: string }> = [];
    let continuationToken: string | undefined;

    // Paginate through all objects
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET_NAME,
          ContinuationToken: continuationToken,
        })
      );

      for (const obj of response.Contents || []) {
        const key = obj.Key || '';
        files.push({
          url: `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`,
          pathname: key,
          size: obj.Size || 0,
          uploadedAt: obj.LastModified?.toISOString() || '',
        });
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return NextResponse.json({
      success: true,
      total: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      files,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
