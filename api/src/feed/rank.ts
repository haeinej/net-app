/**
 * Layer 3 — RANK: diversity, freshness, reply quality; post-ranking enforcement (Phase 5).
 * Now wires in learning outputs: cross_domain_affinity, temporal_resonance, cross_cluster_affinity.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db, replies, conversations, users, crossDomainAffinity, systemConfig, crossClusterAffinity } from "../db";
import { feedConfig } from "./config";
import type { ThoughtCandidate, ViewerProfile, RecommendationWeights } from "./types";

const { freshnessFullBoostHours, freshnessDecayEndHours, freshnessResidual, cohortMaxFraction, windowSize, cohortDemotePositions, concentrationDemotePositions } = feedConfig;

// ——— Learning Data Maps (preloaded per feed request) ———

export type LearningMaps = {
  affinityMap: Map<string, number> | null;
  resonanceMap: Map<number, number> | null;
  clusterAffinityMap: Map<string, number> | null;
};

/** Load cross-domain affinity sustainRates. Key = sorted concentration pair. */
export async function loadCrossDomainAffinityMap(): Promise<Map<string, number>> {
  const rows = await db.select().from(crossDomainAffinity);
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = [r.concentrationA, r.concentrationB].sort().join("\0");
    map.set(key, r.sustainRate ?? 0);
  }
  return map;
}

/** Load temporal resonance: cohort_distance → sustainRate from system_config. */
export async function loadTemporalResonanceMap(): Promise<Map<number, number>> {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, "temporal_resonance"));
  const map = new Map<number, number>();
  if (!row?.value) return map;
  const val = row.value as { by_distance?: Array<{ cohort_distance: number; sustain_rate: number }> };
  if (Array.isArray(val.by_distance)) {
    for (const entry of val.by_distance) {
      map.set(entry.cohort_distance, entry.sustain_rate);
    }
  }
  return map;
}

/** Load cross-cluster affinity sustainRates. Key = sorted cluster ID pair. */
export async function loadClusterAffinityMap(): Promise<Map<string, number>> {
  const rows = await db.select().from(crossClusterAffinity);
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = [r.clusterAId, r.clusterBId].sort().join("\0");
    map.set(key, r.sustainRate ?? 0);
  }
  return map;
}

// ——— Scoring Functions ———

/**
 * Piecewise freshness: full boost first 6h, linear decay 6-48h, residual after.
 */
function freshnessScore(createdAt: Date): number {
  const hours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  if (hours <= freshnessFullBoostHours) return 1.0;
  if (hours <= freshnessDecayEndHours) {
    const span = freshnessDecayEndHours - freshnessFullBoostHours;
    return 1.0 - ((hours - freshnessFullBoostHours) / span) * (1.0 - freshnessResidual);
  }
  return freshnessResidual;
}

function cohortDiversityBonus(thought: ThoughtCandidate, viewer: ViewerProfile): number {
  const v = viewer.cohortYear ?? 0;
  const t = thought.authorCohortYear ?? 0;
  if (v === 0 && t === 0) return 0.5;
  if (v === t) return 0.3;
  return 1.0;
}

/** Cohort distance with temporal resonance data when available. */
function cohortDistance(
  thought: ThoughtCandidate,
  viewer: ViewerProfile,
  resonanceMap: Map<number, number> | null
): number {
  const v = viewer.cohortYear ?? 0;
  const t = thought.authorCohortYear ?? 0;
  const dist = Math.abs(t - v);
  if (resonanceMap && resonanceMap.size > 0) {
    const sustainRate = resonanceMap.get(dist);
    if (sustainRate != null) return sustainRate;
  }
  return Math.min(dist / 3, 1);
}

/** Concentration diff with cross-domain affinity data when available. */
function concentrationDiff(
  thought: ThoughtCandidate,
  viewer: ViewerProfile,
  affinityMap: Map<string, number> | null
): number {
  const v = (viewer.concentration ?? "").trim();
  const t = (thought.authorConcentration ?? "").trim();
  if (!v || !t) return 0.5;
  if (v.toLowerCase() === t.toLowerCase()) return 0.3;
  if (affinityMap && affinityMap.size > 0) {
    const key = [v.toLowerCase(), t.toLowerCase()].sort().join("\0");
    const sustainRate = affinityMap.get(key);
    if (sustainRate != null) return 0.5 + sustainRate * 0.5;
  }
  return 1.0;
}

/** Cluster novelty from cross-cluster affinity. Uses viewer's cluster IDs if available. */
function clusterNoveltyScore(
  thought: ThoughtCandidate,
  viewerClusterIds: string[],
  clusterAffinityMap: Map<string, number> | null
): number {
  if (!thought.clusterId || viewerClusterIds.length === 0 || !clusterAffinityMap || clusterAffinityMap.size === 0) {
    return 0.5;
  }
  let maxAffinity = 0;
  for (const viewerCluster of viewerClusterIds) {
    if (viewerCluster === thought.clusterId) return 0.3; // same cluster = less novel
    const key = [viewerCluster, thought.clusterId].sort().join("\0");
    const affinity = clusterAffinityMap.get(key);
    if (affinity != null && affinity > maxAffinity) maxAffinity = affinity;
  }
  // Higher cross-cluster affinity = proven interesting pairing = higher novelty score
  return maxAffinity > 0 ? 0.5 + maxAffinity * 0.5 : 0.5;
}

