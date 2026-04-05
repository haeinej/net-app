"use strict";
/**
 * ImageGenerationService — Phase 4.
 * Flux + IP-Adapter thought images; daily cap; cache; persist to S3/R2 or return fal URL.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateThoughtImage = generateThoughtImage;
exports.generateThoughtPreview = generateThoughtPreview;
exports.generateCrossingImage = generateCrossingImage;
exports.generateThoughtImageByThoughtId = generateThoughtImageByThoughtId;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../../db");
const fal_1 = require("./fal");
const storage_1 = require("./storage");
const config_1 = require("./config");
/** Start of today UTC for daily cap */
function startOfTodayUtc() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
}
/** Check daily cap; throw if over. */
async function checkDailyCap(userId) {
    const count = await db_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(db_1.imageGenerations)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.imageGenerations.userId, userId), (0, drizzle_orm_1.gte)(db_1.imageGenerations.createdAt, startOfTodayUtc())));
    const n = count[0]?.count ?? 0;
    if (n >= config_1.imageConfig.dailyCapPerUser) {
        throw new Error(`Daily image generation cap (${config_1.imageConfig.dailyCapPerUser}) reached`);
    }
}
/** Cache: same user + same sentence → existing thought image_url. */
async function getCachedImageUrl(userId, sentence) {
    const rows = await db_1.db
        .select({ imageUrl: db_1.thoughts.imageUrl })
        .from(db_1.thoughts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.thoughts.userId, userId), (0, drizzle_orm_1.eq)(db_1.thoughts.sentence, sentence.trim()), (0, drizzle_orm_1.isNotNull)(db_1.thoughts.imageUrl)))
        .orderBy((0, drizzle_orm_1.desc)(db_1.thoughts.createdAt))
        .limit(1);
    const url = rows[0]?.imageUrl;
    return url && url.length > 0 ? url : null;
}
function metadataFromResult(result) {
    return {
        model: config_1.imageConfig.fluxEndpoint,
        ip_adapter_scale: config_1.imageConfig.ipAdapterScale,
        guidance_scale: config_1.imageConfig.guidanceScale,
        num_inference_steps: config_1.imageConfig.numInferenceSteps,
        fal_request_id: result.requestId,
        seed: result.seed,
        used_ip_adapter: result.usedIpAdapter,
    };
}
/**
 * Generate thought image (sentence + profile photo). Uses cache for same user+sentence.
 * Records daily cap, persists to storage, updates thought. On failure queues retry.
 */
async function generateThoughtImage(thoughtId, userId, sentence, profilePhotoUrl, context) {
    await checkDailyCap(userId);
    const cached = await getCachedImageUrl(userId, sentence);
    if (cached) {
        await db_1.db
            .update(db_1.thoughts)
            .set({ imageUrl: cached })
            .where((0, drizzle_orm_1.eq)(db_1.thoughts.id, thoughtId));
        return cached;
    }
    try {
        const result = await (0, fal_1.generateWithFlux)(sentence, profilePhotoUrl, context);
        const permanentUrl = await (0, storage_1.persistImageUrl)(result.url);
        await db_1.db.insert(db_1.imageGenerations).values({
            userId,
            thoughtId,
        });
        await db_1.db
            .update(db_1.thoughts)
            .set({
            imageUrl: permanentUrl,
            imageMetadata: metadataFromResult(result),
        })
            .where((0, drizzle_orm_1.eq)(db_1.thoughts.id, thoughtId));
        return permanentUrl;
    }
    catch (e) {
        await db_1.db.insert(db_1.failedProcessingJobs).values({
            thoughtId,
            jobType: "image",
            error: e instanceof Error ? e.message : String(e),
            retryCount: 0,
        });
        throw e;
    }
}
async function generateThoughtPreview(sentence, profilePhotoUrl, context) {
    const result = await (0, fal_1.generateWithFlux)(sentence, profilePhotoUrl, context);
    const imageUrl = await (0, storage_1.persistImageUrl)(result.url);
    return {
        imageUrl,
        imageMetadata: metadataFromResult(result),
    };
}
/**
 * Generate crossing image (two profile photos). Two-pass: Flux with photoA then img2img with photoB.
 */
async function generateCrossingImage(sentence, photoUrlA, photoUrlB) {
    const result1 = await (0, fal_1.generateWithFlux)(sentence, photoUrlA);
    const firstUrl = result1.url;
    const result2 = await (0, fal_1.fluxImageToImage)(firstUrl, sentence, photoUrlB);
    return (0, storage_1.persistImageUrl)(result2.url);
}
/**
 * Run image generation for a thought (for reprocessing failed jobs).
 * Call with thoughtId from failed_processing_jobs; fetches thought row for user_id, sentence, and profile photo.
 */
async function generateThoughtImageByThoughtId(thoughtId) {
    const [thought] = await db_1.db
        .select()
        .from(db_1.thoughts)
        .where((0, drizzle_orm_1.eq)(db_1.thoughts.id, thoughtId));
    if (!thought)
        return null;
    const [user] = await db_1.db
        .select({ photoUrl: db_1.users.photoUrl })
        .from(db_1.users)
        .where((0, drizzle_orm_1.eq)(db_1.users.id, thought.userId));
    const photoUrl = user?.photoUrl;
    if (!photoUrl)
        return null;
    return generateThoughtImage(thoughtId, thought.userId, thought.sentence, photoUrl, thought.context);
}
