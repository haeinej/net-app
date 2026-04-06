"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rebuildViewerFeedProfile = rebuildViewerFeedProfile;
exports.loadViewerFeedProfile = loadViewerFeedProfile;
exports.invalidateViewerFeedProfile = invalidateViewerFeedProfile;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const RECENT_CLUSTER_LIMIT = 12;
function isVector(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === "number");
}
function computeCentroid(vectors) {
    if (vectors.length === 0)
        return null;
    const dims = vectors[0]?.length ?? 0;
    if (dims === 0)
        return null;
    const sum = new Array(dims).fill(0);
    for (const vector of vectors) {
        if (vector.length !== dims)
            continue;
        for (let i = 0; i < dims; i++) {
            sum[i] += vector[i] ?? 0;
        }
    }
    return sum.map((value) => value / vectors.length);
}
function toStoredProfile(row) {
    const resonance = isVector(row?.resonanceCentroid) ? [row.resonanceCentroid] : [];
    const surface = isVector(row?.surfaceCentroid) ? [row.surfaceCentroid] : [];
    return {
        embeddings: {
            resonanceEmbeddings: resonance,
            surfaceEmbeddings: surface,
            interestsEmbedding: null,
        },
        viewerClusterIds: Array.isArray(row?.recentClusterIds)
            ? row.recentClusterIds.filter((clusterId) => typeof clusterId === "string")
            : [],
        embeddedThoughtCount: row?.embeddedThoughtCount ?? 0,
    };
}
async function rebuildViewerFeedProfile(userId) {
    const rows = await db_1.db
        .select({
        resonanceEmbedding: db_1.thoughts.questionEmbedding,
        surfaceEmbedding: db_1.thoughts.surfaceEmbedding,
        clusterId: db_1.thoughts.clusterId,
    })
        .from(db_1.thoughts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.thoughts.userId, userId), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt)))
        .orderBy((0, drizzle_orm_1.desc)(db_1.thoughts.createdAt));
    const resonanceVectors = [];
    const surfaceVectors = [];
    const recentClusterIds = [];
    for (const row of rows) {
        if (isVector(row.resonanceEmbedding))
            resonanceVectors.push(row.resonanceEmbedding);
        if (isVector(row.surfaceEmbedding))
            surfaceVectors.push(row.surfaceEmbedding);
        if (row.clusterId &&
            !recentClusterIds.includes(row.clusterId) &&
            recentClusterIds.length < RECENT_CLUSTER_LIMIT) {
            recentClusterIds.push(row.clusterId);
        }
    }
    const resonanceCentroid = computeCentroid(resonanceVectors);
    const surfaceCentroid = computeCentroid(surfaceVectors);
    const embeddedThoughtCount = rows.filter((row) => isVector(row.resonanceEmbedding) || isVector(row.surfaceEmbedding)).length;
    await db_1.db
        .insert(db_1.userFeedProfiles)
        .values({
        userId,
        resonanceCentroid,
        surfaceCentroid,
        recentClusterIds,
        embeddedThoughtCount,
        updatedAt: new Date(),
    })
        .onConflictDoUpdate({
        target: db_1.userFeedProfiles.userId,
        set: {
            resonanceCentroid,
            surfaceCentroid,
            recentClusterIds,
            embeddedThoughtCount,
            updatedAt: new Date(),
        },
    });
    return {
        embeddings: {
            resonanceEmbeddings: resonanceCentroid ? [resonanceCentroid] : [],
            surfaceEmbeddings: surfaceCentroid ? [surfaceCentroid] : [],
            interestsEmbedding: null,
        },
        viewerClusterIds: recentClusterIds,
        embeddedThoughtCount,
    };
}
async function loadViewerFeedProfile(userId) {
    const row = await db_1.db
        .select()
        .from(db_1.userFeedProfiles)
        .where((0, drizzle_orm_1.eq)(db_1.userFeedProfiles.userId, userId))
        .then((rows) => rows[0]);
    if (!row) {
        return rebuildViewerFeedProfile(userId);
    }
    return toStoredProfile(row);
}
async function invalidateViewerFeedProfile(userId) {
    if (!userId) {
        await db_1.db.delete(db_1.userFeedProfiles);
        return;
    }
    await db_1.db.delete(db_1.userFeedProfiles).where((0, drizzle_orm_1.eq)(db_1.userFeedProfiles.userId, userId));
}