/** Reply quality R: accepted reply, sustained conv (10+ msgs), cross-domain ratio. */
async function replyQualityScore(thoughtId: string, authorConcentration: string | null): Promise<number> {
  const accepted = await db
    .select({ replierId: replies.replierId, id: replies.id })
    .from(replies)
    .where(and(eq(replies.thoughtId, thoughtId), eq(replies.status, "accepted")));
  if (accepted.length === 0) return 0.5;

  let r = 0.3;
  const convs = await db
    .select({ messageCount: conversations.messageCount, participantA: conversations.participantA, participantB: conversations.participantB })
    .from(conversations)
    .where(eq(conversations.thoughtId, thoughtId));
  const sustained = convs.filter((c) => (c.messageCount ?? 0) >= 10);
  if (sustained.length > 0) r += 0.4;

  let crossDomain = 0;
  const replierIds = accepted.map((a) => a.replierId);
  if (authorConcentration && replierIds.length > 0) {
    const repliers = await db
      .select({ id: users.id, concentration: users.concentration })
      .from(users)
      .where(inArray(users.id, replierIds));
    const authorConc = (authorConcentration ?? "").toLowerCase();
    const different = repliers.filter((r) => (r.concentration ?? "").toLowerCase() !== authorConc).length;
    crossDomain = (different / Math.max(accepted.length, 1)) * 0.3;
  }
  r += crossDomain;
  return Math.min(1, r);
}

/** Phase 1 rank: freshness × 0.5 + quality × 0.3 + cohort_diversity × 0.2 */
export function rankScorePhase1(
  thought: ThoughtCandidate,
  viewer: ViewerProfile,
  layer2Score: number
): number {
  const f = freshnessScore(thought.createdAt);
  const q = Math.min(1, thought.qualityScore ?? 0.5);
  const d = cohortDiversityBonus(thought, viewer);
  return f * 0.5 + q * 0.3 + d * 0.2;
}

/** Phase 2 rank: (Q×w1) + (D×w2) + (F×w3) + (R×w4). Now uses learning data for D. */
export async function rankScorePhase2(
  thought: ThoughtCandidate,
  viewer: ViewerProfile,
  layer2Score: number,
  weights: RecommendationWeights,
  layer2Max: number,
  maps?: LearningMaps,
  viewerClusterIds?: string[]
): Promise<number> {
  const Q = layer2Max > 0 ? Math.min(1, layer2Score / layer2Max) : 0.5;
  const cohortDist = cohortDistance(thought, viewer, maps?.resonanceMap ?? null);
  const concDiff = concentrationDiff(thought, viewer, maps?.affinityMap ?? null);
  const clusterNov = clusterNoveltyScore(thought, viewerClusterIds ?? [], maps?.clusterAffinityMap ?? null);
  const D = cohortDist * 0.4 + concDiff * 0.3 + clusterNov * 0.3;
  const F = freshnessScore(thought.createdAt);
  const R = await replyQualityScore(thought.id, thought.authorConcentration);
  return Q * weights.qWeight + D * weights.dWeight + F * weights.fWeight + R * weights.rWeight;
}

/** Same as rankScorePhase2 but returns components for debug endpoint. */
export async function rankScorePhase2WithDebug(
  thought: ThoughtCandidate,
  viewer: ViewerProfile,
  layer2Score: number,
  weights: RecommendationWeights,
  layer2Max: number,
  maps?: LearningMaps,
  viewerClusterIds?: string[]
): Promise<{ score: number; Q: number; D: number; F: number; R: number }> {
  const Q = layer2Max > 0 ? Math.min(1, layer2Score / layer2Max) : 0.5;
  const cohortDist = cohortDistance(thought, viewer, maps?.resonanceMap ?? null);
  const concDiff = concentrationDiff(thought, viewer, maps?.affinityMap ?? null);
  const clusterNov = clusterNoveltyScore(thought, viewerClusterIds ?? [], maps?.clusterAffinityMap ?? null);
  const D = cohortDist * 0.4 + concDiff * 0.3 + clusterNov * 0.3;
  const F = freshnessScore(thought.createdAt);
  const R = await replyQualityScore(thought.id, thought.authorConcentration);
  const score = Q * weights.qWeight + D * weights.dWeight + F * weights.fWeight + R * weights.rWeight;
  return { score, Q, D, F, R };
}

/** Sliding window: max 40% single cohort; demote 3rd consecutive same concentration. */
export function applyDiversityEnforcement(
  items: Array<{ thought: ThoughtCandidate; rankScore: number }>
): Array<{ thought: ThoughtCandidate; rankScore: number }> {
  const result = [...items].sort((a, b) => b.rankScore - a.rankScore);
  const n = result.length;
  for (let i = 0; i < n; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const window = result.slice(windowStart, i + 1);
    const cohortCounts = new Map<number, number>();
    for (const { thought } of window) {
      const c = thought.authorCohortYear ?? 0;
      cohortCounts.set(c, (cohortCounts.get(c) ?? 0) + 1);
    }
    const over = Array.from(cohortCounts.entries()).find(
      ([_, count]) => count / window.length > cohortMaxFraction
    );
    if (over && i + cohortDemotePositions < n) {
      const [demoted] = result.splice(i, 1);
      result.splice(Math.min(i + cohortDemotePositions, n - 1), 0, demoted);
    }
  }
  for (let i = 2; i < result.length; i++) {
    const a = (result[i - 2]!.thought.authorConcentration ?? "").toLowerCase();
    const b = (result[i - 1]!.thought.authorConcentration ?? "").toLowerCase();
    const c = (result[i]!.thought.authorConcentration ?? "").toLowerCase();
    if (a && a === b && b === c) {
      const [demoted] = result.splice(i, 1);
      result.splice(Math.min(i + concentrationDemotePositions, result.length), 0, demoted);
    }
  }
  return result;
}
