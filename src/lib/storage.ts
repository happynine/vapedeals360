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
  key: string;   // The storage key or URL to persist in DB
  url: string;   // The accessible URL for display
}

/**
 * Upload a file. On Vercel uses Vercel Blob; in Coze sandbox uses S3Storage.
 */
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
    if (key.startsWith('http://') || key.startsWith('https://')) {
      return false;
    }
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
 * 彻底移除 sharp，直接利用前端裁好的图片流进行上传存储
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
  const baseName = fileName.split('.').slice(0, -1).join('.') || 'image';

  // 直接上传前端已裁剪过的原生图片流
  const uploadResult = await uploadFile({
    fileContent,
    fileName: `${baseName}.jpg`,
    contentType,
    folder,
  });

  // 同时作为大图和小图返回（前端已做适当的尺寸缩放控制）
  return {
    large: uploadResult,
    small: uploadResult,
  };
}
