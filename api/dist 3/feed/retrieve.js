"use strict";
/**
 * Layer 1 — RETRIEVE: pgvector candidate retrieval (Phase 5).
 * Three-bucket system: Resonance Matches / Adjacent Territory / Wild Cards.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVisibleRecentCandidates = getVisibleRecentCandidates;
exports.getOwnRecentCandidates = getOwnRecentCandidates;
exports.getCandidates = getCandidates;
exports.getBucketedCandidates = getBucketedCandidates;
const drizzle_orm_1 = require("drizzle-orm");
const drizzle_orm_2 = require("drizzle-orm");
const db_1 = require("../db");
const config_1 = require("./config");
const score_1 = require("./score");
const candidateSelect = {
    id: db_1.thoughts.id,
    userId: db_1.thoughts.userId,
    sentence: db_1.thoughts.sentence,
    context: db_1.thoughts.context,
    photoUrl: db_1.thoughts.photoUrl,
    imageUrl: db_1.thoughts.imageUrl,
    surfaceEmbedding: db_1.thoughts.surfaceEmbedding,
    questionEmbedding: db_1.thoughts.questionEmbedding,
    qualityScore: db_1.thoughts.qualityScore,
    createdAt: db_1.thoughts.createdAt,
    clusterId: db_1.thoughts.clusterId,
    authorCohortYear: db_1.users.cohortYear,
    authorConcentration: db_1.users.concentration,
};
/** Map DB row to ThoughtCandidate (embeddings as number[] from driver). */
function toCandidate(row) {
    return {
        id: row.id,
        userId: row.userId,
        sentence: row.sentence,
        context: row.context,
        photoUrl: row.photoUrl,
        imageUrl: row.imageUrl,
        surfaceEmbedding: Array.isArray(row.surfaceEmbedding) ? row.surfaceEmbedding : null,
        resonanceEmbedding: Array.isArray(row.questionEmbedding)
            ? row.questionEmbedding
            : null,
        qualityScore: row.qualityScore,
        createdAt: row.createdAt ?? new Date(),
        authorCohortYear: row.authorCohortYear,
        authorConcentration: row.authorConcentration,
        clusterId: row.clusterId ?? null,
    };
}
function stableShuffleScore(viewerId, thoughtId, dayKey) {
    const input = `${viewerId}:${thoughtId}:${dayKey}`;
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
/** 50 most recent thoughts (excluding viewer). */
async function getRecentCandidates(viewerId, config = config_1.feedConfig) {
    const rows = await db_1.db
        .select(candidateSelect)
        .from(db_1.thoughts)
        .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.thoughts.userId, db_1.users.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.ne)(db_1.thoughts.userId, viewerId), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt)))
        .orderBy((0, drizzle_orm_1.desc)(db_1.thoughts.createdAt))
        .limit(config.recentLimit);
    return rows.map(toCandidate);
}
/** k nearest thoughts by resonance embedding to a single vector (excluding viewer). */
async function getNearestByResonance(viewerId, queryEmbedding, k) {
    const rows = await db_1.db
        .select(candidateSelect)
        .from(db_1.thoughts)
        .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.thoughts.userId, db_1.users.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.ne)(db_1.thoughts.userId, viewerId), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt), (0, drizzle_orm_1.sql) `${db_1.thoughts.questionEmbedding} IS NOT NULL`))
        .orderBy((0, drizzle_orm_2.cosineDistance)(db_1.thoughts.questionEmbedding, queryEmbedding))
        .limit(k);
    return rows.map(toCandidate);
}
/** k nearest thoughts by surface_embedding (excluding viewer). */
async function getNearestBySurface(viewerId, queryEmbedding, k) {
    const rows = await db_1.db
        .select(candidateSelect)
        .from(db_1.thoughts)
        .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.thoughts.userId, db_1.users.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.ne)(db_1.thoughts.userId, viewerId), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt), (0, drizzle_orm_1.sql) `${db_1.thoughts.surfaceEmbedding} IS NOT NULL`))
        .orderBy((0, drizzle_orm_2.cosineDistance)(db_1.thoughts.surfaceEmbedding, queryEmbedding))
        .limit(k);
    return rows.map(toCandidate);
}
/** Random quality-filtered thoughts for wild card pool. */
async function getRandomCandidates(viewerId, excludeIds, limit, config = config_1.feedConfig) {
    const { thoughtActiveDays, thoughtSleepTransitionDays, wildcardMinQuality } = config;
    const maxAgeDays = thoughtActiveDays + thoughtSleepTransitionDays;
    const excludeArr = [...excludeIds];
    const poolLimit = Math.max(limit * 6, 120);
    const dayKey = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const conditions = [
        (0, drizzle_orm_1.ne)(db_1.thoughts.userId, viewerId),
        (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt),
        (0, drizzle_orm_1.sql) `${db_1.thoughts.qualityScore} >= ${wildcardMinQuality}`,
        (0, drizzle_orm_1.sql) `${db_1.thoughts.createdAt} > now() - interval '${drizzle_orm_1.sql.raw(String(maxAgeDays))} days'`,
    ];
    if (excludeArr.length > 0) {
        const limited = excludeArr.slice(0, 200);
        conditions.push((0, drizzle_orm_1.notInArray)(db_1.thoughts.id, limited));
    }
    const rows = await db_1.db
        .select(candidateSelect)
        .from(db_1.thoughts)
        .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.thoughts.userId, db_1.users.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(db_1.thoughts.createdAt))
        .limit(poolLimit);
    return rows
        .map((row) => ({
        score: stableShuffleScore(viewerId, row.id, dayKey),
        candidate: toCandidate(row),
    }))
        .sort((a, b) => a.score - b.score)
        .slice(0, limit)
        .map((row) => row.candidate);
}
async function getVisibleRecentCandidates(viewerId, excludeIds, limit, blockedUserIds = new Set()) {
    if (limit <= 0)
        return [];
    const conditions = [(0, drizzle_orm_1.ne)(db_1.thoughts.userId, viewerId), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt)];
    const excludeArr = [...excludeIds];
    const blockedArr = [...blockedUserIds];
    if (excludeArr.length > 0) {
        conditions.push((0, drizzle_orm_1.notInArray)(db_1.thoughts.id, excludeArr.slice(0, 200)));
    }
    if (blockedArr.length > 0) {
        conditions.push((0, drizzle_orm_1.notInArray)(db_1.thoughts.userId, blockedArr.slice(0, 200)));
    }
    const rows = await db_1.db
        .select(candidateSelect)
        .from(db_1.thoughts)
        .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.thoughts.userId, db_1.users.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(db_1.thoughts.createdAt))
        .limit(limit);
    return rows.map(toCandidate);
}
async function getOwnRecentCandidates(viewerId, excludeIds, limit) {
    if (limit <= 0)
        return [];
    const conditions = [(0, drizzle_orm_1.eq)(db_1.thoughts.userId, viewerId), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt)];
    const excludeArr = [...excludeIds];
    if (excludeArr.length > 0) {
        conditions.push((0, drizzle_orm_1.notInArray)(db_1.thoughts.id, excludeArr.slice(0, 200)));
    }
    const rows = await db_1.db
        .select(candidateSelect)
        .from(db_1.thoughts)
        .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.thoughts.userId, db_1.users.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(db_1.thoughts.createdAt))
        .limit(limit);
    return rows.map(toCandidate);
}
/** Determine user stage from accepted conversation count. */
async function getUserStage(viewerId, config = config_1.feedConfig) {
    const { stageThresholds } = config;
    const [result] = await db_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(db_1.conversations)
        .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.conversations.participantA, viewerId), (0, drizzle_orm_1.eq)(db_1.conversations.participantB, viewerId)));
    const count = result?.count ?? 0;
    if (count <= stageThresholds.new)
        return "new";
    if (count <= stageThresholds.building)
        return "building";
    if (count <= stageThresholds.established)
        return "established";
    return "wanderer";
}
/** Get IDs of users the viewer has active conversations with. */
async function getActiveConversationUserIds(viewerId) {
    const rows = await db_1.db
        .select({
        participantA: db_1.conversations.participantA,
        participantB: db_1.conversations.participantB,
    })
        .from(db_1.conversations)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.conversations.participantA, viewerId), (0, drizzle_orm_1.eq)(db_1.conversations.participantB, viewerId)), (0, drizzle_orm_1.eq)(db_1.conversations.isDormant, false)));
    const ids = new Set();
    for (const r of rows) {
        if (r.participantA !== viewerId)
            ids.add(r.participantA);
        if (r.participantB !== viewerId)
            ids.add(r.participantB);
    }
    return ids;
}
/**
 * Layer 1 (legacy): flat candidate retrieval. Kept for backward compat.
 * Uses a single averaged resonance embedding for the viewer to avoid per-thought kNN queries.
 */
