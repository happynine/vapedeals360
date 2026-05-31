import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Clean rich text HTML from Quill editor:
 * 1. Replace &nbsp; between word characters with regular spaces (prevents word-breaking)
 * 2. Remove empty paragraphs/headings that Quill inserts as spacing
 */
export function cleanRichText(html: string): string {
  return html
    // Replace &nbsp; between word characters with regular space
    // e.g. "Welcome&nbsp;to&nbsp;VapeDeals360" → "Welcome to VapeDeals360"
    // But keep standalone &nbsp; (used for indentation) by only replacing when between alphanumeric chars
    .replace(/(\w)&nbsp;(\w)/g, '$1 $2')
    .replace(/(\w)&nbsp;([A-Z])/g, '$1 $2')
    // Also handle &nbsp; between punctuation and word characters
    .replace(/([.,;:!?])&nbsp;(\w)/g, '$1 $2')
    .replace(/(\w)&nbsp;([.,;:!?])/g, '$1 $2')
    // Remove <p> containing only whitespace, &nbsp;, <br>, <span>&nbsp;</span>, etc.
    .replace(/<p[^>]*>(\s|<br\s*\/?>|&nbsp;|<span[^>]*>\s*(&nbsp;\s*)*\s*<\/span>)*<\/p>/gi, '')
    // Remove <h1-6> containing only whitespace, &nbsp;, <br>, <span>&nbsp;</span>, etc.
    .replace(/<h[1-6][^>]*>(\s|<br\s*\/?>|&nbsp;|<span[^>]*>\s*(&nbsp;\s*)*\s*<\/span>)*<\/h[1-6]>/gi, '')
    // Remove <div> containing only whitespace, &nbsp;, <br>, <span>&nbsp;</span>, etc.
    .replace(/<div[^>]*>(\s|<br\s*\/?>|&nbsp;|<span[^>]*>\s*(&nbsp;\s*)*\s*<\/span>)*<\/div>/gi, '');
}
