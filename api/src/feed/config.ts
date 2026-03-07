/**
 * Feed ranking config (Phase 5).
 */

export const feedConfig = {
  candidateLimit: 100,
  recentLimit: 50,
  newUserSurfaceLimit: 80,
  feedLimit: 20,
  /** Phase 1: viewer < 3 thoughts OR system < 200 engagement events */
  phase1ViewerThoughtThreshold: 3,
  phase1SystemEngagementThreshold: 200,
  /** Freshness decay: exp(-0.005 * hours), half-life ~6 days */
  freshnessDecayRate: 0.005,
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
