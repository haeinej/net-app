"use strict";
/**
 * Daily learning job (Phase 7): cross-domain affinity, adaptive user weights, temporal resonance.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCrossDomainAffinity = runCrossDomainAffinity;
exports.runAdaptiveUserWeights = runAdaptiveUserWeights;
exports.runTemporalResonance = runTemporalResonance;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const analytics_1 = require("../engagement/analytics");
const config_1 = require("./config");
const embedding_1 = require("../embedding");
const { dailyIncrement, weightMin, weightMax, alphaMin, alphaMax, crossCohortThreshold, crossConcentrationThreshold, freshContentDays, freshContentFraction, minEngagementEventsForWeights, engagementDaysLookback, conversationLookbackHours, highResonanceSimThreshold, highQSimEngagementRate, } = config_1.learningConfig;
/** 1. Cross-domain affinity from conversations (last 24h). */
async function runCrossDomainAffinity() {
    const since = new Date(Date.now() - conversationLookbackHours * 60 * 60 * 1000);
    const rows = await db_1.db
        .select({
        messageCount: db_1.conversations.messageCount,
        thoughtId: db_1.conversations.thoughtId,
        participantA: db_1.conversations.participantA,
        participantB: db_1.conversations.participantB,
    })
        .from(db_1.conversations)
        .where((0, drizzle_orm_1.gte)(db_1.conversations.createdAt, since));
    const thoughtAuthors = await db_1.db
        .select({ id: db_1.thoughts.id, userId: db_1.thoughts.userId })
        .from(db_1.thoughts)
        .where((0, drizzle_orm_1.inArray)(db_1.thoughts.id, rows.map((r) => r.thoughtId)));
    const thoughtAuthorMap = new Map(thoughtAuthors.map((t) => [t.id, t.userId]));
    const userIds = new Set();
    for (const r of rows) {
        userIds.add(r.participantA);
        userIds.add(r.participantB);
        const author = thoughtAuthorMap.get(r.thoughtId);
        if (author)
            userIds.add(author);
    }
    const userRows = await db_1.db
        .select({ id: db_1.users.id, concentration: db_1.users.concentration })
        .from(db_1.users)
        .where((0, drizzle_orm_1.inArray)(db_1.users.id, [...userIds]));
    const userConc = new Map(userRows.map((u) => [u.id, (u.concentration ?? "").trim() || "_"]));
    const keyCounts = new Map();
    function key(a, b) {
        return [a, b].sort().join("\0");
    }
    for (const r of rows) {
        const author = thoughtAuthorMap.get(r.thoughtId);
        if (!author)
            continue;
        const replier = r.participantA === author ? r.participantB : r.participantA;
        const concA = userConc.get(author) ?? "_";
        const concB = userConc.get(replier) ?? "_";
        const k = key(concA, concB);
        const msg = r.messageCount ?? 0;
        const entry = keyCounts.get(k) ?? { total: 0, sustained: 0, depthSum: 0 };
        entry.total += 1;
        if (msg >= 10)
            entry.sustained += 1;
        entry.depthSum += msg;
        keyCounts.set(k, entry);
    }
    const upserted = [];
    for (const [k, v] of keyCounts) {
        const [concentrationA, concentrationB] = k.split("\0");
        const sustainRate = v.total > 0 ? v.sustained / v.total : 0;
        const avgDepth = v.total > 0 ? v.depthSum / v.total : 0;
        await db_1.db
            .insert(db_1.crossDomainAffinity)
            .values({
            concentrationA,
            concentrationB,
            totalConversations: v.total,
            sustainedConversations: v.sustained,
            sustainRate,
            avgDepth,
            updatedAt: new Date(),
        })
            .onConflictDoUpdate({
            target: [db_1.crossDomainAffinity.concentrationA, db_1.crossDomainAffinity.concentrationB],
            set: {
                totalConversations: v.total,
                sustainedConversations: v.sustained,
                sustainRate,
                avgDepth,
                updatedAt: new Date(),
            },
        });
        upserted.push(k);
    }
    return { cross_domain_affinity_rows: upserted.length };
}
/** 2. Adaptive user weights from engagement profile. */
async function runAdaptiveUserWeights() {
    const since = new Date(Date.now() - engagementDaysLookback * 24 * 60 * 60 * 1000);
    const active = await db_1.db
        .select({ userId: db_1.engagementEvents.userId, count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(db_1.engagementEvents)
        .where((0, drizzle_orm_1.gte)(db_1.engagementEvents.createdAt, since))
        .groupBy(db_1.engagementEvents.userId);
    const eligible = active.filter((r) => (r.count ?? 0) >= minEngagementEventsForWeights).map((r) => r.userId);
    if (eligible.length === 0)
        return { users_updated: 0 };
    const weightChanges = [];
    for (const userId of eligible) {
        const profile = await (0, analytics_1.getUserEngagementProfile)(userId);
        const [existing] = await db_1.db
            .select()
            .from(db_1.userRecommendationWeights)
            .where((0, drizzle_orm_1.eq)(db_1.userRecommendationWeights.userId, userId));
        let q = existing?.qWeight ?? 0.4;
        let d = existing?.dWeight ?? 0.25;
        let f = existing?.fWeight ?? 0.2;
        let r = existing?.rWeight ?? 0.15;
        let alpha = existing?.alpha ?? 0.3;
        if (profile.cross_cohort_reply_rate > crossCohortThreshold)
            d += dailyIncrement;
        if (profile.cross_concentration_reply_rate > crossConcentrationThreshold)
            alpha += dailyIncrement;
        // Rule: fresh content engagement fraction
        const userEvents = await db_1.db
            .select({ thoughtId: db_1.engagementEvents.thoughtId })
            .from(db_1.engagementEvents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.engagementEvents.userId, userId), (0, drizzle_orm_1.gte)(db_1.engagementEvents.createdAt, since)));
        const engagedThoughtIds = [...new Set(userEvents.map((e) => e.thoughtId))];
        if (engagedThoughtIds.length > 0) {
            const freshCutoff = new Date(Date.now() - freshContentDays * 24 * 60 * 60 * 1000);
            const freshThoughts = await db_1.db
                .select({ id: db_1.thoughts.id })
                .from(db_1.thoughts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(db_1.thoughts.id, engagedThoughtIds), (0, drizzle_orm_1.gte)(db_1.thoughts.createdAt, freshCutoff)));
            const freshIds = new Set(freshThoughts.map((t) => t.id));
            const freshCount = userEvents.filter((e) => freshIds.has(e.thoughtId)).length;
            const freshEngagementFraction = userEvents.length > 0 ? freshCount / userEvents.length : 0;
            if (freshEngagementFraction > freshContentFraction)
                f += dailyIncrement;
        }
        // Rule: high resonance similarity engagement
        const viewerThoughtRows = await db_1.db
            .select({ questionEmbedding: db_1.thoughts.questionEmbedding })
            .from(db_1.thoughts)
            .where((0, drizzle_orm_1.eq)(db_1.thoughts.userId, userId));
        const viewerEmbeddings = viewerThoughtRows
            .filter((t) => Array.isArray(t.questionEmbedding))
            .map((t) => t.questionEmbedding);
        if (viewerEmbeddings.length > 0 && engagedThoughtIds.length > 0) {
            const engagedThoughts = await db_1.db
                .select({ questionEmbedding: db_1.thoughts.questionEmbedding })
                .from(db_1.thoughts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(db_1.thoughts.id, engagedThoughtIds), (0, drizzle_orm_1.sql) `${db_1.thoughts.questionEmbedding} IS NOT NULL`));
            let highSimCount = 0;
            for (const engaged of engagedThoughts) {
                const engVec = engaged.questionEmbedding;
                let maxSim = 0;
                for (const viewerVec of viewerEmbeddings) {
                    if (viewerVec.length !== engVec.length)
                        continue;
                    const sim = (0, embedding_1.cosineSimilarity)(viewerVec, engVec);
                    if (sim > maxSim)
                        maxSim = sim;
                }
                if (maxSim > highResonanceSimThreshold)
                    highSimCount++;
            }
            if (engagedThoughts.length > 0 && highSimCount / engagedThoughts.length > highQSimEngagementRate) {
                q += dailyIncrement;
            }
        }
        q = Math.max(weightMin, Math.min(weightMax, q));
        d = Math.max(weightMin, Math.min(weightMax, d));
        f = Math.max(weightMin, Math.min(weightMax, f));
        r = Math.max(weightMin, Math.min(weightMax, r));
        alpha = Math.max(alphaMin, Math.min(alphaMax, alpha));
        const sum = q + d + f + r;
        q /= sum;
        d /= sum;
        f /= sum;
        r /= sum;
        await db_1.db
            .insert(db_1.userRecommendationWeights)
            .values({
            userId,
            qWeight: q,
            dWeight: d,
            fWeight: f,
            rWeight: r,
            alpha,
            updatedAt: new Date(),
        })
            .onConflictDoUpdate({
            target: db_1.userRecommendationWeights.userId,
            set: {
                qWeight: q,
                dWeight: d,
                fWeight: f,
                rWeight: r,
                alpha,
                updatedAt: new Date(),
            },
        });
        weightChanges.push({
            userId,
            changes: { qWeight: q, dWeight: d, fWeight: f, rWeight: r, alpha },
        });
    }
    return { users_updated: weightChanges.length, weight_changes: weightChanges };
}
/** 3. Temporal resonance: sustain_rate by cohort_distance; store in system_config. */
async function runTemporalResonance() {
    const convRows = await db_1.db
        .select({
        messageCount: db_1.conversations.messageCount,
        participantA: db_1.conversations.participantA,
        participantB: db_1.conversations.participantB,
    })
        .from(db_1.conversations);
    const userIds = new Set();
    for (const r of convRows) {
        userIds.add(r.participantA);
        userIds.add(r.participantB);
    }
    const userRows = await db_1.db
        .select({ id: db_1.users.id, cohortYear: db_1.users.cohortYear })
        .from(db_1.users)
        .where((0, drizzle_orm_1.inArray)(db_1.users.id, [...userIds]));
    const cohortByUser = new Map(userRows.map((u) => [u.id, u.cohortYear]));
    const byDistance = new Map();
    for (const r of convRows) {
        const ca = cohortByUser.get(r.participantA);
        const cb = cohortByUser.get(r.participantB);
        if (ca == null || cb == null)
            continue;
        const dist = Math.abs(ca - cb);
        const entry = byDistance.get(dist) ?? { total: 0, sustained: 0, depthSum: 0 };
        entry.total += 1;
        if ((r.messageCount ?? 0) >= 10)
            entry.sustained += 1;
        entry.depthSum += r.messageCount ?? 0;
        byDistance.set(dist, entry);
    }
    const result = Array.from(byDistance.entries()).map(([cohort_distance, v]) => ({
        cohort_distance,
        total: v.total,
        sustained: v.sustained,
        sustain_rate: v.total > 0 ? v.sustained / v.total : 0,
        avg_depth: v.total > 0 ? v.depthSum / v.total : 0,
    }));
    await db_1.db
        .insert(db_1.systemConfig)
        .values({
        key: "temporal_resonance",
        value: { by_distance: result },
        updatedAt: new Date(),
    })
        .onConflictDoUpdate({
        target: db_1.systemConfig.key,
        set: { value: { by_distance: result }, updatedAt: new Date() },
    });
    return { temporal_resonance: result };
}