async function getCandidates(viewerId, limit = config_1.feedConfig.candidateLimit, config = config_1.feedConfig) {
    const recent = await getRecentCandidates(viewerId, config);
    const viewerThoughts = await db_1.db
        .select({
        resonanceEmbedding: db_1.thoughts.questionEmbedding,
        surfaceEmbedding: db_1.thoughts.surfaceEmbedding,
    })
        .from(db_1.thoughts)
        .where((0, drizzle_orm_1.eq)(db_1.thoughts.userId, viewerId));
    const resonanceVecs = viewerThoughts
        .map((t) => Array.isArray(t.resonanceEmbedding)
        ? t.resonanceEmbedding
        : null)
        .filter((v) => v != null);
    const hasViewerThoughts = resonanceVecs.length > 0;
    const bySimilarity = [];
    if (hasViewerThoughts) {
        const dim = resonanceVecs[0].length;
        const sum = new Array(dim).fill(0);
        for (const v of resonanceVecs) {
            for (let i = 0; i < dim; i++)
                sum[i] += v[i];
        }
        const avg = sum.map((x) => x / resonanceVecs.length);
        const batch = await getNearestByResonance(viewerId, avg, limit);
        bySimilarity.push(...batch);
    }
    const bySimilarityIds = new Set(bySimilarity.map((c) => c.id));
    for (const c of recent) {
        if (!bySimilarityIds.has(c.id))
            bySimilarity.push(c);
    }
    return bySimilarity.slice(0, limit);
}
/**
 * Three-bucket candidate retrieval.
 * 1. Determine user stage → bucket ratios
 * 2. Pre-filter: exclude active-conversation users, sleeping thoughts
 * 3. Retrieve pool via resonance kNN + recent
 * 4. Assign buckets by resonance similarity + surface distance
 * 5. Fill wild cards from random quality-filtered pool
 */
