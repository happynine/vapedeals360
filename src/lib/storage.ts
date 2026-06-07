import { put } from '@vercel/blob';
import { S3Storage } from 'coze-coding-dev-sdk';

// Use Vercel Blob when BLOB_READ_WRITE_TOKEN is available (Vercel deployment)
// Otherwise fall back to S3Storage (Coze sandbox)
const useVercelBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

// S3Storage for development (sandbox) - only initialize when needed
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
 * Returns both the key (to store in DB) and the accessible URL.
 */
export async function uploadFile(params: {
  fileContent: Buffer;
  fileName: string;
  contentType: string;
  folder?: string;
}): Promise<UploadResult> {
  const { fileContent, fileName, contentType, folder = 'uploads' } = params;

  if (useVercelBlob) {
    // Vercel Blob: returns a full public URL
    const timestamp = Date.now();
    const ext = fileName.split('.').pop() || 'jpg';
    const path = `${folder}/${timestamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const blob = await put(path, fileContent, {
      contentType,
      access: 'public',
    });

    return {
      key: blob.url,    // Store the full URL in DB (Vercel Blob URLs are permanent)
      url: blob.url,    // Same URL is directly accessible
    };
  } else {
    // Sandbox: use S3Storage, returns S3 key
    const key = await getS3Storage().uploadFile({
      fileContent,
      fileName: `${folder}/${Date.now()}-${fileName}`,
      contentType,
    });

    return {
      key,              // Store the S3 key in DB
      url: `/api/image?key=${encodeURIComponent(key)}`,  // Proxy URL for display
    };
  }
}

/**
 * Get an accessible URL for an image key.
 * - If it's already a full URL (Vercel Blob), return as-is.
 * - If it's an S3 key (dev), generate a proxy URL.
 */
export function getImageUrl(key: string | null | undefined): string | null {
  if (!key) return null;

  // Already a full URL (Vercel Blob or external)
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return key;
  }

  // S3 key - use proxy
  return `/api/image?key=${encodeURIComponent(key)}`;
}

/**
 * Generate a presigned URL for an S3 key (dev only).
 * For Vercel Blob URLs, return as-is.
 */
export async function getPresignedUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;

  // Already a full URL
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return key;
  }

  // S3 key - only works in sandbox
  if (useVercelBlob) {
    // On Vercel, S3 keys can't be resolved without Coze sandbox auth
    // Fallback to proxy endpoint
    return `/api/image?key=${encodeURIComponent(key)}`;
  }

  try {
    return await getS3Storage().generatePresignedUrl({ key, expireTime: 3600 });
  } catch {
    return `/api/image?key=${encodeURIComponent(key)}`;
  }
}

export { useVercelBlob };

/**
 * Delete a file from storage by its key or URL.
 * - For S3 keys (dev sandbox), uses S3Storage.deleteFile.
 * - For Vercel Blob URLs, uses @vercel/blob del.
 * - For external URLs (http/https not matching Vercel Blob), skip deletion (not our storage).
 */
export async function deleteFile(key: string | null | undefined): Promise<boolean> {
  if (!key) return false;

  if (useVercelBlob) {
    // Vercel Blob: key is stored as a full URL
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
    // Not a URL in Vercel mode - can't delete
    return false;
  } else {
    // Sandbox: key is an S3 key
    if (key.startsWith('http://') || key.startsWith('https://')) {
      // External URL, not our storage - skip
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

/**
 * Extract all image URLs/keys from HTML content.
 * Returns an array of src values from <img> tags.
 */
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
