/**
 * Layer 3 — RANK: diversity, freshness, reply quality; post-ranking enforcement (Phase 5).
 */

import { and, eq, inArray } from "drizzle-orm";
import { db, replies, conversations, users } from "../db";
import { feedConfig } from "./config";
import type { ThoughtCandidate, ViewerProfile, RecommendationWeights } from "./types";

const { freshnessDecayRate, cohortMaxFraction, windowSize, cohortDemotePositions, concentrationDemotePositions } = feedConfig;

function freshnessScore(createdAt: Date): number {
  const hours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  return Math.exp(-freshnessDecayRate * hours);
}

function cohortDiversityBonus(thought: ThoughtCandidate, viewer: ViewerProfile): number {
  const v = viewer.cohortYear ?? 0;
  const t = thought.authorCohortYear ?? 0;
  if (v === 0 && t === 0) return 0.5;
  if (v === t) return 0.3;
  return 1.0;
}

function cohortDistance(thought: ThoughtCandidate, viewer: ViewerProfile): number {
  const v = viewer.cohortYear ?? 0;
  const t = thought.authorCohortYear ?? 0;
  return Math.min(Math.abs(t - v) / 3, 1);
}

function concentrationDiff(thought: ThoughtCandidate, viewer: ViewerProfile): number {
  const v = (viewer.concentration ?? "").trim();
  const t = (thought.authorConcentration ?? "").trim();
  if (!v || !t) return 0.5;
  return v.toLowerCase() === t.toLowerCase() ? 0.3 : 1.0;
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

/** Phase 2 rank: (Q×w1) + (D×w2) + (F×w3) + (R×w4). Q = layer2 normalized; D = diversity; F = freshness; R = reply quality. */
export async function rankScorePhase2(
  thought: ThoughtCandidate,
  viewer: ViewerProfile,
  layer2Score: number,
  weights: RecommendationWeights,
  layer2Max: number
): Promise<number> {
  const Q = layer2Max > 0 ? Math.min(1, layer2Score / layer2Max) : 0.5;
  const cohortDist = cohortDistance(thought, viewer);
  const concDiff = concentrationDiff(thought, viewer);
  const clusterNovelty = 0.5;
  const D = cohortDist * 0.4 + concDiff * 0.3 + clusterNovelty * 0.3;
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
  layer2Max: number
): Promise<{ score: number; Q: number; D: number; F: number; R: number }> {
  const Q = layer2Max > 0 ? Math.min(1, layer2Score / layer2Max) : 0.5;
  const cohortDist = cohortDistance(thought, viewer);
  const concDiff = concentrationDiff(thought, viewer);
  const clusterNovelty = 0.5;
  const D = cohortDist * 0.4 + concDiff * 0.3 + clusterNovelty * 0.3;
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
