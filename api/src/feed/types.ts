/**
 * Feed types (Phase 5). No counts exposed to clients.
 */

export type WarmthLevel = "none" | "low" | "medium" | "full";

export interface FeedItemUser {
  id: string;
  name: string | null;
  photo_url: string | null;
}

export interface FeedItem {
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

/** Thought with embeddings and author for scoring. */
export interface ThoughtCandidate {
  id: string;
  userId: string;
  sentence: string;
  context: string | null;
  imageUrl: string | null;
  surfaceEmbedding: number[] | null;
  questionEmbedding: number[] | null;
  qualityScore: number | null;
  createdAt: Date;
  authorCohortYear: number | null;
  authorConcentration: string | null;
}

/** Viewer's embeddings from their posted thoughts, or embedded interests (new user). */
export interface ViewerEmbeddings {
  questionEmbeddings: number[][];
  surfaceEmbeddings: number[][];
  /** For new users: single embedding from interests text */
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
