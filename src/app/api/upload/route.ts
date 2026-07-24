// 强制声明使用 Node.js 运行时，以避免 Edge 环境下的 SharedArrayBuffer 报错
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { uploadFile, uploadProductImage } from '@/lib/storage';

// POST operations are never cached - no need for force-dynamic

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "public");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  try {
    // 从 URL query 参数获取 metadata（绕过 FormData，避免 SharedArrayBuffer 问题）
    const url = new URL(request.url);
    const folder = url.searchParams.get('folder') || 'uploads';
    const isProductImage = url.searchParams.get('product_image') === 'true';

    // 直接读取原始 body（不使用 request.formData()）
    const arrayBuffer = await request.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    if (buffer.byteLength === 0) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const fileName = `crop-${Date.now()}.jpg`;
    const contentType = 'image/jpeg';

    if (isProductImage) {
      // Upload product image with two sizes
      const result = await uploadProductImage({
        fileContent: buffer,
        fileName: fileName,
        contentType: contentType,
        folder,
      });

      return NextResponse.json({
        success: true,
        data: {
          large: {
            key: result.large.key,
            url: result.large.url,
          },
          small: {
            key: result.small.key,
            url: result.small.url,
          },
        },
      });
    } else {
      // Regular upload
      const result = await uploadFile({
        fileContent: buffer,
        fileName: fileName,
        contentType: contentType,
        folder,
      });

      return NextResponse.json({
        success: true,
        data: {
          key: result.key,   // The value to store in DB (URL for Vercel Blob, S3 key for dev)
          url: result.url,   // The accessible URL
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
