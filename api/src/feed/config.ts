/**
 * Feed ranking config (Phase 5).
 */

import type { UserStage, BucketRatios } from "./types";

export const feedConfig = {
  candidateLimit: 100,
  recentLimit: 50,
  newUserSurfaceLimit: 80,
  feedLimit: 20,
  /** Phase 1: viewer < 3 thoughts OR system < 200 engagement events */
  phase1ViewerThoughtThreshold: 3,
  phase1SystemEngagementThreshold: 200,

  // ——— Freshness (piecewise curve) ———
  /** Full boost for first N hours */
  freshnessFullBoostHours: 6,
  /** Linear decay ends at this hour */
  freshnessDecayEndHours: 48,
  /** Small residual after decay */
  freshnessResidual: 0.05,

  // ——— Three-Bucket System ———
  /** Conversation count thresholds for user stages */
  stageThresholds: { new: 2, building: 7, established: 15 } as Record<string, number>,
  /** Bucket ratios per user stage */
  bucketRatios: {
    new:         { resonance: 0.60, adjacent: 0.30, wildcard: 0.10 },
    building:    { resonance: 0.45, adjacent: 0.35, wildcard: 0.20 },
    established: { resonance: 0.35, adjacent: 0.35, wildcard: 0.30 },
    wanderer:    { resonance: 0.25, adjacent: 0.35, wildcard: 0.40 },
  } as Record<UserStage, BucketRatios>,
  /** Top fraction of resonance scores → Bucket 1 */
  resonanceTopFraction: 0.35,
  /** Min resonance similarity for Bucket 2 */
  adjacentMinResonance: 0.15,
  /** Min surface distance for "adjacent" (creative collision zone) */
  adjacentMinSurfaceDistance: 0.35,
  /** Min quality score for wild cards */
  wildcardMinQuality: 0.3,

  // ——— Thought Lifecycle ———
  /** Days before a thought enters sleep transition */
  thoughtActiveDays: 7,
  /** Days 7-10: linear probability decay */
  thoughtSleepTransitionDays: 3,

  /** Default weights (Phase 2) */
  defaultWeights: {
    qWeight: 0.4,
    dWeight: 0.25,
    fWeight: 0.2,
    rWeight: 0.15,
    alpha: 0.3,
  },
  /** Diversity: max single cohort in sliding window of 10 */
  cohortMaxFraction: 0.4,
  windowSize: 10,
  cohortDemotePositions: 5,
  concentrationDemotePositions: 3,
  /** Cache TTL seconds */
  cacheTtlSeconds: 300,
} as const;
