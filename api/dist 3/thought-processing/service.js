"use strict";
/**
 * ThoughtProcessingService — Phase 3.
 * Resonance signature extraction + compatibility embeddings for new thoughts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractResonanceSignature = extractResonanceSignature;
exports.computeQualityScore = computeQualityScore;
exports.processNewThought = processNewThought;
exports.extractUnderlyingQuestion = extractUnderlyingQuestion;
exports.reprocessFailedJobs = reprocessFailedJobs;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const embedding_1 = require("../embedding");
const feed_1 = require("../feed");
const viewer_profile_1 = require("../feed/viewer-profile");
const llm_1 = require("../llm");
const prompts_1 = require("./prompts");
function fullText(sentence, context) {
    const ctx = (context ?? "").trim();
    return ctx ? `${sentence}. ${ctx}` : sentence;
}
/**
 * Extract the hidden resonance signature for a thought.
 */
async function extractResonanceSignature(sentence, context) {
    const user = (0, prompts_1.resonanceSignatureUser)(sentence, context ?? "");
    const text = await (0, llm_1.complete)(llm_1.llmConfig.provider, prompts_1.RESONANCE_SIGNATURE_SYSTEM, user);
    return (0, prompts_1.parseResonanceSignature)(text);
}
/**
 * The current ranker still expects one scalar. Use openness as the primary
 * quality signal, with a small boost for structured resonance detail.
 */
async function computeQualityScore(sentence, context) {
    const signature = await extractResonanceSignature(sentence, context);
    const structureBonus = signature.tensions.length >= 2 || signature.resonance_phrases.length >= 3
        ? 0.1
        : 0;
    return Math.min(1, signature.openness + structureBonus);
}
async function runPipeline(thoughtId) {
    const [row] = await db_1.db.select().from(db_1.thoughts).where((0, drizzle_orm_1.eq)(db_1.thoughts.id, thoughtId));
    if (!row)
        throw new Error(`Thought not found: ${thoughtId}`);
    const sentence = row.sentence;
    const context = row.context ?? "";
    const text = fullText(sentence, context);
    const embedding = (0, embedding_1.getEmbeddingService)();
    // Surface embedding remains useful for creative-distance scoring.
    const surfaceEmbedding = await embedding.embed(text, "document");
    // Primary resonance embedding is stored in the legacy question column.
    const signature = await extractResonanceSignature(sentence, context);
    const resonanceText = signature.resonance_phrases.join(" ");
    const tensionText = signature.tensions
        .map((tension) => tension.description)
        .join(" ");
    const resonanceSource = [resonanceText, tensionText].filter(Boolean).join(" ");
    const questionEmbedding = await embedding.embed(resonanceSource || sentence, "document");
    const qualityScore = Math.min(1, signature.openness + (signature.tensions.length > 1 ? 0.1 : 0));
    await db_1.db
        .update(db_1.thoughts)
        .set({
        surfaceEmbedding,
        questionEmbedding,
        qualityScore,
    })
        .where((0, drizzle_orm_1.eq)(db_1.thoughts.id, thoughtId));
    await Promise.all([
        (0, viewer_profile_1.invalidateViewerFeedProfile)(row.userId),
        (0, feed_1.invalidateFeedCache)(),
    ]);
}
/**
 * Run the full dual-embedding + quality pipeline for a thought.
 * On failure: retry once; if still failing, store nulls and enqueue for reprocessing.
 */
async function processNewThought(thoughtId) {
    const [thought] = await db_1.db
        .select({ userId: db_1.thoughts.userId })
        .from(db_1.thoughts)
        .where((0, drizzle_orm_1.eq)(db_1.thoughts.id, thoughtId))
        .limit(1);
    const run = () => runPipeline(thoughtId);
    try {
        await run();
    }
    catch (first) {
        try {
            await run();
        }
        catch (second) {
            await db_1.db
                .update(db_1.thoughts)
                .set({
                surfaceEmbedding: null,
                questionEmbedding: null,
                qualityScore: null,
            })
                .where((0, drizzle_orm_1.eq)(db_1.thoughts.id, thoughtId));
            if (thought?.userId) {
                await Promise.all([
                    (0, viewer_profile_1.invalidateViewerFeedProfile)(thought.userId),
                    (0, feed_1.invalidateFeedCache)(),
                ]);
            }
            await db_1.db.insert(db_1.failedProcessingJobs).values({
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
async function extractUnderlyingQuestion(sentence, context) {
    const signature = await extractResonanceSignature(sentence, context);
    return signature.resonance_phrases.join(" ");
}
/**
 * Retry all failed jobs (e.g. run via cron every hour).
 * Handles both 'embedding' and 'image' job types.
 */
async function reprocessFailedJobs() {
    const jobs = await db_1.db.select().from(db_1.failedProcessingJobs);
    for (const job of jobs) {
        try {
            if (job.jobType === "image" || job.jobType === "crossing_image") {
                await db_1.db.delete(db_1.failedProcessingJobs).where((0, drizzle_orm_1.eq)(db_1.failedProcessingJobs.id, job.id));
                continue;
            }
            else {
                await runPipeline(job.thoughtId);
            }
            await db_1.db.delete(db_1.failedProcessingJobs).where((0, drizzle_orm_1.eq)(db_1.failedProcessingJobs.id, job.id));
        }
        catch {
            await db_1.db
                .update(db_1.failedProcessingJobs)
                .set({ retryCount: (job.retryCount ?? 0) + 1 })
                .where((0, drizzle_orm_1.eq)(db_1.failedProcessingJobs.id, job.id));
        }
    }
}
