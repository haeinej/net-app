/**
 * Phase 5: FeedService — retrieve → score → rank → diversity → FeedItem[].
 */

export { getFeed, getFeedWithDebug, invalidateFeedCache } from "./service";
export type { FeedDebugInfo } from "./service";
export { getCandidates } from "./retrieve";
export { scoreThought } from "./score";
export {
  rankScorePhase1,
  rankScorePhase2,
  applyDiversityEnforcement,
} from "./rank";
export { feedConfig } from "./config";
export type {
  FeedItem,
  FeedItemUser,
  WarmthLevel,
  ThoughtCandidate,
  ViewerEmbeddings,
  ViewerProfile,
  RecommendationWeights,
} from "./types";
