import { put } from '@vercel/blob';
import { S3Storage } from 'coze-coding-dev-sdk';

// Use Vercel Blob when BLOB_READ_WRITE_TOKEN is available (Vercel deployment)
// Otherwise fall back to S3Storage (Coze sandbox)
const useVercelBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

// S3Storage for development (sandbox) - only initialize when needed
let s3StorageInstance: S3Storage | null = null;
function getS3Storage(): S3Storage {
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
