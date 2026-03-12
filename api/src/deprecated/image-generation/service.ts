/**
 * ImageGenerationService — Phase 4.
 * Flux + IP-Adapter thought images; daily cap; cache; persist to S3/R2 or return fal URL.
 */

import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import {
  db,
  thoughts,
  failedProcessingJobs,
  imageGenerations,
  users,
} from "../../db";
import { generateWithFlux, fluxImageToImage, type FalImageResult } from "./fal";
import { persistImageUrl } from "./storage";
import { imageConfig } from "./config";

/** Start of today UTC for daily cap */
function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Check daily cap; throw if over. */
async function checkDailyCap(userId: string): Promise<void> {
  const count = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(imageGenerations)
    .where(
      and(
        eq(imageGenerations.userId, userId),
        gte(imageGenerations.createdAt, startOfTodayUtc())
      )
    );
  const n = count[0]?.count ?? 0;
  if (n >= imageConfig.dailyCapPerUser) {
    throw new Error(
      `Daily image generation cap (${imageConfig.dailyCapPerUser}) reached`
    );
  }
}

/** Cache: same user + same sentence → existing thought image_url. */
async function getCachedImageUrl(
  userId: string,
  sentence: string
): Promise<string | null> {
  const rows = await db
    .select({ imageUrl: thoughts.imageUrl })
    .from(thoughts)
    .where(
      and(
        eq(thoughts.userId, userId),
        eq(thoughts.sentence, sentence.trim()),
        isNotNull(thoughts.imageUrl)
      )
    )
    .orderBy(desc(thoughts.createdAt))
    .limit(1);
  const url = rows[0]?.imageUrl;
  return url && url.length > 0 ? url : null;
}

function metadataFromResult(result: FalImageResult): Record<string, unknown> {
  return {
    model: imageConfig.fluxEndpoint,
    ip_adapter_scale: imageConfig.ipAdapterScale,
    guidance_scale: imageConfig.guidanceScale,
    num_inference_steps: imageConfig.numInferenceSteps,
    fal_request_id: result.requestId,
    seed: result.seed,
    used_ip_adapter: result.usedIpAdapter,
  };
}

/**
 * Generate thought image (sentence + profile photo). Uses cache for same user+sentence.
 * Records daily cap, persists to storage, updates thought. On failure queues retry.
 */
export async function generateThoughtImage(
  thoughtId: string,
  userId: string,
  sentence: string,
  profilePhotoUrl: string,
  context?: string | null
): Promise<string> {
  await checkDailyCap(userId);
  const cached = await getCachedImageUrl(userId, sentence);
  if (cached) {
    await db
      .update(thoughts)
      .set({ imageUrl: cached })
      .where(eq(thoughts.id, thoughtId));
    return cached;
  }

  try {
    const result = await generateWithFlux(sentence, profilePhotoUrl, context);
    const permanentUrl = await persistImageUrl(result.url);
    await db.insert(imageGenerations).values({
      userId,
      thoughtId,
    });
    await db
      .update(thoughts)
      .set({
        imageUrl: permanentUrl,
        imageMetadata: metadataFromResult(result),
      })
      .where(eq(thoughts.id, thoughtId));
    return permanentUrl;
  } catch (e) {
    await db.insert(failedProcessingJobs).values({
      thoughtId,
      jobType: "image",
      error: e instanceof Error ? e.message : String(e),
      retryCount: 0,
    });
    throw e;
  }
}

export async function generateThoughtPreview(
  sentence: string,
  profilePhotoUrl: string,
  context?: string | null
): Promise<{ imageUrl: string; imageMetadata: Record<string, unknown> }> {
  const result = await generateWithFlux(sentence, profilePhotoUrl, context);
  const imageUrl = await persistImageUrl(result.url);

  return {
    imageUrl,
    imageMetadata: metadataFromResult(result),
  };
}

/**
 * Generate crossing image (two profile photos). Two-pass: Flux with photoA then img2img with photoB.
 */
export async function generateCrossingImage(
  sentence: string,
  photoUrlA: string,
  photoUrlB: string
): Promise<string> {
  const result1 = await generateWithFlux(sentence, photoUrlA);
  const firstUrl = result1.url;
  const result2 = await fluxImageToImage(firstUrl, sentence, photoUrlB);
  return persistImageUrl(result2.url);
}

/**
 * Run image generation for a thought (for reprocessing failed jobs).
 * Call with thoughtId from failed_processing_jobs; fetches thought row for user_id, sentence, and profile photo.
 */
export async function generateThoughtImageByThoughtId(
  thoughtId: string
): Promise<string | null> {
  const [thought] = await db
    .select()
    .from(thoughts)
    .where(eq(thoughts.id, thoughtId));
  if (!thought) return null;
  const [user] = await db
    .select({ photoUrl: users.photoUrl })
    .from(users)
    .where(eq(users.id, thought.userId));
  const photoUrl = user?.photoUrl;
  if (!photoUrl) return null;
  return generateThoughtImage(
    thoughtId,
    thought.userId,
    thought.sentence,
    photoUrl,
    thought.context
  );
}
