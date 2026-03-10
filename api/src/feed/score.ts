/**
 * Layer 2 — SCORE: application-level scoring (Phase 5).
 * score = resonance_similarity × (1 + α × surface_distance) × openness_score
 */

import { cosineSimilarity } from "../embedding";
import type { ThoughtCandidate, ViewerEmbeddings, ViewerProfile } from "./types";

function maxCosineSim(thoughtVec: number[] | null, viewerVecs: number[][]): number {
  if (!thoughtVec || viewerVecs.length === 0) return 0;
  let max = 0;
  for (const v of viewerVecs) {
    if (v.length !== thoughtVec.length) continue;
    const sim = cosineSimilarity(thoughtVec, v);
    if (sim > max) max = sim;
  }
  return max;
}

/** Return raw similarities for debug endpoint. */
export function getSimilarities(
  thought: ThoughtCandidate,
  viewerEmbeddings: ViewerEmbeddings
): { resonance_similarity: number; surface_similarity: number } {
  const resonance_similarity =
    thought.resonanceEmbedding && viewerEmbeddings.resonanceEmbeddings.length > 0
      ? maxCosineSim(
          thought.resonanceEmbedding,
          viewerEmbeddings.resonanceEmbeddings
        )
      : 0;
  const surface_similarity =
    thought.surfaceEmbedding && viewerEmbeddings.surfaceEmbeddings.length > 0
      ? maxCosineSim(thought.surfaceEmbedding, viewerEmbeddings.surfaceEmbeddings)
      : thought.surfaceEmbedding && viewerEmbeddings.interestsEmbedding
        ? cosineSimilarity(thought.surfaceEmbedding, viewerEmbeddings.interestsEmbedding)
        : 0;
  return { resonance_similarity, surface_similarity };
}

/**
 * Layer 2 score for one thought.
 * Edge: no viewer thoughts → interests_similarity × quality_score × 0.7
 * Edge: thought missing resonance embedding → surface_similarity × quality_score
 */
export function scoreThought(
  thought: ThoughtCandidate,
  viewerEmbeddings: ViewerEmbeddings,
  viewerProfile: ViewerProfile,
  alpha: number
): number {
  const quality = Math.min(1, Math.max(0, thought.qualityScore ?? 0.5));

  const hasViewerResonance =
    viewerEmbeddings.resonanceEmbeddings.length > 0 &&
    viewerEmbeddings.resonanceEmbeddings.some((q) => q.length > 0);

  if (!hasViewerResonance && viewerEmbeddings.interestsEmbedding) {
    const interestsSim =
      thought.surfaceEmbedding && viewerEmbeddings.interestsEmbedding
        ? cosineSimilarity(thought.surfaceEmbedding, viewerEmbeddings.interestsEmbedding)
        : 0;
    return Math.max(0, interestsSim * quality * 0.7);
  }

  if (!hasViewerResonance) {
    return quality * 0.5;
  }

  const resonanceSim = thought.resonanceEmbedding
    ? maxCosineSim(
        thought.resonanceEmbedding,
        viewerEmbeddings.resonanceEmbeddings
      )
    : 0;
  const surfaceSim = thought.surfaceEmbedding
    ? maxCosineSim(thought.surfaceEmbedding, viewerEmbeddings.surfaceEmbeddings)
    : 0;
  const surfaceDistance = 1 - surfaceSim;

  if (thought.resonanceEmbedding == null || thought.resonanceEmbedding.length === 0) {
    return Math.max(0, surfaceSim * quality);
  }

  const score = resonanceSim * (1 + alpha * surfaceDistance) * quality;
  return Math.max(0, score);
}
