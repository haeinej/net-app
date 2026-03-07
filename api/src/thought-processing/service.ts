/**
 * ThoughtProcessingService — Phase 3.
 * Dual embeddings + quality score for new thoughts; reprocessing queue on failure.
 */

import { eq } from "drizzle-orm";
import { db, thoughts, failedProcessingJobs } from "../db";
import { getEmbeddingService } from "../embedding";
import { llmConfig, complete } from "../llm";
import {
  EXTRACT_QUESTION_SYSTEM,
  extractQuestionUser,
  QUALITY_SCORE_SYSTEM,
  qualityScoreUser,
  parseQualityScores,
} from "./prompts";

function fullText(sentence: string, context: string | null): string {
  const ctx = (context ?? "").trim();
  return ctx ? `${sentence}. ${ctx}` : sentence;
}

/**
 * Extract 1–2 abstract questions the thought is wrestling with (Step 2).
 */
export async function extractUnderlyingQuestion(
  sentence: string,
  context: string
): Promise<string> {
  const user = extractQuestionUser(sentence, context ?? "");
  return complete(llmConfig.provider, EXTRACT_QUESTION_SYSTEM, user);
}

/**
 * Compute quality score from specificity and openness (Step 3).
 */
export async function computeQualityScore(
  sentence: string,
  context: string
): Promise<number> {
  const user = qualityScoreUser(sentence, context ?? "");
  const text = await complete(llmConfig.provider, QUALITY_SCORE_SYSTEM, user);
  const { specificity, openness } = parseQualityScores(text);
  return specificity * 0.5 + openness * 0.5;
}

async function runPipeline(thoughtId: string): Promise<void> {
  const [row] = await db.select().from(thoughts).where(eq(thoughts.id, thoughtId));
  if (!row) throw new Error(`Thought not found: ${thoughtId}`);

  const sentence = row.sentence;
  const context = row.context ?? "";
  const text = fullText(sentence, context);

  const embedding = getEmbeddingService();

  // Step 1 — surface embedding
  const surfaceEmbedding = await embedding.embed(text, "document");

  // Step 2 — question embedding
  const abstractQuestions = await extractUnderlyingQuestion(sentence, context);
  const questionEmbedding = await embedding.embed(abstractQuestions, "document");

  // Step 3 — quality score
  const qualityScore = await computeQualityScore(sentence, context);

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
