'use client';

import Image from 'next/image';
import type { ImageProps } from 'next/image';

/**
 * Validates if a string is a proper URL that next/image can handle.
 * Must start with / (relative) or http:// or https://
 */
function isValidImageUrl(src: string): boolean {
  if (!src || typeof src !== 'string') return false;
  const trimmed = src.trim();
  return trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Checks if a src is an S3 object key (not a URL).
 * S3 keys look like "stores/logo.png" or "banners/hero.jpg" etc.
 */
function isS3Key(src: string): boolean {
  if (!src || typeof src !== 'string') return false;
  const trimmed = src.trim();
  // S3 keys don't start with / or http, and contain /
  return !trimmed.startsWith('/') && !trimmed.startsWith('http://') && !trimmed.startsWith('https://') && trimmed.length > 0;
}

/**
 * Converts an S3 key to a proxy URL that resolves to a signed S3 URL.
 */
function s3KeyToProxyUrl(key: string): string {
  return `/api/image?key=${encodeURIComponent(key)}`;
}

/**
 * Checks if a URL is likely to return SVG content (like placehold.co)
 */
function isSvgUrl(src: string): boolean {
  try {
    const url = new URL(src);
    return url.hostname === 'placehold.co';
  } catch {
    return false;
  }
}

/**
 * Checks if a URL is a Vercel Blob URL (publicly accessible, no proxy needed)
 */
function isVercelBlobUrl(src: string): boolean {
  return src.includes('.blob.vercel-storage.com') || src.includes('.public.blob.vercel-storage.com');
}

interface SafeImageProps extends Omit<ImageProps, 'src'> {
  src: string | null | undefined;
  fallback?: React.ReactNode;
}

/**
 * A wrapper around next/image that gracefully handles invalid URLs, S3 keys, and Vercel Blob URLs.
 * - Vercel Blob URLs → pass to next/image (publicly accessible)
 * - Valid URLs (http/https/) → pass to next/image
 * - S3 keys (e.g. "stores/logo.png") → proxy through /api/image?key=...
 * - Invalid/empty → render fallback
 * For SVG-returning URLs (like placehold.co), adds unoptimized to avoid Next.js errors.
 */
export function SafeImage({ src, fallback, alt, ...rest }: SafeImageProps) {
  if (!src) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex items-center justify-center w-full h-full bg-secondary/50 text-muted-foreground text-xs">
        No Image
      </div>
    );
  }

  const trimmedSrc = src.trim();

  // If it's an S3 key, convert to proxy URL and use plain img (not next/image, to avoid domain issues)
  if (isS3Key(trimmedSrc)) {
    const proxyUrl = s3KeyToProxyUrl(trimmedSrc);
    return <img src={proxyUrl} alt={alt as string || ''} className={typeof rest.className === 'string' ? rest.className : undefined} style={rest.style} />;
  }

  // If it's not a valid URL, show fallback
  if (!isValidImageUrl(trimmedSrc)) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex items-center justify-center w-full h-full bg-secondary/50 text-muted-foreground text-xs">
        No Image
      </div>
    );
  }

  // Vercel Blob URLs and SVG URLs need unoptimized
  const needsUnoptimized = isSvgUrl(trimmedSrc) || isVercelBlobUrl(trimmedSrc);

  return <Image src={trimmedSrc} alt={alt} unoptimized={needsUnoptimized} {...rest} />;
}
