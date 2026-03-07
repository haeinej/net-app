/**
 * FeedService — Phase 5. getFeed orchestrates retrieve → score → rank → diversity → FeedItem[].
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  thoughts,
  users,
  userRecommendationWeights,
  replies,
  engagementEvents,
} from "../db";
import { getEmbeddingService } from "../embedding";
import { getCandidates } from "./retrieve";
import { scoreThought } from "./score";
import {
  rankScorePhase1,
  rankScorePhase2,
  rankScorePhase2WithDebug,
  applyDiversityEnforcement,
} from "./rank";
import { getSimilarities } from "./score";
import { feedConfig } from "./config";
import type {
  ThoughtCandidate,
  ViewerEmbeddings,
  ViewerProfile,
  RecommendationWeights,
  FeedItem,
  WarmthLevel,
} from "./types";

const {
  phase1ViewerThoughtThreshold,
  phase1SystemEngagementThreshold,
  defaultWeights,
  cacheTtlSeconds,
} = feedConfig;

/** Cache per user (up to 100 items), 5 min TTL. */
const cache = new Map<string, { items: FeedItem[]; expiresAt: number }>();
const CACHE_MAX_ITEMS = 100;

function getWarmthLevel(acceptedReplyCount: number): WarmthLevel {
  if (acceptedReplyCount === 0) return "none";
  if (acceptedReplyCount <= 2) return "low";
  return "medium";
}

async function getAcceptedReplyCounts(thoughtIds: string[]): Promise<Map<string, number>> {
  if (thoughtIds.length === 0) return new Map();
  const rows = await db
    .select({
      thoughtId: replies.thoughtId,
      count: sql<number>`count(*)::int`,
    })
    .from(replies)
    .where(and(inArray(replies.thoughtId, thoughtIds), eq(replies.status, "accepted")))
    .groupBy(replies.thoughtId);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.thoughtId, r.count);
  return map;
}

export function invalidateFeedCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

async function loadViewerEmbeddingsAndProfile(viewerId: string): Promise<{
  embeddings: ViewerEmbeddings;
  profile: ViewerProfile;
  weights: RecommendationWeights;
}> {
  const [viewer, viewerThoughts, weightsRow] = await Promise.all([
    db.select().from(users).where(eq(users.id, viewerId)).limit(1),
    db
      .select({
        questionEmbedding: thoughts.questionEmbedding,
        surfaceEmbedding: thoughts.surfaceEmbedding,
      })
      .from(thoughts)
      .where(eq(thoughts.userId, viewerId)),
    db
      .select()
      .from(userRecommendationWeights)
      .where(eq(userRecommendationWeights.userId, viewerId))
      .limit(1),
  ]);

  const profile: ViewerProfile = {
    id: viewerId,
    cohortYear: viewer[0]?.cohortYear ?? null,
    concentration: viewer[0]?.concentration ?? null,
  };

  const questionEmbeddings: number[][] = [];
  const surfaceEmbeddings: number[][] = [];
  for (const t of viewerThoughts) {
    if (Array.isArray(t.questionEmbedding)) questionEmbeddings.push(t.questionEmbedding as number[]);
    if (Array.isArray(t.surfaceEmbedding)) surfaceEmbeddings.push(t.surfaceEmbedding as number[]);
  }

  let interestsEmbedding: number[] | null = null;
  if (questionEmbeddings.length === 0 && viewer[0]?.interests) {
    const interestsText = (viewer[0].interests as string[]).filter(Boolean).join(" ");
    if (interestsText) {
      const emb = getEmbeddingService();
      interestsEmbedding = await emb.embed(interestsText, "query");
    }
  }

  const weights: RecommendationWeights = weightsRow[0]
    ? {
        qWeight: weightsRow[0].qWeight ?? defaultWeights.qWeight,
        dWeight: weightsRow[0].dWeight ?? defaultWeights.dWeight,
        fWeight: weightsRow[0].fWeight ?? defaultWeights.fWeight,
        rWeight: weightsRow[0].rWeight ?? defaultWeights.rWeight,
        alpha: weightsRow[0].alpha ?? defaultWeights.alpha,
      }
    : defaultWeights;

  return {
    embeddings: {
      questionEmbeddings,
      surfaceEmbeddings,
      interestsEmbedding,
    },
    profile,
    weights,
  };
}

