/**
 * Persist generated image: download from fal URL, optionally upload to S3/R2.
 * If IMAGE_STORAGE_BUCKET is unset, returns the fal URL as-is (may be temporary).
 */

import { imageConfig } from "./config";

export async function persistImageUrl(falImageUrl: string): Promise<string> {
  if (!imageConfig.storageBucket) {
    return falImageUrl;
  }

  const res = await fetch(falImageUrl);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/png";

  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const region = process.env.AWS_REGION ?? "us-east-1";
    const endpoint = process.env.S3_ENDPOINT; // for R2: https://<account>.r2.cloudflarestorage.com
    const client = new S3Client({
      region,
      ...(endpoint && { endpoint }),
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
    const key = `thoughts/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.png`;
    await client.send(
      new PutObjectCommand({
        Bucket: imageConfig.storageBucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    const base = (imageConfig.cdnUrl || (endpoint ? `https://${imageConfig.storageBucket}.r2.cloudflarestorage.com` : `https://${imageConfig.storageBucket}.s3.${region}.amazonaws.com`)).replace(/\/$/, "");
    return `${base}/${key}`;
  } catch {
    return falImageUrl;
  }
}
