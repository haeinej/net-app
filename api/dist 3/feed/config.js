"use strict";
/**
 * Feed ranking config (Phase 5 + internal control plane).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedConfig = void 0;
exports.mergeFeedConfig = mergeFeedConfig;
exports.normalizeFeedConfig = normalizeFeedConfig;
exports.validateFeedConfigPatch = validateFeedConfigPatch;
const zod_1 = require("zod");
const bucketRatiosSchema = zod_1.z.object({
    resonance: zod_1.z.number().min(0).max(1),
    adjacent: zod_1.z.number().min(0).max(1),
    wildcard: zod_1.z.number().min(0).max(1),
});
const stageThresholdsSchema = zod_1.z.object({
    new: zod_1.z.number().int().nonnegative(),
    building: zod_1.z.number().int().nonnegative(),
    established: zod_1.z.number().int().nonnegative(),
});
const bucketRatioMapSchema = zod_1.z.object({
    new: bucketRatiosSchema,
    building: bucketRatiosSchema,
    established: bucketRatiosSchema,
    wanderer: bucketRatiosSchema,
});
const fullFeedConfigSchema = zod_1.z.object({
    version: zod_1.z.string().min(1),
    candidateLimit: zod_1.z.number().int().positive(),
    recentLimit: zod_1.z.number().int().positive(),
    newUserSurfaceLimit: zod_1.z.number().int().positive(),
    feedLimit: zod_1.z.number().int().positive(),
    phase1ViewerThoughtThreshold: zod_1.z.number().int().nonnegative(),
    phase1SystemEngagementThreshold: zod_1.z.number().int().nonnegative(),
    freshnessFullBoostHours: zod_1.z.number().nonnegative(),
    freshnessDecayEndHours: zod_1.z.number().positive(),
    freshnessResidual: zod_1.z.number().min(0).max(1),
    stageThresholds: stageThresholdsSchema,
    bucketRatios: bucketRatioMapSchema,
    resonanceTopFraction: zod_1.z.number().min(0).max(1),
    adjacentMinResonance: zod_1.z.number().min(0).max(1),
    adjacentMinSurfaceDistance: zod_1.z.number().min(0).max(1),
    wildcardMinQuality: zod_1.z.number().min(0).max(1),
    thoughtActiveDays: zod_1.z.number().int().positive(),
    thoughtSleepTransitionDays: zod_1.z.number().int().nonnegative(),
    defaultWeights: zod_1.z.object({
        qWeight: zod_1.z.number().min(0),
        dWeight: zod_1.z.number().min(0),
        fWeight: zod_1.z.number().min(0),
        rWeight: zod_1.z.number().min(0),
        alpha: zod_1.z.number().min(0),
    }),
    cohortMaxFraction: zod_1.z.number().min(0).max(1),
    windowSize: zod_1.z.number().int().positive(),
    cohortDemotePositions: zod_1.z.number().int().nonnegative(),
    concentrationDemotePositions: zod_1.z.number().int().nonnegative(),
    cacheTtlSeconds: zod_1.z.number().int().positive(),
});
const partialFeedConfigSchema = fullFeedConfigSchema.deepPartial();
exports.feedConfig = {
    version: "crossing-only-v1",
    candidateLimit: 100,
    recentLimit: 50,
    newUserSurfaceLimit: 80,
    feedLimit: 20,
    phase1ViewerThoughtThreshold: 3,
    phase1SystemEngagementThreshold: 200,
    freshnessFullBoostHours: 6,
    freshnessDecayEndHours: 48,
    freshnessResidual: 0.05,
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
    thoughtActiveDays: 7,
    thoughtSleepTransitionDays: 3,
    defaultWeights: {
        qWeight: 0.4,
        dWeight: 0.25,
        fWeight: 0.2,
        rWeight: 0.15,
        alpha: 0.3,
    },
    cohortMaxFraction: 0.4,
    windowSize: 10,
    cohortDemotePositions: 5,
    concentrationDemotePositions: 3,
    cacheTtlSeconds: 300,
};
function mergeBucketRatios(base, patch) {
    return {
        new: { ...base.new, ...(patch?.new ?? {}) },
        building: { ...base.building, ...(patch?.building ?? {}) },
        established: { ...base.established, ...(patch?.established ?? {}) },
        wanderer: { ...base.wanderer, ...(patch?.wanderer ?? {}) },
    };
}
function mergeFeedConfig(base, patchInput, fallbackVersion) {
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
    if (fallbackVersion && (!merged.version || merged.version === exports.feedConfig.version)) {
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
function normalizeFeedConfig(input, fallbackVersion) {
    return mergeFeedConfig(normalizeFeedConfigBase(fallbackVersion), input, fallbackVersion);
}
function normalizeFeedConfigBase(fallbackVersion) {
    const parsed = fullFeedConfigSchema.parse(exports.feedConfig);
    return fallbackVersion && parsed.version === exports.feedConfig.version
        ? { ...parsed, version: fallbackVersion }
        : parsed;
}
function validateFeedConfigPatch(input) {
    return partialFeedConfigSchema.parse(input ?? {});
}
