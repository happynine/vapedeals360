import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { deleteFile, extractImageKeysFromHtml } from '@/lib/storage';

// Admin POST operations are never cached

/**
 * Resolve an image src from HTML content to a storage key that can be deleted.
 * - For proxy URLs like /api/image?key=xxx, extract the key param.
 * - For full URLs (Vercel Blob), return as-is.
 * - For external URLs, return null (can't delete).
 */
function resolveStorageKey(src: string): string | null {
  // Proxy URL: /api/image?key=xxx
  const proxyMatch = src.match(/\/api\/image\?key=([^&]+)/);
  if (proxyMatch) {
    return decodeURIComponent(proxyMatch[1]);
  }
  // Full URL (Vercel Blob) - our storage URLs
  if (src.startsWith('http://') || src.startsWith('https://')) {
    // Only consider it ours if we're in Vercel Blob mode or it matches known patterns
    // We'll attempt deletion and it will be skipped if not our storage
    return src;
  }
  return null;
}

/**
 * Delete orphaned images: images present in old content but not in new content.
 */
async function cleanupOrphanedImages(oldContent: string | null | undefined, newContent: string | null | undefined) {
  const oldKeys = extractImageKeysFromHtml(oldContent).map(resolveStorageKey).filter((k): k is string => k !== null);
  const newKeys = new Set(extractImageKeysFromHtml(newContent).map(resolveStorageKey).filter((k): k is string => k !== null));

  const keysToDelete = oldKeys.filter(k => !newKeys.has(k));
  for (const key of keysToDelete) {
    try {
      await deleteFile(key);
    } catch (err) {
      console.error('[content-pages] Failed to delete orphaned image:', key, err);
    }
  }
}

/**
 * Delete all images referenced in content.
 */
async function cleanupAllImages(contents: (string | null | undefined)[]) {
  const allKeys = contents.flatMap(c => extractImageKeysFromHtml(c).map(resolveStorageKey).filter((k): k is string => k !== null));
  const uniqueKeys = [...new Set(allKeys)];
  for (const key of uniqueKeys) {
    try {
      await deleteFile(key);
    } catch (err) {
      console.error('[content-pages] Failed to delete image:', key, err);
    }
  }
}
// GET /api/admin/content-pages?type=best_vapes
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');

  const supabase = getSupabaseClient();

  if (id) {
    // Get single page with all translations
    const { data: page, error } = await supabase
      .from('content_pages')
      .select('*, content_page_translations(*)')
      .eq('id', parseInt(id))
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: page });
  }

  if (!type) {
    return NextResponse.json({ error: 'type parameter required' }, { status: 400 });
  }

  // Get category description
  const { data: descData } = await supabase
    .from('category_descriptions')
    .select('*')
    .eq('category_key', type);

  // Get all pages of this type
  const { data: pages, error } = await supabase
    .from('content_pages')
    .select('*, content_page_translations(*)')
    .eq('type', type)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    description: descData || [],
    data: pages || [],
  });
}

