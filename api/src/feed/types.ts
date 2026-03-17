/**
 * Feed types (Phase 5).
 */

export interface FeedItemUser {
  id: string;
  name: string | null;
  photo_url: string | null;
}

export interface FeedItemThought {
  type: "thought";
  thought: {
    id: string;
    sentence: string;
    photo_url: string | null;
    image_url: string | null;
    created_at: string;
    has_context: boolean;
  };
  user: FeedItemUser;
}

export interface FeedItemCrossing {
  type: "crossing";
  crossing: {
    id: string;
    sentence: string;
    context: string | null;
    created_at: string;
  };
  participant_a: FeedItemUser;
  participant_b: FeedItemUser;
}

export type FeedItem = FeedItemThought | FeedItemCrossing;

/** Thought with embeddings and author for scoring. */
export interface ThoughtCandidate {
  id: string;
  userId: string;
  sentence: string;
  context: string | null;
  photoUrl: string | null;
  imageUrl: string | null;
  resonanceEmbedding: number[] | null;
  surfaceEmbedding: number[] | null;
  qualityScore: number | null;
  createdAt: Date;
  authorCohortYear: number | null;
  authorConcentration: string | null;
  clusterId: string | null;
}

/** Viewer's embeddings from posted thoughts, or internal interests fallback. */
export interface ViewerEmbeddings {
  resonanceEmbeddings: number[][];
  surfaceEmbeddings: number[][];
  /** For cold start only: single embedding from internal profile prompts. */
  interestsEmbedding: number[] | null;
}

export interface ViewerProfile {
  id: string;
  cohortYear: number | null;
  concentration: string | null;
}

export interface RecommendationWeights {
  qWeight: number;
  dWeight: number;
  fWeight: number;
  rWeight: number;
  alpha: number;
}

// ——— Three-Bucket Feed System ———

export type BucketLabel = "resonance" | "adjacent" | "wildcard";

export type UserStage = "new" | "building" | "established" | "wanderer";

export type FeedPhaseUsed = "pre-data" | "learning";

export type FeedServeItemType = "thought" | "crossing";

export interface BucketRatios {
  resonance: number;
  adjacent: number;
  wildcard: number;
}

export interface BucketedCandidate {
  thought: ThoughtCandidate;
  bucket: BucketLabel;
}

export interface FeedScoreSnapshot {
  Q: number | null;
  D: number | null;
  F: number | null;
  R: number | null;
  final_rank: number | null;
}

export interface FeedServeTrace {
  item_type: FeedServeItemType;
  thought_id: string | null;
  crossing_id: string | null;
  author_id: string | null;
  position: number;
  bucket: BucketLabel | null;
  stage: UserStage | null;
  phase_used: FeedPhaseUsed | null;
  scores: FeedScoreSnapshot;
  resonance_similarity: number | null;
  surface_similarity: number | null;
}