/**
 * getFeed(userId, limit, offset): Layer 1 → load viewer → Layer 2 → Layer 3 → diversity → slice → FeedItem[].
 * Cache 5 min per user; no counts in response.
 */
export async function getFeed(
  userId: string,
  limit: number = feedConfig.feedLimit,
  offset: number = 0
): Promise<FeedItem[]> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now() && offset + limit <= hit.items.length) {
    return hit.items.slice(offset, offset + limit);
  }

  const candidates = await getCandidates(userId);
  if (candidates.length === 0) return [];

  const { embeddings, profile, weights } = await loadViewerEmbeddingsAndProfile(userId);

  const layer2Scores = new Map<string, number>();
  let layer2Max = 0;
  for (const thought of candidates) {
    const s = scoreThought(thought, embeddings, profile, weights.alpha);
    layer2Scores.set(thought.id, s);
    if (s > layer2Max) layer2Max = s;
  }

  const engagementCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(engagementEvents);
  const totalEngagements = engagementCount[0]?.count ?? 0;
  const isPhase1 =
    embeddings.questionEmbeddings.length < phase1ViewerThoughtThreshold ||
    totalEngagements < phase1SystemEngagementThreshold;

  const withRank: Array<{ thought: ThoughtCandidate; rankScore: number }> = [];
  for (const thought of candidates) {
    const layer2 = layer2Scores.get(thought.id) ?? 0;
    const rankScore = isPhase1
      ? rankScorePhase1(thought, profile, layer2)
      : await rankScorePhase2(thought, profile, layer2, weights, layer2Max);
    withRank.push({ thought, rankScore });
  }

  const afterDiversity = applyDiversityEnforcement(withRank);
  const slice = afterDiversity.slice(0, CACHE_MAX_ITEMS);

  const thoughtIds = slice.map((x) => x.thought.id);
  const replyCounts = await getAcceptedReplyCounts(thoughtIds);

  const authorIds = [...new Set(slice.map((x) => x.thought.userId))];
  const authorRows = await db.select().from(users).where(inArray(users.id, authorIds));
  const authorMap = new Map(authorRows.map((u) => [u.id, u]));

  const items: FeedItem[] = slice.map(({ thought }) => {
    const author = authorMap.get(thought.userId);
    const acceptedCount = replyCounts.get(thought.id) ?? 0;
    return {
      thought: {
        id: thought.id,
        sentence: thought.sentence,
        image_url: thought.imageUrl,
        created_at: thought.createdAt.toISOString(),
        has_context: (thought.context ?? "").trim().length > 0,
      },
      user: {
        id: thought.userId,
        name: author?.name ?? null,
        photo_url: author?.photoUrl ?? null,
      },
      warmth_level: getWarmthLevel(acceptedCount),
    };
  });

  cache.set(userId, {
    items,
    expiresAt: Date.now() + cacheTtlSeconds * 1000,
  });
  return items.slice(offset, offset + limit);
}

export type FeedDebugInfo = {
  phase_used: "pre-data" | "learning";
  scores: { Q: number; D: number; F: number; R: number; final_rank: number };
  underlying_questions: string;
  surface_similarity: number;
  question_similarity: number;
};

