"use strict";
/**
 * RecommendationLearningService (Phase 7). Daily and weekly jobs; lock + log.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDailyLearning = runDailyLearning;
exports.runWeeklyLearning = runWeeklyLearning;
const db_1 = require("../db");
const lock_1 = require("./lock");
const daily_1 = require("./daily");
const weekly_1 = require("./weekly");
const LOCK_ID = "learning-job-runner";
async function log(jobType, details) {
    await db_1.db.insert(db_1.learningLog).values({
        jobType,
        details,
    });
}
/**
 * Daily job: cross-domain affinity, adaptive user weights, temporal resonance.
 * Run at 3am UTC. Idempotent. Uses lock to prevent concurrent runs.
 */
async function runDailyLearning() {
    const got = await (0, lock_1.acquireLock)("daily", LOCK_ID);
    if (!got) {
        return { ok: false, details: { reason: "lock_held" } };
    }
    try {
        const affinity = await (0, daily_1.runCrossDomainAffinity)();
        const weights = await (0, daily_1.runAdaptiveUserWeights)();
        const resonance = await (0, daily_1.runTemporalResonance)();
        const details = { affinity, weights, resonance };
        await log("daily", details);
        return { ok: true, details };
    }
    finally {
        await (0, lock_1.releaseLock)("daily");
    }
}
/**
 * Weekly job: question cluster discovery + cross_cluster_affinity.
 * Run Sunday 4am UTC. Idempotent. Uses lock.
 */
async function runWeeklyLearning() {
    const got = await (0, lock_1.acquireLock)("weekly", LOCK_ID);
    if (!got) {
        return { ok: false, details: { reason: "lock_held" } };
    }
    try {
        const clusters = await (0, weekly_1.runQuestionClusterDiscovery)();
        const crossCluster = await (0, weekly_1.runCrossClusterAffinity)();
        const details = { clusters, cross_cluster_affinity: crossCluster };
        await log("weekly", details);
        return { ok: true, details };
    }
    finally {
        await (0, lock_1.releaseLock)("weekly");
    }
}
