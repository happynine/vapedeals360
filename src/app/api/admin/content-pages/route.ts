import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';
// GET /api/admin/content-pages?type=best_vapes
export async function GET(request: NextRequest) {
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
          .select('id')
          .eq('page_id', existingId)
          .eq('language', t.language)
          .limit(1);

        if (existingTrans && existingTrans.length > 0) {
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
  if (!(await verifyAdminSession(request))) return unauthorizedResponse();
  const body = await request.json();
  const { id, slug, cover_image, sort_order, is_published, translations } = body;

  // Debug: log what we receive for content
  const supabase = getSupabaseClient();

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
        await supabase
          .from('content_page_translations')
          .update({ title: t.title, content: t.content })
          .eq('id', t.id);
      } else {
        // Check if translation already exists for this page+language
        const { data: existing } = await supabase
          .from('content_page_translations')
          .select('id')
          .eq('page_id', id)
          .eq('language', t.language)
          .limit(1);
        if (existing && existing.length > 0) {
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

// DELETE - Delete content page (cascade delete translations)
export async function DELETE(request: NextRequest) {
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

  // 1. Delete translations first (cascade)
  const { error: transError } = await supabase
    .from('content_page_translations')
    .delete()
    .eq('page_id', pageId);

  if (transError) {
    return NextResponse.json({ error: transError.message }, { status: 500 });
  }

  // 2. Delete the page itself
  const { error } = await supabase
    .from('content_pages')
    .delete()
    .eq('id', pageId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
