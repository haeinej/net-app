/**
 * Phase 3: dual embeddings + quality score for thoughts.
 * Call processNewThought(thoughtId) asynchronously after creating a thought (do not block the POST response).
 */

export {
  processNewThought,
  reprocessFailedJobs,
  extractUnderlyingQuestion,
  computeQualityScore,
} from "./service";
