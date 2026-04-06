"use strict";
/**
 * Layer 3 — RANK: diversity, freshness, reply quality; post-ranking enforcement (Phase 5).
 * Now wires in learning outputs: cross_domain_affinity, temporal_resonance, cross_cluster_affinity.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCrossDomainAffinityMap = loadCrossDomainAffinityMap;
exports.loadTemporalResonanceMap = loadTemporalResonanceMap;
exports.loadClusterAffinityMap = loadClusterAffinityMap;
exports.buildReplyQualityMap = buildReplyQualityMap;
exports.rankScorePhase1 = rankScorePhase1;
exports.rankScorePhase2 = rankScorePhase2;
exports.rankScorePhase2WithDebug = rankScorePhase2WithDebug;
exports.applyDiversityEnforcement = applyDiversityEnforcement;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const config_1 = require("./config");
// Simple in-process caches with TTL to avoid reloading learning maps on every feed request
const LEARNING_TTL_MS = 5 * 60 * 1000; // 5 minutes
let crossDomainCache = null;
let temporalResonanceCache = null;
let clusterAffinityCache = null;
/** Load cross-domain affinity sustainRates. Key = sorted concentration pair. */
async function loadCrossDomainAffinityMap() {
    const now = Date.now();
    if (crossDomainCache && crossDomainCache.expiresAt > now) {
        return crossDomainCache.map;
    }
    const rows = await db_1.db.select().from(db_1.crossDomainAffinity);
    const map = new Map();
    for (const r of rows) {
        const key = [r.concentrationA, r.concentrationB].sort().join("\0");
        map.set(key, r.sustainRate ?? 0);
    }
    crossDomainCache = { map, expiresAt: now + LEARNING_TTL_MS };
    return map;
}
/** Load temporal resonance: cohort_distance → sustainRate from system_config. */
async function loadTemporalResonanceMap() {
    const now = Date.now();
    if (temporalResonanceCache && temporalResonanceCache.expiresAt > now) {
        return temporalResonanceCache.map;
    }
    const [row] = await db_1.db.select().from(db_1.systemConfig).where((0, drizzle_orm_1.eq)(db_1.systemConfig.key, "temporal_resonance"));
    const map = new Map();
    if (row?.value) {
        const val = row.value;
        if (Array.isArray(val.by_distance)) {
            for (const entry of val.by_distance) {
                map.set(entry.cohort_distance, entry.sustain_rate);
            }
        }
    }
    temporalResonanceCache = { map, expiresAt: now + LEARNING_TTL_MS };
    return map;
}
/** Load cross-cluster affinity sustainRates. Key = sorted cluster ID pair. */
async function loadClusterAffinityMap() {
    const now = Date.now();
    if (clusterAffinityCache && clusterAffinityCache.expiresAt > now) {
        return clusterAffinityCache.map;
    }
    const rows = await db_1.db.select().from(db_1.crossClusterAffinity);
    const map = new Map();
    for (const r of rows) {
        const key = [r.clusterAId, r.clusterBId].sort().join("\0");
        map.set(key, r.sustainRate ?? 0);
    }
    clusterAffinityCache = { map, expiresAt: now + LEARNING_TTL_MS };
    return map;
}
// ——— Scoring Functions ———
/**
 * Piecewise freshness: full boost first 6h, linear decay 6-48h, residual after.
 */
