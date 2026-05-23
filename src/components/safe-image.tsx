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

interface SafeImageProps extends Omit<ImageProps, 'src'> {
  src: string | null | undefined;
  fallback?: React.ReactNode;
}

/**
 * A wrapper around next/image that gracefully handles invalid URLs.
 * If the src is not a valid absolute/relative URL, it renders a fallback.
 * For SVG-returning URLs (like placehold.co), adds unoptimized to avoid Next.js errors.
 */
export function SafeImage({ src, fallback, alt, ...rest }: SafeImageProps) {
  if (!src || !isValidImageUrl(src)) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex items-center justify-center w-full h-full bg-secondary/50 text-muted-foreground text-xs">
        No Image
      </div>
    );
  }

  const needsUnoptimized = isSvgUrl(src);

  return <Image src={src} alt={alt} unoptimized={needsUnoptimized} {...rest} />;
}
