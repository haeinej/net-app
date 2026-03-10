/**
 * ThoughtProcessingService — Phase 3.
 * Resonance signature extraction + compatibility embeddings for new thoughts.
 */

import { eq } from "drizzle-orm";
import { db, thoughts, failedProcessingJobs } from "../db";
import { getEmbeddingService } from "../embedding";
import { llmConfig, complete } from "../llm";
import {
  RESONANCE_SIGNATURE_SYSTEM,
  resonanceSignatureUser,
  parseResonanceSignature,
  type ResonanceSignature,
} from "./prompts";

function fullText(sentence: string, context: string | null): string {
  const ctx = (context ?? "").trim();
  return ctx ? `${sentence}. ${ctx}` : sentence;
}

/**
 * Extract the hidden resonance signature for a thought.
 */
export async function extractResonanceSignature(
  sentence: string,
  context: string
): Promise<ResonanceSignature> {
  const user = resonanceSignatureUser(sentence, context ?? "");
  const text = await complete(
    llmConfig.provider,
    RESONANCE_SIGNATURE_SYSTEM,
    user
  );
  return parseResonanceSignature(text);
}

/**
 * The current ranker still expects one scalar. Use openness as the primary
 * quality signal, with a small boost for structured resonance detail.
 */
export async function computeQualityScore(
  sentence: string,
  context: string
): Promise<number> {
  const signature = await extractResonanceSignature(sentence, context);
  const structureBonus =
    signature.tensions.length >= 2 || signature.resonance_phrases.length >= 3
      ? 0.1
      : 0;
  return Math.min(1, signature.openness + structureBonus);
}

async function runPipeline(thoughtId: string): Promise<void> {
  const [row] = await db.select().from(thoughts).where(eq(thoughts.id, thoughtId));
  if (!row) throw new Error(`Thought not found: ${thoughtId}`);

  const sentence = row.sentence;
  const context = row.context ?? "";
  const text = fullText(sentence, context);

  const embedding = getEmbeddingService();

  // Surface embedding remains useful for creative-distance scoring.
  const surfaceEmbedding = await embedding.embed(text, "document");

  // Primary resonance embedding is stored in the legacy question column.
  const signature = await extractResonanceSignature(sentence, context);
  const resonanceText = signature.resonance_phrases.join(" ");
  const tensionText = signature.tensions
    .map((tension) => tension.description)
    .join(" ");
  const resonanceSource = [resonanceText, tensionText].filter(Boolean).join(" ");
  const questionEmbedding = await embedding.embed(
    resonanceSource || sentence,
    "document"
  );
  const qualityScore = Math.min(
    1,
    signature.openness + (signature.tensions.length > 1 ? 0.1 : 0)
  );

  await db
    .update(thoughts)
    .set({
      surfaceEmbedding,
      questionEmbedding,
      qualityScore,
    })
    .where(eq(thoughts.id, thoughtId));
}

/**
 * Run the full dual-embedding + quality pipeline for a thought.
 * On failure: retry once; if still failing, store nulls and enqueue for reprocessing.
 */
export async function processNewThought(thoughtId: string): Promise<void> {
  const run = () => runPipeline(thoughtId);
  try {
    await run();
  } catch (first) {
    try {
      await run();
    } catch (second) {
      await db
        .update(thoughts)
        .set({
          surfaceEmbedding: null,
          questionEmbedding: null,
          qualityScore: null,
        })
        .where(eq(thoughts.id, thoughtId));
      await db.insert(failedProcessingJobs).values({
        thoughtId,
        error: second instanceof Error ? second.message : String(second),
        retryCount: 0,
      });
    }
  }
}

/**
 * Backward-compatible export name for callers and docs that still use the
 * older "underlying question" terminology.
 */
export async function extractUnderlyingQuestion(
  sentence: string,
  context: string
): Promise<string> {
  const signature = await extractResonanceSignature(sentence, context);
  return signature.resonance_phrases.join(" ");
}

/**
 * Retry all failed jobs (e.g. run via cron every hour).
 * Handles both 'embedding' and 'image' job types.
 */
export async function reprocessFailedJobs(): Promise<void> {
  const { generateThoughtImageByThoughtId } = await import("../image/service");
  const jobs = await db.select().from(failedProcessingJobs);
  for (const job of jobs) {
    try {
      if (job.jobType === "image") {
        const url = await generateThoughtImageByThoughtId(job.thoughtId);
        if (url == null) {
          await db.delete(failedProcessingJobs).where(eq(failedProcessingJobs.id, job.id));
          continue;
        }
      } else {
        await runPipeline(job.thoughtId);
      }
      await db.delete(failedProcessingJobs).where(eq(failedProcessingJobs.id, job.id));
    } catch {
      await db
        .update(failedProcessingJobs)
        .set({ retryCount: (job.retryCount ?? 0) + 1 })
        .where(eq(failedProcessingJobs.id, job.id));
    }
  }
}