async function getBucketedCandidates(viewerId, viewerEmbeddings, limit = config_1.feedConfig.candidateLimit, config = config_1.feedConfig) {
    const stage = await getUserStage(viewerId, config);
    const activeConvUserIds = await getActiveConversationUserIds(viewerId);
    // Retrieve flat candidate pool (reuse existing logic)
    const recent = await getRecentCandidates(viewerId, config);
    const bySimilarity = [];
    const primaryResonanceEmbedding = viewerEmbeddings.resonanceEmbeddings[0] ?? null;
    const hasViewerThoughts = Boolean(primaryResonanceEmbedding);
    if (hasViewerThoughts) {
        const batch = await getNearestByResonance(viewerId, primaryResonanceEmbedding, limit);
        bySimilarity.push(...batch);
    }
    // Merge similarity + recent, deduplicate
    const allIds = new Set(bySimilarity.map((c) => c.id));
    for (const c of recent) {
        if (!allIds.has(c.id)) {
            allIds.add(c.id);
            bySimilarity.push(c);
        }
    }
    // Pre-filter: remove thoughts from users with active conversations
    const { thoughtActiveDays, thoughtSleepTransitionDays } = config;
    const maxAgeMs = (thoughtActiveDays + thoughtSleepTransitionDays) * 24 * 60 * 60 * 1000;
    const pool = bySimilarity.filter((c) => {
        if (activeConvUserIds.has(c.userId))
            return false;
        // Filter sleeping thoughts (older than active + transition period)
        const ageMs = Date.now() - c.createdAt.getTime();
        if (ageMs > maxAgeMs)
            return false;
        return true;
    });
    // Compute similarities for bucket assignment
    const { resonanceTopFraction, adjacentMinResonance, adjacentMinSurfaceDistance, wildcardMinQuality, } = config;
    const scored = pool.map((thought) => {
        const { resonance_similarity, surface_similarity } = (0, score_1.getSimilarities)(thought, viewerEmbeddings);
        return { thought, resonanceSim: resonance_similarity, surfaceDistance: 1 - surface_similarity };
    });
    // Sort by resonance similarity descending for bucket assignment
    scored.sort((a, b) => b.resonanceSim - a.resonanceSim);
    const bucket1 = [];
    const bucket2 = [];
    const remaining = [];
    if (!hasViewerThoughts) {
        // New user: all go to bucket 1 (no resonance signal to differentiate)
        for (const s of scored) {
            bucket1.push({ thought: s.thought, bucket: "resonance" });
        }
    }
    else {
        const cutoffIndex = Math.max(1, Math.ceil(scored.length * resonanceTopFraction));
        for (let i = 0; i < scored.length; i++) {
            const s = scored[i];
            if (i < cutoffIndex) {
                bucket1.push({ thought: s.thought, bucket: "resonance" });
            }
            else if (s.resonanceSim >= adjacentMinResonance && s.surfaceDistance >= adjacentMinSurfaceDistance) {
                bucket2.push({ thought: s.thought, bucket: "adjacent" });
            }
            else {
                remaining.push(s.thought);
            }
        }
    }
    // Bucket 3: wild cards from remaining + random DB query
    const ratios = config.bucketRatios[stage];
    const wildcardTarget = Math.max(1, Math.ceil(limit * ratios.wildcard));
    const bucket1And2Ids = new Set([
        ...bucket1.map((c) => c.thought.id),
        ...bucket2.map((c) => c.thought.id),
    ]);
    // Use remaining candidates that pass quality filter
    const bucket3 = [];
    for (const t of remaining) {
        if (bucket3.length >= wildcardTarget)
            break;
        if ((t.qualityScore ?? 0) >= wildcardMinQuality) {
            bucket3.push({ thought: t, bucket: "wildcard" });
        }
    }
    // If not enough wild cards from remaining, fetch random from DB
    if (bucket3.length < wildcardTarget) {
        const needed = wildcardTarget - bucket3.length;
        const allExclude = new Set([...bucket1And2Ids, ...bucket3.map((c) => c.thought.id)]);
        const random = await getRandomCandidates(viewerId, allExclude, needed, config);
        for (const t of random) {
            if (!activeConvUserIds.has(t.userId)) {
                bucket3.push({ thought: t, bucket: "wildcard" });
            }
        }
    }
    const candidates = [...bucket1, ...bucket2, ...bucket3];
    return { candidates, stage };
}
