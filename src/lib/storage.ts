import { put, del } from '@vercel/blob';
import { S3Storage } from 'coze-coding-dev-sdk';
import { createHash } from 'crypto';

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
 * Compute MD5 hash of file content for deduplication.
 * Returns first 12 chars of hex digest (48 bits, sufficient for collision avoidance).
 */
function computeContentHash(fileContent: Buffer): string {
  return createHash('md5').update(fileContent).digest('hex').slice(0, 12);
}

/**
 * Upload a file. On Vercel uses Vercel Blob; in Coze sandbox uses S3Storage.
 * Uses content hash as filename to enable automatic deduplication —
 * uploading the same file twice will result in the same URL.
 */
export async function uploadFile(params: {
  fileContent: Buffer;
  fileName: string;
  contentType: string;
  folder?: string;
  entityId?: string;
}): Promise<UploadResult> {
  const { fileContent, fileName, contentType, folder = 'uploads', entityId } = params;
  const ext = fileName.split('.').pop() || 'jpg';
  // When entityId is provided, use it as the filename for overwrite-style uploads;
  // otherwise fall back to content-hash-based naming for deduplication.
  const fileBaseName = entityId ? entityId : computeContentHash(fileContent);
  if (useVercelBlob) {
    const path = `${folder}/${fileBaseName}.${ext}`;
    const blob = await put(path, fileContent, {
      contentType,
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return {
      key: blob.url,
      url: blob.url,
    };
  } else {
    const key = `${folder}/${fileBaseName}.${ext}`;
    await getS3Storage().uploadFile({
      fileContent,
      fileName: key,
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
 * Upload product image with content-hash deduplication.
 * Uses the same hash-based filename as uploadFile, so identical images
 * uploaded from different pages (Products / Promotion Products) will share the same Blob.
 */
export async function uploadProductImage(params: {
  fileContent: Buffer;
  fileName: string;
  contentType: string;
  folder?: string;
  entityId?: string;
}): Promise<{
  large: UploadResult;
  small: UploadResult;
}> {
  const { fileContent, fileName, contentType, folder = 'products', entityId } = params;
  const baseName = fileName.split('.').slice(0, -1).join('.') || 'image';
  // Directly upload the frontend-cropped image stream
  const uploadResult = await uploadFile({
    fileContent,
    fileName: `${baseName}.jpg`,
    contentType,
    folder,
    entityId,
  });
  // Both large and small point to the same URL (frontend handles sizing)
  return {
    large: uploadResult,
    small: uploadResult,
  };
}
