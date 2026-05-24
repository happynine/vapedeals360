import { NextRequest, NextResponse } from 'next/server';
import { fetchBanners, type Banner } from '@/lib/database';
import { getPresignedUrl } from '@/lib/storage';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') || 'en';

    const banners = await fetchBanners(language) as Banner[];

    // Generate accessible URLs for banner images
    const bannersWithUrls = await Promise.all(
      banners.map(async (banner) => {
        const translation = banner.translations?.find((t) => t.language === language) || banner.translations?.[0];
        const imageKey = translation?.image_key || banner.image_key;

        const imageUrl = await getPresignedUrl(imageKey || null);

        return {
          id: banner.id,
          image_url: imageUrl,
          link_url: banner.link_url,
          title: translation?.title || null,
          subtitle: translation?.subtitle || null,
        };
      })
    );

    return NextResponse.json({ success: true, data: bannersWithUrls });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch banners';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
