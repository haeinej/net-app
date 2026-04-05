/**
 * Feed ranking config (Phase 5 + internal control plane).
 */

import { z } from "zod";

const bucketRatiosSchema = z.object({
  resonance: z.number().min(0).max(1),
  adjacent: z.number().min(0).max(1),
  wildcard: z.number().min(0).max(1),
});

const stageThresholdsSchema = z.object({
  new: z.number().int().nonnegative(),
  building: z.number().int().nonnegative(),
  established: z.number().int().nonnegative(),
});

const bucketRatioMapSchema = z.object({
  new: bucketRatiosSchema,
  building: bucketRatiosSchema,
  established: bucketRatiosSchema,
  wanderer: bucketRatiosSchema,
});

const fullFeedConfigSchema = z.object({
  version: z.string().min(1),
  candidateLimit: z.number().int().positive(),
  recentLimit: z.number().int().positive(),
  newUserSurfaceLimit: z.number().int().positive(),
  feedLimit: z.number().int().positive(),
  phase1ViewerThoughtThreshold: z.number().int().nonnegative(),
  phase1SystemEngagementThreshold: z.number().int().nonnegative(),
  freshnessFullBoostHours: z.number().nonnegative(),
  freshnessDecayEndHours: z.number().positive(),
  freshnessResidual: z.number().min(0).max(1),
  stageThresholds: stageThresholdsSchema,
  bucketRatios: bucketRatioMapSchema,
  resonanceTopFraction: z.number().min(0).max(1),
  adjacentMinResonance: z.number().min(0).max(1),
  adjacentMinSurfaceDistance: z.number().min(0).max(1),
  wildcardMinQuality: z.number().min(0).max(1),
  thoughtActiveDays: z.number().int().positive(),
  thoughtSleepTransitionDays: z.number().int().nonnegative(),
  defaultWeights: z.object({
    qWeight: z.number().min(0),
    dWeight: z.number().min(0),
    fWeight: z.number().min(0),
    rWeight: z.number().min(0),
    alpha: z.number().min(0),
  }),
  cohortMaxFraction: z.number().min(0).max(1),
  windowSize: z.number().int().positive(),
  cohortDemotePositions: z.number().int().nonnegative(),
  concentrationDemotePositions: z.number().int().nonnegative(),
  cacheTtlSeconds: z.number().int().positive(),
});

const partialFeedConfigSchema = fullFeedConfigSchema.deepPartial();

export type FeedRuntimeConfig = z.infer<typeof fullFeedConfigSchema>;
export type FeedConfigPatch = z.infer<typeof partialFeedConfigSchema>;

export const feedConfig: FeedRuntimeConfig = {
  version: "crossing-only-v1",
  candidateLimit: 100,
  recentLimit: 50,
  newUserSurfaceLimit: 80,
  feedLimit: 3,
  phase1ViewerThoughtThreshold: 3,
  phase1SystemEngagementThreshold: 200,
  freshnessFullBoostHours: 168,
  freshnessDecayEndHours: 720,
  freshnessResidual: 0.3,
  stageThresholds: { new: 2, building: 7, established: 15 },
  bucketRatios: {
    new: { resonance: 0.60, adjacent: 0.30, wildcard: 0.10 },
    building: { resonance: 0.45, adjacent: 0.35, wildcard: 0.20 },
    established: { resonance: 0.35, adjacent: 0.35, wildcard: 0.30 },
    wanderer: { resonance: 0.25, adjacent: 0.35, wildcard: 0.40 },
  },
  resonanceTopFraction: 0.35,
  adjacentMinResonance: 0.15,
  adjacentMinSurfaceDistance: 0.35,
  wildcardMinQuality: 0.3,
  thoughtActiveDays: 90,
  thoughtSleepTransitionDays: 14,
  defaultWeights: {
    qWeight: 0.50,
    dWeight: 0.30,
    fWeight: 0.02,
    rWeight: 0.18,
    alpha: 0.3,
  },
  cohortMaxFraction: 0.4,
  windowSize: 10,
  cohortDemotePositions: 5,
  concentrationDemotePositions: 3,
  cacheTtlSeconds: 86400,
};

function mergeBucketRatios(
  base: FeedRuntimeConfig["bucketRatios"],
  patch: FeedConfigPatch["bucketRatios"] | undefined
): FeedRuntimeConfig["bucketRatios"] {
  return {
    new: { ...base.new, ...(patch?.new ?? {}) },
    building: { ...base.building, ...(patch?.building ?? {}) },
    established: { ...base.established, ...(patch?.established ?? {}) },
    wanderer: { ...base.wanderer, ...(patch?.wanderer ?? {}) },
  };
}

export function mergeFeedConfig(
  base: FeedRuntimeConfig,
  patchInput: unknown,
  fallbackVersion?: string
): FeedRuntimeConfig {
  const patch = validateFeedConfigPatch(patchInput);
  const merged = {
    ...base,
    ...patch,
    stageThresholds: {
      ...base.stageThresholds,
      ...(patch.stageThresholds ?? {}),
    },
    bucketRatios: mergeBucketRatios(base.bucketRatios, patch.bucketRatios),
    defaultWeights: {
      ...base.defaultWeights,
      ...(patch.defaultWeights ?? {}),
    },
  };

  if (fallbackVersion && (!merged.version || merged.version === feedConfig.version)) {
    merged.version = fallbackVersion;
  }

  const parsed = fullFeedConfigSchema.parse(merged);

  const stageRatios = Object.values(parsed.bucketRatios);
  for (const ratios of stageRatios) {
    const total = ratios.resonance + ratios.adjacent + ratios.wildcard;
    if (Math.abs(total - 1) > 0.001) {
      throw new Error("Each bucket ratio set must sum to 1");
    }
  }
  if (parsed.freshnessDecayEndHours <= parsed.freshnessFullBoostHours) {
    throw new Error("freshnessDecayEndHours must be greater than freshnessFullBoostHours");
  }
  return parsed;
}

export function normalizeFeedConfig(
  input: unknown,
  fallbackVersion?: string
): FeedRuntimeConfig {
  return mergeFeedConfig(normalizeFeedConfigBase(fallbackVersion), input, fallbackVersion);
}

function normalizeFeedConfigBase(fallbackVersion?: string): FeedRuntimeConfig {
  const parsed = fullFeedConfigSchema.parse(feedConfig);
  return fallbackVersion && parsed.version === feedConfig.version
    ? { ...parsed, version: fallbackVersion }
    : parsed;
}

export function validateFeedConfigPatch(input: unknown): FeedConfigPatch {
  return partialFeedConfigSchema.parse(input ?? {});
}
