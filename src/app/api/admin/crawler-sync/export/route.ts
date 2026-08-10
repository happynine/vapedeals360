import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';

// Tables to export for crawler sync (products + related data)
const TABLES = [
  'products',
  'product_translations',
  'product_prices',
  'stores',
  'store_translations',
  'categories',
  'category_translations',
] as const;

/**
 * Build public URL for an R2 object key.
 * Priority: image_url field > construct from image_key + R2_PUBLIC_URL
 */
function resolveImageUrl(
  imageUrl: string | null | undefined,
  imageKey: string | null | undefined,
): string | null {
  // If image_url is already a full URL, use it directly
  if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
    return imageUrl;
  }

  // If we have an image_key, construct the public URL
  if (imageKey) {
    const r2BaseUrl =
      process.env.R2_PUBLIC_URL ||
      `https://${process.env.R2_BUCKET_NAME || 'vapedeals360-images'}.r2.dev`;
    return `${r2BaseUrl.replace(/\/$/, '')}/${imageKey}`;
  }

  // Fallback: use image_url even if it doesn't start with http (might be a relative path)
  if (imageUrl) {
    return imageUrl;
  }

  return null;
}

export async function GET() {
  try {
    const supabase = getServiceRoleClient();
    const data: Record<string, unknown[]> = {};

    for (const table of TABLES) {
      const { data: rows, error } = await supabase.from(table).select('*');
      if (error) {
        console.error(`Error exporting ${table}:`, error);
        data[table] = [];
      } else {
        data[table] = rows || [];
      }
    }

    // Resolve product image URLs for crawler tool compatibility
    // The crawler tool needs accessible HTTP URLs to display images in comparison view
    const products = data['products'] as Array<Record<string, unknown>>;
    for (const product of products) {
      product['image_url'] = resolveImageUrl(
        product['image_url'] as string | null,
        product['image_key'] as string | null,
      );
      product['home_image_url'] = resolveImageUrl(
        product['home_image_url'] as string | null,
        product['home_image_key'] as string | null,
      );
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...data,
    });
  } catch (error) {
    console.error('Crawler sync export error:', error);
    return NextResponse.json(
      { success: false, error: 'Export failed' },
      { status: 500 },
    );
  }
}
