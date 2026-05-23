import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    const signedUrl = await storage.generatePresignedUrl({ key, expireTime: 3600 });
    return NextResponse.redirect(signedUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get image URL';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
