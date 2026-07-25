import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const blobs = await list({ limit: 1000 });
    
    const files = blobs.blobs.map(blob => ({
      url: blob.url,
      pathname: blob.pathname,
      size: blob.size,
      uploadedAt: blob.uploadedAt,
    }));

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
