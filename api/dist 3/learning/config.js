"use strict";
/**
 * Learning loop config (Phase 7).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.learningConfig = void 0;
exports.learningConfig = {
    lockExpiryMs: 2 * 60 * 60 * 1000, // 2 hours
    dailyIncrement: 0.03,
    weightMin: 0.1,
    weightMax: 0.6,
    alphaMin: 0.1,
    alphaMax: 0.8,
    crossCohortThreshold: 0.5,
    crossConcentrationThreshold: 0.5,
    freshContentDays: 2,
    freshContentFraction: 0.7,
    minEngagementEventsForWeights: 5,
    engagementDaysLookback: 7,
    conversationLookbackHours: 24,
    weeklyMinThoughtsWithEmbedding: 100,
    clusterKMin: 5,
    clusterKMax: 15,
    samplesPerCluster: 5,
    highResonanceSimThreshold: 0.7,
    highQSimEngagementRate: 0.5,
    kmeansMaxIter: 20,
};