function freshnessScore(createdAt, config = config_1.feedConfig) {
    const { freshnessFullBoostHours, freshnessDecayEndHours, freshnessResidual, } = config;
    const hours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    if (hours <= freshnessFullBoostHours)
        return 1.0;
    if (hours <= freshnessDecayEndHours) {
        const span = freshnessDecayEndHours - freshnessFullBoostHours;
        return 1.0 - ((hours - freshnessFullBoostHours) / span) * (1.0 - freshnessResidual);
    }
    return freshnessResidual;
}
function cohortDiversityBonus(thought, viewer) {
    const v = viewer.cohortYear ?? 0;
    const t = thought.authorCohortYear ?? 0;
    if (v === 0 && t === 0)
        return 0.5;
    if (v === t)
        return 0.3;
    return 1.0;
}
/** Cohort distance with temporal resonance data when available. */
function cohortDistance(thought, viewer, resonanceMap) {
    const v = viewer.cohortYear ?? 0;
    const t = thought.authorCohortYear ?? 0;
    const dist = Math.abs(t - v);
    if (resonanceMap && resonanceMap.size > 0) {
        const sustainRate = resonanceMap.get(dist);
        if (sustainRate != null)
            return sustainRate;
    }
    return Math.min(dist / 3, 1);
}
/** Concentration diff with cross-domain affinity data when available. */
function concentrationDiff(thought, viewer, affinityMap) {
    const v = (viewer.concentration ?? "").trim();
    const t = (thought.authorConcentration ?? "").trim();
    if (!v || !t)
        return 0.5;
    if (v.toLowerCase() === t.toLowerCase())
        return 0.3;
    if (affinityMap && affinityMap.size > 0) {
        const key = [v.toLowerCase(), t.toLowerCase()].sort().join("\0");
        const sustainRate = affinityMap.get(key);
        if (sustainRate != null)
            return 0.5 + sustainRate * 0.5;
    }
    return 1.0;
}
/** Cluster novelty from cross-cluster affinity. Uses viewer's cluster IDs if available. */
function clusterNoveltyScore(thought, viewerClusterIds, clusterAffinityMap) {
    if (!thought.clusterId || viewerClusterIds.length === 0 || !clusterAffinityMap || clusterAffinityMap.size === 0) {
        return 0.5;
    }
    let maxAffinity = 0;
    for (const viewerCluster of viewerClusterIds) {
        if (viewerCluster === thought.clusterId)
            return 0.3; // same cluster = less novel
        const key = [viewerCluster, thought.clusterId].sort().join("\0");
        const affinity = clusterAffinityMap.get(key);
        if (affinity != null && affinity > maxAffinity)
            maxAffinity = affinity;
    }
    // Higher cross-cluster affinity = proven interesting pairing = higher novelty score
    return maxAffinity > 0 ? 0.5 + maxAffinity * 0.5 : 0.5;
}
/**
 * Build reply quality scores in batch for a set of thought IDs.
 *
 * This now reads from materialized `thought_feed_stats` rows:
 *   - accepted_reply_count
 *   - cross_domain_accepted_reply_count
 *   - sustained_conversation_count
 *   - max_conversation_depth
 *
 * R ~ 0.3 base + 0.4 if any sustained conversation (>=10 msgs)
 *   + up to 0.3 from cross-domain ratio.
 */
