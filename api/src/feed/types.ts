/**
 * Feed types (Phase 5). No counts exposed to clients.
 */

export type WarmthLevel = "none" | "low" | "medium" | "full";

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
    image_url: string | null;
    created_at: string;
    has_context: boolean;
  };
  user: FeedItemUser;
  warmth_level: WarmthLevel;
}

export interface FeedItemShift {
  type: "shift";
  id: string;
  created_at: string;
  participant_a: FeedItemUser & { before: string; after: string };
  participant_b: FeedItemUser & { before: string; after: string };
}

export type FeedItem = FeedItemThought | FeedItemShift;

/** Thought with embeddings and author for scoring. */
export interface ThoughtCandidate {
  id: string;
  userId: string;
  sentence: string;
  context: string | null;
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

export interface BucketRatios {
  resonance: number;
  adjacent: number;
  wildcard: number;
}

export interface BucketedCandidate {
  thought: ThoughtCandidate;
  bucket: BucketLabel;
}
