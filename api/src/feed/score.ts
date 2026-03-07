/**
 * Layer 2 — SCORE: application-level scoring (Phase 5).
 * score = question_similarity × (1 + α × surface_distance) × quality_score
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
): { question_similarity: number; surface_similarity: number } {
  const question_similarity =
    thought.questionEmbedding && viewerEmbeddings.questionEmbeddings.length > 0
      ? maxCosineSim(thought.questionEmbedding, viewerEmbeddings.questionEmbeddings)
      : 0;
  const surface_similarity =
    thought.surfaceEmbedding && viewerEmbeddings.surfaceEmbeddings.length > 0
      ? maxCosineSim(thought.surfaceEmbedding, viewerEmbeddings.surfaceEmbeddings)
      : thought.surfaceEmbedding && viewerEmbeddings.interestsEmbedding
        ? cosineSimilarity(thought.surfaceEmbedding, viewerEmbeddings.interestsEmbedding)
        : 0;
  return { question_similarity, surface_similarity };
}

/**
 * Layer 2 score for one thought.
 * Edge: no viewer thoughts → interests_similarity × quality_score × 0.7
 * Edge: thought missing question_embedding → surface_similarity × quality_score
 */
export function scoreThought(
  thought: ThoughtCandidate,
  viewerEmbeddings: ViewerEmbeddings,
  viewerProfile: ViewerProfile,
  alpha: number
): number {
  const quality = Math.min(1, Math.max(0, thought.qualityScore ?? 0.5));

  const hasViewerQuestions =
    viewerEmbeddings.questionEmbeddings.length > 0 &&
    viewerEmbeddings.questionEmbeddings.some((q) => q.length > 0);

  if (!hasViewerQuestions && viewerEmbeddings.interestsEmbedding) {
    const interestsSim =
      thought.surfaceEmbedding && viewerEmbeddings.interestsEmbedding
        ? cosineSimilarity(thought.surfaceEmbedding, viewerEmbeddings.interestsEmbedding)
        : 0;
    return Math.max(0, interestsSim * quality * 0.7);
  }

  if (!hasViewerQuestions) {
    return quality * 0.5;
  }

  const questionSim = thought.questionEmbedding
    ? maxCosineSim(thought.questionEmbedding, viewerEmbeddings.questionEmbeddings)
    : 0;
  const surfaceSim = thought.surfaceEmbedding
    ? maxCosineSim(thought.surfaceEmbedding, viewerEmbeddings.surfaceEmbeddings)
    : 0;
  const surfaceDistance = 1 - surfaceSim;

  if (thought.questionEmbedding == null || thought.questionEmbedding.length === 0) {
    return Math.max(0, surfaceSim * quality);
  }

  const score =
    questionSim * (1 + alpha * surfaceDistance) * quality;
  return Math.max(0, score);
}