/** Same as getFeed but skips cache and returns debug for each item. For ENABLE_DEBUG_ENDPOINTS only. */
export async function getFeedWithDebug(
  userId: string,
  limit: number = feedConfig.feedLimit,
  offset: number = 0
): Promise<Array<FeedItem & { _debug: FeedDebugInfo }>> {
  const candidates = await getCandidates(userId);
  if (candidates.length === 0) return [];
  const { embeddings, profile, weights } = await loadViewerEmbeddingsAndProfile(userId);
  const layer2Scores = new Map<string, number>();
  let layer2Max = 0;
  for (const thought of candidates) {
    const s = scoreThought(thought, embeddings, profile, weights.alpha);
    layer2Scores.set(thought.id, s);
    if (s > layer2Max) layer2Max = s;
  }
  const engagementCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(engagementEvents);
  const totalEngagements = engagementCount[0]?.count ?? 0;
  const isPhase1 =
    embeddings.questionEmbeddings.length < phase1ViewerThoughtThreshold ||
    totalEngagements < phase1SystemEngagementThreshold;
  const phase_used = isPhase1 ? "pre-data" : "learning";

  const withRank: Array<{ thought: ThoughtCandidate; rankScore: number; Q: number; D: number; F: number; R: number }> = [];
  for (const thought of candidates) {
    const layer2 = layer2Scores.get(thought.id) ?? 0;
    if (isPhase1) {
      const rankScore = rankScorePhase1(thought, profile, layer2);
      const f = Math.exp(-feedConfig.freshnessDecayRate * (Date.now() - thought.createdAt.getTime()) / (1000 * 60 * 60));
      const d = profile.cohortYear === thought.authorCohortYear ? 0.3 : profile.cohortYear && thought.authorCohortYear ? 1 : 0.5;
      withRank.push({ thought, rankScore, Q: layer2Max > 0 ? layer2 / layer2Max : 0.5, D: d, F: f, R: 0 });
    } else {
      const debugRank = await rankScorePhase2WithDebug(thought, profile, layer2, weights, layer2Max);
      const f = Math.exp(-feedConfig.freshnessDecayRate * (Date.now() - thought.createdAt.getTime()) / (1000 * 60 * 60));
      withRank.push({
        thought,
        rankScore: debugRank.score,
        Q: debugRank.Q,
        D: debugRank.D,
        F: f,
        R: debugRank.R,
      });
    }
  }
  const byThoughtId = new Map(withRank.map((r) => [r.thought.id, r]));
  const afterDiversity = applyDiversityEnforcement(
    withRank.map(({ thought, rankScore }) => ({ thought, rankScore }))
  );
  const slice = afterDiversity.slice(0, CACHE_MAX_ITEMS);
  const thoughtIds = slice.map((x) => x.thought.id);
  const replyCounts = await getAcceptedReplyCounts(thoughtIds);
  const authorIds = [...new Set(slice.map((x) => x.thought.userId))];
  const authorRows = await db.select().from(users).where(inArray(users.id, authorIds));
  const authorMap = new Map(authorRows.map((u) => [u.id, u]));
  const itemsWithDebug: Array<FeedItem & { _debug: FeedDebugInfo }> = slice.map(({ thought }) => {
    const author = authorMap.get(thought.userId);
    const acceptedCount = replyCounts.get(thought.id) ?? 0;
    const rankInfo = byThoughtId.get(thought.id);
    const sims = getSimilarities(thought, embeddings);
    return {
      thought: {
        id: thought.id,
        sentence: thought.sentence,
        image_url: thought.imageUrl,
        created_at: thought.createdAt.toISOString(),
        has_context: (thought.context ?? "").trim().length > 0,
      },
      user: {
        id: thought.userId,
        name: author?.name ?? null,
        photo_url: author?.photoUrl ?? null,
      },
      warmth_level: getWarmthLevel(acceptedCount),
      _debug: {
        phase_used,
        scores: {
          Q: rankInfo?.Q ?? 0,
          D: rankInfo?.D ?? 0,
          F: rankInfo?.F ?? 0,
          R: rankInfo?.R ?? 0,
          final_rank: rankInfo?.rankScore ?? 0,
        },
        underlying_questions: "",
        surface_similarity: sims.surface_similarity,
        question_similarity: sims.question_similarity,
      },
    };
  });
  return itemsWithDebug.slice(offset, offset + limit);
}
