/**
 * Phase 3: resonance signature extraction + compatibility embeddings for thoughts.
 * Call processNewThought(thoughtId) asynchronously after creating a thought (do not block the POST response).
 */

export {
  processNewThought,
  reprocessFailedJobs,
  extractResonanceSignature,
  extractUnderlyingQuestion,
  computeQualityScore,
} from "./service";
export { computeThoughtFeedSignals } from "./feed-signals";
