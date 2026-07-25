import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { put, list } from "@vercel/blob";
import { Readable } from "node:stream";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: "No files uploaded" }, { status: 400 });
    }

    const results: Array<{ name: string; url: string; size: number }> = [];
    const errors: Array<{ name: string; error: string }> = [];

    // Get existing blobs to avoid duplicates
    let existingUrls = new Set<string>();
    try {
      const existing = await list({ limit: 1000 });
      existingUrls = new Set(existing.blobs.map((b) => b.url));
    } catch {
      // Ignore if can't list
    }

    for (const file of files) {
      try {
        const fileName = file.name;

        // Skip if already exists
        if (existingUrls.has(fileName)) {
          results.push({ name: fileName, url: fileName, size: file.size });
          continue;
        }

        // Convert File to Readable stream for Vercel Blob
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const readable = new Readable();
        readable.push(buffer);
        readable.push(null);

        const blob = await put(fileName, readable, {
          access: "public",
          contentType: file.type || "application/octet-stream",
          addRandomSuffix: false,
        });

        results.push({ name: fileName, url: blob.url, size: file.size });
      } catch (err) {
        errors.push({ name: file.name, error: (err as Error).message });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        uploaded: results.length,
        skipped: results.filter((r) => r.url === r.name).length,
        failed: errors.length,
        results,
        errors,
      },
    });
  } catch (error) {
    console.error("Blob import error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
