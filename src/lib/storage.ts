import { put } from '@vercel/blob';
import { S3Storage } from 'coze-coding-dev-sdk';

// Use Vercel Blob when BLOB_READ_WRITE_TOKEN is available (Vercel deployment)
const useVercelBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

let s3StorageInstance: S3Storage | null = null;
export function getS3Storage(): S3Storage {
  if (!s3StorageInstance) {
    s3StorageInstance = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
  }
  return s3StorageInstance;
}

export interface UploadResult {
  key: string;
  url: string;
}

export async function uploadFile(params: {
  fileContent: Buffer;
  fileName: string;
  contentType: string;
  folder?: string;
}): Promise<UploadResult> {
  const { fileContent, fileName, contentType, folder = 'uploads' } = params;

  if (useVercelBlob) {
    const timestamp = Date.now();
    const ext = fileName.split('.').pop() || 'jpg';
    const path = `${folder}/${timestamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const blob = await put(path, fileContent, {
      contentType,
      access: 'public',
    });

    return {
      key: blob.url,
      url: blob.url,
    };
  } else {
    const key = await getS3Storage().uploadFile({
      fileContent,
      fileName: `${folder}/${Date.now()}-${fileName}`,
      contentType,
    });

    return {
      key,
      url: `/api/image?key=${encodeURIComponent(key)}`,
    };
  }
}

export function getImageUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('/')) {
    return key;
  }
  return `/api/image?key=${encodeURIComponent(key)}`;
}

export async function getPresignedUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('/')) {
    return key;
  }
  if (useVercelBlob) {
    return `/api/image?key=${encodeURIComponent(key)}`;
  }
  try {
    return await getS3Storage().generatePresignedUrl({ key, expireTime: 3600 });
  } catch {
    return `/api/image?key=${encodeURIComponent(key)}`;
  }
}

export { useVercelBlob };

export async function deleteFile(key: string | null | undefined): Promise<boolean> {
  if (!key) return false;
  if (useVercelBlob) {
    if (key.startsWith('http://') || key.startsWith('https://')) {
      try {
        const { del } = await import('@vercel/blob');
        await del(key);
        return true;
      } catch (err) {
        console.error('[storage] Failed to delete Vercel Blob file:', key, err);
        return false;
      }
    }
    return false;
  } else {
    if (key.startsWith('http://') || key.startsWith('https://')) return false;
    try {
      return await getS3Storage().deleteFile({ fileKey: key });
    } catch (err) {
      console.error('[storage] Failed to delete S3 file:', key, err);
      return false;
    }
  }
}

export function extractImageKeysFromHtml(html: string | null | undefined): string[] {
  if (!html) return [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const keys: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src && !src.startsWith('data:')) {
      keys.push(src);
    }
  }
  return keys;
}

/**
 * 动态加载 sharp 并强制单线程运行
 */
export async function uploadProductImage(params: {
  fileContent: Buffer;
  fileName: string;
  contentType: string;
  folder?: string;
}): Promise<{
  large: UploadResult;
  small: UploadResult;
}> {
  const { fileContent, fileName, contentType, folder = 'products' } = params;

  // 使用 import() 动态引入 sharp，防止在打包和启动时触发多线程初始化
  const { default: sharp } = await import('sharp');
  // 确保关闭并发
  sharp.concurrency(1);

  // Resize to 640x640
  const largeBuffer = await sharp(fileContent)
    .resize(640, 640, { fit: 'cover', position: 'center' })
    .toFormat('webp', { quality: 85 })
    .toBuffer();

  // Resize to 315x315
  const smallBuffer = await sharp(fileContent)
    .resize(315, 315, { fit: 'cover', position: 'center' })
    .toFormat('webp', { quality: 85 })
    .toBuffer();

  const timestamp = Date.now();
  const baseName = fileName.split('.').slice(0, -1).join('.') || 'image';

  const largeResult = await uploadFile({
    fileContent: largeBuffer,
    fileName: `${baseName}-640.webp`,
    contentType: 'image/webp',
    folder,
  });

  const smallResult = await uploadFile({
    fileContent: smallBuffer,
    fileName: `${baseName}-315.webp`,
    contentType: 'image/webp',
    folder,
  });

  return {
    large: largeResult,
    small: smallResult,
  };
}
