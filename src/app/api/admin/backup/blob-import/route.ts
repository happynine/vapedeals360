import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: "No files uploaded" }, { status: 400 });
    }

    const hasR2 = !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
    if (!hasR2) {
      return NextResponse.json({ success: false, error: "R2 storage not configured" }, { status: 500 });
    }

    const client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
      forcePathStyle: true,
    });

    const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://${process.env.R2_BUCKET_NAME}.r2.dev`;

    // Get existing object keys to avoid duplicates
    let existingKeys = new Set<string>();
    try {
      let continuationToken: string | undefined;
      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: process.env.R2_BUCKET_NAME,
            ContinuationToken: continuationToken,
          })
        );
        for (const obj of response.Contents || []) {
          existingKeys.add(obj.Key || "");
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);
    } catch {
      // Ignore if can't list
    }

    const results: Array<{ name: string; url: string; size: number }> = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const file of files) {
      try {
        const fileName = file.name;

        // Skip if already exists
        if (existingKeys.has(fileName)) {
          results.push({ name: fileName, url: `${R2_PUBLIC_URL.replace(/\/$/, "")}/${fileName}`, size: file.size });
          continue;
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await client.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: file.type || "application/octet-stream",
          })
        );

        const url = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${fileName}`;
        results.push({ name: fileName, url, size: file.size });
      } catch (err) {
        errors.push({ name: file.name, error: (err as Error).message });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        uploaded: results.length,
        skipped: results.filter((r) => r.url === `${R2_PUBLIC_URL.replace(/\/$/, "")}/${r.name}`).length,
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