// POST - Create new content page
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  const body = await request.json();
  const { type, slug, cover_image, sort_order, is_published, translations } = body;

  const trimmedSlug = (slug || '').trim();
  if (!trimmedSlug) {
    return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  // Check for duplicate slug - if exists, update instead of creating new
  const { data: existing } = await supabase
    .from('content_pages')
    .select('id')
    .eq('slug', trimmedSlug)
    .limit(1);

  if (existing && existing.length > 0) {
    // Slug already exists - update the existing page instead
    const existingId = existing[0].id;
    
    // Fetch old content to clean up orphaned images
    const { data: oldPage } = await supabase
      .from('content_pages')
      .select('cover_image, content_page_translations(content)')
      .eq('id', existingId)
      .single();

    // Clean up cover image if it's being replaced
    if (cover_image !== undefined && oldPage?.cover_image && oldPage.cover_image !== cover_image) {
      const coverKey = resolveStorageKey(oldPage.cover_image);
      if (coverKey) {
        try { await deleteFile(coverKey); } catch { /* ignore */ }
      }
    }

    // Update page fields
    const updateFields: Record<string, unknown> = { 
      updated_at: new Date().toISOString(),
      is_published: is_published !== false 
    };
    if (cover_image !== undefined) updateFields.cover_image = cover_image;
    if (sort_order !== undefined) updateFields.sort_order = sort_order;
    if (type !== undefined) updateFields.type = type;
    
    await supabase
      .from('content_pages')
      .update(updateFields)
      .eq('id', existingId);

    // Update or insert translations
    if (translations && translations.length > 0) {
      for (const t of translations) {
        const { data: existingTrans } = await supabase
          .from('content_page_translations')
          .select('id, content')
          .eq('page_id', existingId)
          .eq('language', t.language)
          .limit(1);

        if (existingTrans && existingTrans.length > 0) {
          // Clean up orphaned images in old content vs new content
          await cleanupOrphanedImages(existingTrans[0].content, t.content);
          await supabase
            .from('content_page_translations')
            .update({ title: t.title, content: t.content })
            .eq('id', existingTrans[0].id);
        } else {
          await supabase
            .from('content_page_translations')
            .insert({ page_id: existingId, language: t.language, title: t.title, content: t.content });
        }
      }
    }

    // Return the updated page with translations
    const { data: updatedPage } = await supabase
      .from('content_pages')
      .select('*, content_page_translations(*)')
      .eq('id', existingId)
      .single();

    return NextResponse.json({ success: true, data: updatedPage });
  }

  // No duplicate - create new page
  const { data: page, error: pageError } = await supabase
    .from('content_pages')
    .insert({ type, slug: trimmedSlug, cover_image, sort_order: sort_order || 0, is_published: is_published !== false })
    .select()
    .single();

  if (pageError) {
    return NextResponse.json({ error: pageError.message }, { status: 500 });
  }

  if (translations && translations.length > 0) {
    const translationRows = translations.map((t: { language: string; title: string; content: string }) => ({
      page_id: page.id,
      language: t.language,
      title: t.title,
      content: t.content,
    }));

    const { data: insertedTranslations, error: transError } = await supabase
      .from('content_page_translations')
      .insert(translationRows)
      .select();

    if (transError) {
      return NextResponse.json({ error: transError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { ...page, content_page_translations: insertedTranslations } });
  }

  return NextResponse.json({ success: true, data: page });
}

// PUT - Update content page
export async function PUT(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  const body = await request.json();
  const { id, slug, cover_image, sort_order, is_published, translations } = body;

  const supabase = getSupabaseClient();

  // Fetch old page data to clean up orphaned images
  const { data: oldPage } = await supabase
    .from('content_pages')
    .select('cover_image, content_page_translations(id, language, content)')
    .eq('id', id)
    .single();

  // Check for duplicate slug (exclude self)
  if (slug) {
    const trimmedSlug = slug.trim();
    const { data: existingSlug } = await supabase
      .from('content_pages')
      .select('id')
      .eq('slug', trimmedSlug)
      .neq('id', id)
      .limit(1);
    if (existingSlug && existingSlug.length > 0) {
      return NextResponse.json({ error: 'A page with this slug already exists' }, { status: 409 });
    }
  }

  // Only update fields that are explicitly provided (avoid setting fields to NULL)
  const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (slug !== undefined) updateFields.slug = slug.trim();
  if (cover_image !== undefined) updateFields.cover_image = cover_image;
  if (sort_order !== undefined) updateFields.sort_order = sort_order;
  if (is_published !== undefined) updateFields.is_published = is_published;

  // Clean up old cover image if it's being replaced
  if (cover_image !== undefined && oldPage?.cover_image && oldPage.cover_image !== cover_image) {
    const coverKey = resolveStorageKey(oldPage.cover_image);
    if (coverKey) {
      try { await deleteFile(coverKey); } catch { /* ignore */ }
    }
  }

  const { error: pageError } = await supabase
    .from('content_pages')
    .update(updateFields)
    .eq('id', id);

  if (pageError) {
    return NextResponse.json({ error: pageError.message }, { status: 500 });
  }

  if (translations) {
    for (const t of translations) {
      if (t.id) {
        // Find old content for this translation to clean up orphaned images
        const oldTrans = oldPage?.content_page_translations?.find(
          (ot: { id: number }) => ot.id === t.id
        );
        if (oldTrans) {
          await cleanupOrphanedImages(oldTrans.content, t.content);
        }
        await supabase
          .from('content_page_translations')
          .update({ title: t.title, content: t.content })
          .eq('id', t.id);
      } else {
        // Check if translation already exists for this page+language
        const { data: existing } = await supabase
          .from('content_page_translations')
          .select('id, content')
          .eq('page_id', id)
          .eq('language', t.language)
          .limit(1);
        if (existing && existing.length > 0) {
          // Clean up orphaned images in old content vs new content
          await cleanupOrphanedImages(existing[0].content, t.content);
          // Update existing translation
          await supabase
            .from('content_page_translations')
            .update({ title: t.title, content: t.content })
            .eq('id', existing[0].id);
        } else {
          // Insert new translation
          await supabase
            .from('content_page_translations')
            .insert({ page_id: id, language: t.language, title: t.title, content: t.content });
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE - Delete content page (cascade delete translations + cleanup images)
export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  let id: string | null;
  
  // Try to get id from query params first, then from body
  const { searchParams } = new URL(request.url);
  id = searchParams.get('id');
  
  if (!id) {
    const body = await request.json();
    id = body.id?.toString();
  }

  if (!id) {
    return NextResponse.json({ error: 'id parameter required' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const pageId = parseInt(id);

  // 0. Fetch old data to clean up images
  const { data: oldPage } = await supabase
    .from('content_pages')
    .select('cover_image, content_page_translations(content)')
    .eq('id', pageId)
    .single();

  // 1. Clean up all images in content translations
  if (oldPage?.content_page_translations) {
    await cleanupAllImages(oldPage.content_page_translations.map((t: { content: string }) => t.content));
  }

  // 2. Clean up cover image
  if (oldPage?.cover_image) {
    const coverKey = resolveStorageKey(oldPage.cover_image);
    if (coverKey) {
      try { await deleteFile(coverKey); } catch { /* ignore */ }
    }
  }

  // 3. Delete translations first (cascade)
  const { error: transError } = await supabase
    .from('content_page_translations')
    .delete()
    .eq('page_id', pageId);

  if (transError) {
    return NextResponse.json({ error: transError.message }, { status: 500 });
  }

  // 4. Delete the page itself
  const { error } = await supabase
    .from('content_pages')
    .delete()
    .eq('id', pageId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
