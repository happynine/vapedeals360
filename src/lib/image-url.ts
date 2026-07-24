/**
 * Image URL helper - safe for client-side use
 * Does not import any Node.js modules
 */

/**
 * Get the full image URL from a key or URL
 * - If already a full URL (http/https), return as-is
 * - If it's a storage key, convert to /api/image proxy URL
 */
export function getImageUrl(keyOrUrl: string | undefined | null): string {
  if (!keyOrUrl) return '';
  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    return keyOrUrl;
  }
  return `/api/image?key=${encodeURIComponent(keyOrUrl)}`;
}
