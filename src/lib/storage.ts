import { put, del } from '@vercel/blob';
import { S3Storage } from 'coze-coding-dev-sdk';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

// Priority: R2 > Vercel Blob > S3Storage (Coze sandbox)
const hasR2 = !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
const useVercelBlob = !hasR2 && !!process.env.BLOB_READ_WRITE_TOKEN;

// R2 public URL base (set in Vercel env vars, e.g. https://images.vapedeals360.com)
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://${process.env.R2_BUCKET_NAME || 'vapedeals360-images'}.r2.dev`;

let s3ClientInstance: S3Client | null = null;
let s3StorageInstance: S3Storage | null = null;

function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true,
    });
  }
  return s3ClientInstance;
}

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

function computeContentHash(fileContent: Buffer): string {
  return createHash('md5').update(fileContent).digest('hex').slice(0, 12);
}

/**
 * Build public URL for an R2 object.
 */
function buildR2Url(key: string): string {
  return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

export async function uploadFile(params: {
  fileContent: Buffer;
  fileName: string;
  contentType: string;
  folder?: string;
  entityId?: string;
}): Promise<UploadResult> {
  const { fileContent, fileName, contentType, folder = 'uploads', entityId } = params;
  const ext = fileName.split('.').pop() || 'jpg';
  const fileBaseName = entityId ? entityId : computeContentHash(fileContent);

  // R2 (Cloudflare)
  if (hasR2) {
    const key = `${folder}/${fileBaseName}.${ext}`;
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
      })
    );
    const url = buildR2Url(key);
    return { key: url, url };
  }

  // Vercel Blob
  if (useVercelBlob) {
    const path = `${folder}/${fileBaseName}.${ext}`;
    const blob = await put(path, fileContent, {
      contentType,
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { key: blob.url, url: blob.url };
  }

  // Coze S3 Storage (dev/sandbox)
  const key = `${folder}/${fileBaseName}.${ext}`;
  await getS3Storage().uploadFile({ fileContent, fileName: key, contentType });
  return { key, url: `/api/image?key=${encodeURIComponent(key)}` };
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
  // R2: public access, just return the public URL
  if (hasR2) {
    return buildR2Url(key);
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

  // R2
  if (hasR2) {
    if (key.startsWith('http://') || key.startsWith('https://')) {
      // Extract key from URL
      try {
        const urlObj = new URL(key);
        const bucketUrl = R2_PUBLIC_URL.replace(/\/$/, '');
        if (urlObj.origin === bucketUrl || urlObj.hostname === new URL(bucketUrl).hostname) {
          const objectKey = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
          await getS3Client().send(
            new DeleteObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME,
              Key: objectKey,
            })
          );
          return true;
        }
      } catch {}
    }
    return false;
  }

  // Vercel Blob
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
  }

  // Coze S3 Storage
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

export async function uploadProductImage(params: {
  fileContent: Buffer;
  fileName: string;
  contentType: string;
  folder?: string;
  entityId?: string;
}): Promise<{ large: UploadResult; small: UploadResult }> {
  const { fileContent, fileName, contentType, folder = 'products', entityId } = params;
  const baseName = fileName.split('.').slice(0, -1).join('.') || 'image';
  const uploadResult = await uploadFile({
    fileContent,
    fileName: `${baseName}.jpg`,
    contentType,
    folder,
    entityId,
  });
  return { large: uploadResult, small: uploadResult };
}

/**
 * List all objects in a folder (for migration purposes).
 */
export async function listObjectsInFolder(folder: string): Promise<{ key: string; url: string }[]> {
  if (!hasR2) return [];
  const response = await getS3Client().send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      Prefix: `${folder}/`,
    })
  );
  return (response.Contents || []).map(c => ({
    key: c.Key || '',
    url: buildR2Url(c.Key || ''),
  }));
}
