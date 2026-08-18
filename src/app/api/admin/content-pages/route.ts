import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/storage/database/supabase-client';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { deleteFile, deleteByPrefix, extractImageKeysFromHtml, extractKeyFromUrl } from '@/lib/storage';

// Admin POST operations are never cached

/**
 * Resolve an image src from HTML content to a storage key that can be deleted.
 * - For proxy URLs like /api/image?key=xxx, extract the key param.
 * - For full URLs on our R2 bucket, return the object key.
 * - For external URLs, return null (can't delete).
 */
function resolveStorageKey(src: string): string | null {
  // Proxy URL: /api/image?key=xxx
  const proxyMatch = src.match(/\/api\/image\?key=([^&]+)/);
  if (proxyMatch) {
    return decodeURIComponent(proxyMatch[1]).split('?')[0];
  }
  // Full URL on our R2 bucket
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return extractKeyFromUrl(src);
  }
  return null;
}

/**
 * Delete orphaned images: images present in old content but not in new content.
 * Kept as a defensive safety net. With per-page directories and overwrite-on-crop,
 * normal operations should not produce orphans, but this catches edge cases.
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
 * Delete all images referenced in content (legacy fallback for non-prefixed paths).
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

  const supabase = getServiceRoleClient();

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

// POST - Create new content page (or empty draft)
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "admin");
  if (!rl.allowed) return rateLimitResponse(rl.resetTime);
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  const body = await request.json();
  const { type, slug, cover_image, is_published, translations, draft } = body;

  const supabase = getServiceRoleClient();

  // For empty drafts (created before entering editor), generate a unique placeholder slug
  let trimmedSlug = (slug || '').trim();
  if (draft) {
    if (!type) {
      return NextResponse.json({ error: 'type is required for drafts' }, { status: 400 });
    }
    if (!trimmedSlug) {
      trimmedSlug = `draft-${Date.now()}`;
    }
  } else if (!trimmedSlug) {
    return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
  }

  // Check for duplicate slug - reject if exists (ID is the unique identifier, slug is editable for SEO)
  // For drafts, skip the duplicate check since placeholder slugs are unique by timestamp
  if (!draft) {
    const { data: existing } = await supabase
      .from('content_pages')
      .select('id')
      .eq('slug', trimmedSlug)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'A page with this slug already exists' }, { status: 409 });
    }
  }

  // Auto-calculate sort_order: append to end of this type
  const { count } = await supabase
    .from('content_pages')
    .select('*', { count: 'exact', head: true })
    .eq('type', type);
  const newSortOrder = (count || 0) + 1;

  // Create new page
  const { data: page, error: pageError } = await supabase
    .from('content_pages')
    .insert({ type, slug: trimmedSlug, cover_image: cover_image || null, sort_order: newSortOrder, is_published: is_published === false ? false : true })
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

  const supabase = getServiceRoleClient();

  // Fetch old page data to clean up orphaned images
  const { data: oldPage } = await supabase
    .from('content_pages')
    .select('cover_image, type, sort_order, content_page_translations(id, language, content)')
    .eq('id', id)
    .single();

  // Handle reorder: if sort_order changed, shift sibling pages to keep sequence contiguous
  if (sort_order !== undefined && oldPage && sort_order !== oldPage.sort_order) {
    const pageType = oldPage.type;
    const oldOrder = oldPage.sort_order;
    const newOrder = sort_order;

    // Fetch all sibling pages (same type, excluding self)
    const { data: siblings } = await supabase
      .from('content_pages')
      .select('id, sort_order')
      .eq('type', pageType)
      .neq('id', id)
      .order('sort_order', { ascending: true });

    if (siblings) {
      // Remove self from list, insert at new position, reassign sequential sort_order
      const ordered = siblings.filter(s => s.sort_order < oldOrder)
        .concat(siblings.filter(s => s.sort_order > oldOrder));
      // Insert self at target position (0-indexed)
      const insertIndex = Math.max(0, Math.min(newOrder - 1, ordered.length));
      ordered.splice(insertIndex, 0, { id, sort_order: newOrder });

      // Reassign sequential sort_order values
      const updates = ordered.map((s, idx) => ({
        id: s.id,
        sort_order: idx + 1,
      }));

      // Batch update all pages (including self)
      for (const u of updates) {
        await supabase
          .from('content_pages')
          .update({ sort_order: u.sort_order })
          .eq('id', u.id);
      }
    }
  }

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

  // Clean up old cover image if it's being replaced (defensive; covers legacy non-prefixed paths)
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
          .update({
            title: t.title,
            content: t.content,
          })
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
            .update({
              title: t.title,
              content: t.content,
            })
            .eq('id', existing[0].id);
        } else {
          // Insert new translation
          await supabase
            .from('content_page_translations')
            .insert({
              page_id: id,
              language: t.language,
              title: t.title,
              content: t.content,
            });
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE - Delete content page (cascade delete translations + wipe image directory)
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

  const supabase = getServiceRoleClient();
  const pageId = parseInt(id);

  // 0. Fetch old data (for legacy image cleanup fallback)
  const { data: oldPage } = await supabase
    .from('content_pages')
    .select('cover_image, content_page_translations(content)')
    .eq('id', pageId)
    .single();

  // 1. Wipe the entire content/<pageId>/ directory in R2.
  //    This catches every image that belongs to this page — cover, body images,
  //    cropped versions, unsaved temp files — without relying on HTML parsing.
  try {
    const deleted = await deleteByPrefix(`content/${pageId}/`);
    console.log(`[content-pages] Deleted ${deleted} object(s) under content/${pageId}/`);
  } catch (err) {
    console.error(`[content-pages] Failed to delete prefix content/${pageId}/:`, err);
  }

  // 2. Legacy fallback: clean up any images referenced in old HTML that may live
  //    outside the per-page directory (e.g. old uploads/ files from before the migration).
  if (oldPage?.content_page_translations) {
    await cleanupAllImages(oldPage.content_page_translations.map((t: { content: string }) => t.content));
  }
  if (oldPage?.cover_image) {
    const coverKey = resolveStorageKey(oldPage.cover_image);
    if (coverKey && !coverKey.startsWith(`content/${pageId}/`)) {
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