async function buildReplyQualityMap(thoughtIds, authorConcentrationByThought) {
    const map = new Map();
    if (thoughtIds.length === 0)
        return map;
    const rows = thoughtIds.length > 0
        ? await db_1.db
            .select({
            thoughtId: db_1.thoughtFeedStats.thoughtId,
            acceptedReplyCount: db_1.thoughtFeedStats.acceptedReplyCount,
            crossDomainAcceptedReplyCount: db_1.thoughtFeedStats.crossDomainAcceptedReplyCount,
            sustainedConversationCount: db_1.thoughtFeedStats.sustainedConversationCount,
            maxConversationDepth: db_1.thoughtFeedStats.maxConversationDepth,
        })
            .from(db_1.thoughtFeedStats)
            .where((0, drizzle_orm_1.inArray)(db_1.thoughtFeedStats.thoughtId, thoughtIds))
        : [];
    const byThought = new Map(rows.map((r) => [r.thoughtId, r]));
    for (const thoughtId of thoughtIds) {
        const row = byThought.get(thoughtId);
        if (!row) {
            map.set(thoughtId, 0.5);
            continue;
        }
        const accepted = row.acceptedReplyCount ?? 0;
        if (accepted === 0) {
            map.set(thoughtId, 0.5);
            continue;
        }
        let r = 0.3;
        if ((row.sustainedConversationCount ?? 0) > 0 || (row.maxConversationDepth ?? 0) >= 10) {
            r += 0.4;
        }
        const crossDomainAccepted = row.crossDomainAcceptedReplyCount ?? 0;
        if (accepted > 0 && crossDomainAccepted > 0) {
            const crossDomainRatio = Math.min(1, crossDomainAccepted / accepted);
            r += crossDomainRatio * 0.3;
        }
        map.set(thoughtId, Math.min(1, r));
    }
    return map;
}
/** Phase 1 rank: freshness × 0.5 + quality × 0.3 + cohort_diversity × 0.2 */
function rankScorePhase1(thought, viewer, layer2Score, config = config_1.feedConfig) {
    const f = freshnessScore(thought.createdAt, config);
    const q = Math.min(1, thought.qualityScore ?? 0.5);
    const d = cohortDiversityBonus(thought, viewer);
    return f * 0.5 + q * 0.3 + d * 0.2;
}
/** Phase 2 rank: (Q×w1) + (D×w2) + (F×w3) + (R×w4). Now uses learning data for D. */
function rankScorePhase2(thought, viewer, layer2Score, weights, layer2Max, maps, viewerClusterIds, replyQuality, config = config_1.feedConfig) {
    const Q = layer2Max > 0 ? Math.min(1, layer2Score / layer2Max) : 0.5;
    const cohortDist = cohortDistance(thought, viewer, maps?.resonanceMap ?? null);
    const concDiff = concentrationDiff(thought, viewer, maps?.affinityMap ?? null);
    const clusterNov = clusterNoveltyScore(thought, viewerClusterIds ?? [], maps?.clusterAffinityMap ?? null);
    const D = cohortDist * 0.4 + concDiff * 0.3 + clusterNov * 0.3;
    const F = freshnessScore(thought.createdAt, config);
    const R = typeof replyQuality === "number" ? replyQuality : 0.5;
    return Q * weights.qWeight + D * weights.dWeight + F * weights.fWeight + R * weights.rWeight;
}
/** Same as rankScorePhase2 but returns components for debug endpoint. */
function rankScorePhase2WithDebug(thought, viewer, layer2Score, weights, layer2Max, maps, viewerClusterIds, replyQuality, config = config_1.feedConfig) {
    const Q = layer2Max > 0 ? Math.min(1, layer2Score / layer2Max) : 0.5;
    const cohortDist = cohortDistance(thought, viewer, maps?.resonanceMap ?? null);
    const concDiff = concentrationDiff(thought, viewer, maps?.affinityMap ?? null);
    const clusterNov = clusterNoveltyScore(thought, viewerClusterIds ?? [], maps?.clusterAffinityMap ?? null);
    const D = cohortDist * 0.4 + concDiff * 0.3 + clusterNov * 0.3;
    const F = freshnessScore(thought.createdAt, config);
    const R = typeof replyQuality === "number" ? replyQuality : 0.5;
    const score = Q * weights.qWeight + D * weights.dWeight + F * weights.fWeight + R * weights.rWeight;
    return { score, Q, D, F, R };
}
/** Sliding window: max 40% single cohort; demote 3rd consecutive same concentration. */
function applyDiversityEnforcement(items, config = config_1.feedConfig) {
    const { cohortMaxFraction, windowSize, cohortDemotePositions, concentrationDemotePositions, } = config;
    const result = [...items].sort((a, b) => b.rankScore - a.rankScore);
    const n = result.length;
    for (let i = 0; i < n; i++) {
        const windowStart = Math.max(0, i - windowSize + 1);
        const window = result.slice(windowStart, i + 1);
        const cohortCounts = new Map();
        for (const { thought } of window) {
            const c = thought.authorCohortYear ?? 0;
            cohortCounts.set(c, (cohortCounts.get(c) ?? 0) + 1);
        }
        const over = Array.from(cohortCounts.entries()).find(([_, count]) => count / window.length > cohortMaxFraction);
        if (over && i + cohortDemotePositions < n) {
            const [demoted] = result.splice(i, 1);
            result.splice(Math.min(i + cohortDemotePositions, n - 1), 0, demoted);
        }
    }
    for (let i = 2; i < result.length; i++) {
        const a = (result[i - 2].thought.authorConcentration ?? "").toLowerCase();
        const b = (result[i - 1].thought.authorConcentration ?? "").toLowerCase();
        const c = (result[i].thought.authorConcentration ?? "").toLowerCase();
        if (a && a === b && b === c) {
            const [demoted] = result.splice(i, 1);
            result.splice(Math.min(i + concentrationDemotePositions, result.length), 0, demoted);
        }
    }
    return result;
}
