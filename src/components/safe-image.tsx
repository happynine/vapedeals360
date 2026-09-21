'use client';

import { useState, useEffect } from 'react';
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

/**
 * Whether a URL is same-origin (relative) so a HEAD fetch won't hit CORS.
 */
function isSameOriginUrl(src: string): boolean {
  return src.startsWith('/') && !src.startsWith('//');
}

interface SafeImageProps extends Omit<ImageProps, 'src'> {
  src: string | null | undefined;
  fallback?: React.ReactNode;
  /**
   * Control image optimization behavior:
   * - true: always use plain img tag (no compression, for images <=200KB)
   * - false: always use Next.js Image (auto-optimize, for images >200KB)
   * - undefined: auto-detect by fetching image size (>200KB = optimize, <=200KB = no optimize)
   */
  unoptimized?: boolean;
}

/**
 * A wrapper around next/image that gracefully handles invalid URLs, S3 keys, and Vercel Blob URLs.
 * - Vercel Blob URLs → pass to next/image (publicly accessible)
 * - Valid URLs (http/https/) → pass to next/image
 * - S3 keys (e.g. "stores/logo.png") → proxy through /api/image?key=...
 * - Invalid/empty → render fallback
 * For SVG-returning URLs (like placehold.co), adds unoptimized to avoid Next.js errors.
 *
 * Image optimization logic:
 * - If unoptimized=true: always skip optimization (use plain img)
 * - If unoptimized=false: always use Next.js Image (auto-optimize)
 * - If unoptimized=undefined: auto-detect size for same-origin images;
 *   cross-origin images skip the (CORS-blocked) probe and default to plain img.
 */
export function SafeImage({ src, fallback, alt, unoptimized: forceUnoptimized, ...rest }: SafeImageProps) {
  // Hooks MUST be called unconditionally, before any early return, to obey rules of hooks.
  const [shouldOptimize, setShouldOptimize] = useState<boolean | null>(null);

  const hasSrc = !!src;
  const trimmedSrc = hasSrc ? (src as string).trim() : '';
  const s3Key = hasSrc && isS3Key(trimmedSrc) ? trimmedSrc : null;
  const validUrl = hasSrc && !s3Key && isValidImageUrl(trimmedSrc) ? trimmedSrc : null;
  const svg = validUrl ? isSvgUrl(validUrl) : false;
  const vercelBlob = validUrl ? isVercelBlobUrl(validUrl) : false;
  const canProbe = validUrl ? isSameOriginUrl(validUrl) : false;

  // Only auto-detect size for same-origin URLs where a HEAD request won't be CORS-blocked.
  useEffect(() => {
    if (!canProbe) return;
    let cancelled = false;

    async function checkSize() {
      try {
        const response = await fetch(validUrl as string, { method: 'HEAD' });
        const contentLength = response.headers.get('content-length');
        const sizeInBytes = contentLength ? parseInt(contentLength, 10) : 0;
        const sizeInKB = sizeInBytes / 1024;
        if (!cancelled) {
          // >200KB: optimize; <=200KB: no optimize
          setShouldOptimize(sizeInKB > 200);
        }
      } catch {
        if (!cancelled) {
          setShouldOptimize(false);
        }
      }
    }

    checkSize();
    return () => {
      cancelled = true;
    };
  }, [canProbe, validUrl]);

  const imgClass = typeof rest.className === 'string' ? rest.className : undefined;

  if (!hasSrc || (!s3Key && !validUrl)) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex items-center justify-center w-full h-full bg-secondary/50 text-muted-foreground text-xs">
        No Image
      </div>
    );
  }

  // S3 key → proxy through API, plain img
  if (s3Key) {
    const proxyUrl = s3KeyToProxyUrl(s3Key);
    return <img src={proxyUrl} alt={(alt as string) || ''} className={imgClass} style={rest.style} />;
  }

  // SVG / Vercel Blob → always plain img
  if (svg || vercelBlob) {
    return <img src={validUrl as string} alt={(alt as string) || ''} className={imgClass} style={rest.style} />;
  }

  // Explicit optimization choice
  if (forceUnoptimized !== undefined) {
    if (forceUnoptimized) {
      return <img src={validUrl as string} alt={(alt as string) || ''} className={imgClass} style={rest.style} />;
    }
    return <Image src={validUrl as string} alt={alt} {...rest} />;
  }

  // Cross-origin (no probe possible): default to plain img, the proven-safe path.
  if (!canProbe) {
    return <img src={validUrl as string} alt={(alt as string) || ''} className={imgClass} style={rest.style} />;
  }

  // Same-origin: while the size probe runs, show a placeholder.
  if (shouldOptimize === null) {
    return (
      <div
        className={imgClass}
        style={{ ...rest.style, backgroundColor: 'var(--color-secondary)', opacity: 0.5 }}
      />
    );
  }

  if (shouldOptimize) {
    return <Image src={validUrl as string} alt={alt} {...rest} />;
  }

  return <img src={validUrl as string} alt={(alt as string) || ''} className={imgClass} style={rest.style} />;
}
