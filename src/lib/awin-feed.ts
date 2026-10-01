/**
 * Awin product data-feed parser.
 *
 * Accepts the standard Awin datafeed CSV (comma-delimited, gzip handled by the
 * caller) and converts rows into a normalized shape that the rest of the
 * import pipeline understands. This module is intentionally free of any
 * database / business-logic concerns so it can be reused for other networks.
 */
export interface AwinRawRow {
  data_feed_id?: string;
  merchant_id?: string;
  merchant_name?: string;
  aw_product_id?: string;
  aw_deep_link?: string;
  aw_image_url?: string;
  aw_thumb_url?: string;
  category_id?: string;
  category_name?: string;
  brand_id?: string;
  brand_name?: string;
  merchant_product_id?: string;
  merchant_category?: string;
  product_name?: string;
  description?: string;
  merchant_deep_link?: string;
  merchant_image_url?: string;
  search_price?: string;
  // Older / Google-format feeds may use these aliases.
  id?: string;
  title?: string;
  link?: string;
  image_link?: string;
  price?: string;
  google_product_category?: string;
  product_type?: string;
  availability?: string;
}
export interface NormalizedFeedItem {
  awProductId: string;
  merchantProductId: string;
  merchantId: string;
  merchantName: string;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  deepLink: string;
  /** Store's own product URL (used to match promotion pages). */
  merchantUrl: string;
  imageUrl: string;
  category: string;
  /** Additional merchant categories the same SKU is listed under (deduped). */
  extraCategories: string[];
  brand: string;
  inStock: boolean;
}
/**
 * Parse a single CSV line, honoring double-quoted fields and escaped quotes
 * ("") inside them. Returns null for empty lines.
 */
export function parseCsvLine(line: string): string[] | null {
  if (line.length === 0) return null;
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}
/**
 * Parse an Awin CSV document into normalized feed items.
 *
 * @param text       Raw CSV text (already decompressed).
 * @param defaultCurrency Currency to assume when the feed omits one.
 */
export function parseAwinCsv(text: string, defaultCurrency = 'USD'): NormalizedFeedItem[] {
  // Normalize CRLF / stray CR before splitting.
  const clean = text.replace(/\r\n?/g, '\n');
  const lines = clean.split('\n');
  const headerLine = parseCsvLine(lines[0] ?? '');
  if (!headerLine) return [];
  const headers = headerLine.map((h) => h.trim());
  const items: NormalizedFeedItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const record = parseCsvLine(lines[i]);
    if (!record) continue;
    const row: AwinRawRow = {};
    headers.forEach((key, idx) => {
      // Only assign known keys; tolerate feeds with extra columns.
      (row as Record<string, string>)[key] = (record[idx] ?? '').trim();
    });
    const name = (row.product_name || row.title || '').trim();
    const awProductId = (row.aw_product_id || row.id || '').trim();
    // Skip rows with no usable name or identity (trailing blank lines etc.).
    if (!name && !awProductId) continue;
    const price = parsePrice(row.search_price || row.price || '');
    const deepLink = (row.aw_deep_link || row.link || row.merchant_deep_link || '').trim();
    const imageUrl = (
      row.merchant_image_url ||
      row.aw_image_url ||
      row.image_link ||
      ''
    ).trim();
    items.push({
      awProductId,
      merchantProductId: (row.merchant_product_id || '').trim(),
      merchantId: (row.merchant_id || '').trim(),
      merchantName: (row.merchant_name || '').trim(),
      name,
      description: (row.description || '').trim(),
      price,
      currency: defaultCurrency,
      deepLink,
      merchantUrl: (row.merchant_deep_link || '').trim(),
      imageUrl,
      category: (row.merchant_category || row.category_name || row.product_type || '').trim(),
      extraCategories: [],
      brand: (row.brand_name || '').trim(),
      inStock: parseAvailability(row.availability),
    });
  }
  return items;
}
/**
 * Collapse duplicate feed rows that share the same product identity.
 *
 * Awin advertisers frequently list one product under several merchant
 * categories, which otherwise produces multiple preview entries for the same
 * SKU (one per category tab). We keep the first row as canonical and collect
 * the additional categories so the product is still reachable under every tab
 * while being imported only once.
 */
export function dedupeFeedItems(items: NormalizedFeedItem[]): NormalizedFeedItem[] {
  const indexByKey = new Map<string, number>();
  const out: NormalizedFeedItem[] = [];
  for (const item of items) {
    // Prefer the store's own SKU, fall back to the Awin product id; only
    // dedupe when we have a stable identity.
    const key = item.merchantProductId || item.awProductId || '';
    if (!key) {
      out.push({ ...item, extraCategories: [] });
      continue;
    }
    const existingIdx = indexByKey.get(key);
    if (existingIdx === undefined) {
      indexByKey.set(key, out.length);
      out.push({ ...item, extraCategories: [] });
      continue;
    }
    const existing = out[existingIdx];
    if (item.category && item.category !== existing.category) {
      const extras = existing.extraCategories ?? [];
      if (!extras.includes(item.category)) extras.push(item.category);
      out[existingIdx] = { ...existing, extraCategories: extras };
    }
  }
  return out;
}
/**
 * Parse a price that may include a currency symbol / thousands separators,
 * e.g. "9.99", "$1,299.00", "9.99 USD". Returns null when unparseable.
 */
export function parsePrice(raw: string): number | null {
  if (!raw) return null;
  // Keep digits, dot and comma.
  const cleaned = raw.replace(/[^0-9.,]/g, '').trim();
  if (!cleaned) return null;
  // Heuristic: if a comma appears after the last dot, comma is the decimal
  // separator (e.g. 1.299,00); otherwise treat commas as thousands.
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned.replace(/,/g, '');
  }
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}
function parseAvailability(raw: string | undefined): boolean {
  if (!raw) return true;
  const v = raw.trim().toLowerCase();
  if (!v) return true;
  // Explicit out-of-stock / unavailable means not sellable; anything else is in stock.
  if (v.startsWith('out') || v === 'unavailable') return false;
  return true;
}
