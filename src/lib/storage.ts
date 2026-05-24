import { put } from '@vercel/blob';
import { S3Storage } from 'coze-coding-dev-sdk';

const isProduction = process.env.COZE_PROJECT_ENV === 'PROD';

// S3Storage for development (sandbox)
const s3Storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

export interface UploadResult {
  key: string;   // The storage key or URL to persist in DB
  url: string;   // The accessible URL for display
}

/**
 * Upload a file. In production (Vercel) uses Vercel Blob; in dev uses S3Storage.
 * Returns both the key (to store in DB) and the accessible URL.
 */
export async function uploadFile(params: {
  fileContent: Buffer;
  fileName: string;
  contentType: string;
  folder?: string;
}): Promise<UploadResult> {
  const { fileContent, fileName, contentType, folder = 'uploads' } = params;

  if (isProduction) {
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
    const key = await s3Storage.uploadFile({
      fileContent,
      fileName: `${folder}/${timestamp(fileName)}`,
      contentType,
    });

    return {
      key,              // Store the S3 key in DB
      url: `/api/image?key=${encodeURIComponent(key)}`,  // Proxy URL for display
    };
  }
}

function timestamp(fileName: string): string {
  const ts = Date.now();
  const ext = fileName.split('.').pop() || 'jpg';
  const base = fileName.replace(/\.[^.]+$/, '');
  return `${ts}-${base}.${ext}`;
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

  // S3 key - generate presigned URL (dev only)
  if (isProduction) {
    // In production, S3 keys won't work without the Coze sandbox auth
    // Fallback to proxy endpoint
    return `/api/image?key=${encodeURIComponent(key)}`;
  }

  try {
    return await s3Storage.generatePresignedUrl({ key, expireTime: 3600 });
  } catch {
    return `/api/image?key=${encodeURIComponent(key)}`;
  }
}

export { s3Storage, isProduction };
