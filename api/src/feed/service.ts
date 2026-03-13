/**
 * FeedService — Phase 5. getFeed orchestrates retrieve → score → rank → diversity → FeedItem[].
 * Three-bucket system with wild card interspersion.
 */

import { and, eq, inArray, sql, or, desc } from "drizzle-orm";
import {
  db,
  thoughts,
  users,
  userRecommendationWeights,
  replies,
  systemConfig,
  shifts,
  crossings,
  crossingReplies,
} from "../db";
import { getEmbeddingService } from "../embedding";
import { getWarmthLevel } from "../lib/warmth";
import { getCandidates, getBucketedCandidates } from "./retrieve";
import { scoreThought } from "./score";
import {
  rankScorePhase1,
  rankScorePhase2,
  rankScorePhase2WithDebug,
  applyDiversityEnforcement,
  loadCrossDomainAffinityMap,
  loadTemporalResonanceMap,
  loadClusterAffinityMap,
  buildReplyQualityMap,
} from "./rank";
import type { LearningMaps } from "./rank";
import { getSimilarities } from "./score";
import { feedConfig } from "./config";
import type {
  ThoughtCandidate,
  ViewerEmbeddings,
  ViewerProfile,
  RecommendationWeights,
  FeedItem,
  FeedItemThought,
  WarmthLevel,
  BucketLabel,
  BucketedCandidate,
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
const CACHE_MAX_USERS = 1000;

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
        resonanceEmbedding: thoughts.questionEmbedding,
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

  const resonanceEmbeddings: number[][] = [];
  const surfaceEmbeddings: number[][] = [];
  for (const t of viewerThoughts) {
    if (Array.isArray(t.resonanceEmbedding)) {
      resonanceEmbeddings.push(t.resonanceEmbedding as number[]);
    }
    if (Array.isArray(t.surfaceEmbedding)) surfaceEmbeddings.push(t.surfaceEmbedding as number[]);
  }

  let interestsEmbedding: number[] | null = null;
  if (resonanceEmbeddings.length === 0 && viewer[0]?.interests) {
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
      resonanceEmbeddings,
      surfaceEmbeddings,
      interestsEmbedding,
    },
    profile,
    weights,
  };
}

/**
 * Intersperse wild cards evenly among main items.
 * Wild cards placed at positions floor(T/(W+1)) * i for i=1..W.
 */
function intersperseWildcards<T>(
  mainItems: T[],
  wildcardItems: T[]
): T[] {
  if (wildcardItems.length === 0) return mainItems;
  const result = [...mainItems];
  const interval = Math.max(1, Math.floor(mainItems.length / (wildcardItems.length + 1)));
  for (let i = 0; i < wildcardItems.length; i++) {
    const pos = Math.min(interval * (i + 1) + i, result.length);
    result.splice(pos, 0, wildcardItems[i]!);
  }
  return result;
}

/**
 * getFeed(userId, limit, offset): Three-bucket pipeline.
 * Load viewer → bucketed retrieve → score → rank per bucket → diversity → intersperse wild cards → FeedItem[].
 */
export async function getFeed(
  userId: string,
  limit: number = feedConfig.feedLimit,
  offset: number = 0
): Promise<FeedItem[]> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now() && offset + limit <= hit.items.length) {
    // simple LRU: move this entry to the end of the Map
    cache.delete(userId);
    cache.set(userId, hit);
    return hit.items.slice(offset, offset + limit);
  }

  // Load viewer + learning data in parallel
  const [viewerData, affinityMap, resonanceMap, clusterAffinityMap] = await Promise.all([
    loadViewerEmbeddingsAndProfile(userId),
    loadCrossDomainAffinityMap(),
    loadTemporalResonanceMap(),
    loadClusterAffinityMap(),
  ]);
  const { embeddings, profile, weights } = viewerData;
  const maps: LearningMaps = { affinityMap, resonanceMap, clusterAffinityMap };

  // Get viewer's cluster IDs for cluster novelty scoring
  const viewerClusterRows = await db
    .select({ clusterId: thoughts.clusterId })
    .from(thoughts)
    .where(and(eq(thoughts.userId, userId), sql`${thoughts.clusterId} IS NOT NULL`));
  const viewerClusterIds = [...new Set(viewerClusterRows.map((r) => r.clusterId!))];

  // Three-bucket retrieval
  const { candidates, stage } = await getBucketedCandidates(userId, embeddings);
  if (candidates.length === 0) return [];

  // Score all candidates
  const layer2Scores = new Map<string, number>();
  let layer2Max = 0;
  for (const { thought } of candidates) {
    const s = scoreThought(thought, embeddings, profile, weights.alpha);
    layer2Scores.set(thought.id, s);
    if (s > layer2Max) layer2Max = s;
  }

  // Phase detection: use aggregated total engagement events from system_config when present
  const [engRow] = await db
    .select({ value: systemConfig.value })
    .from(systemConfig)
    .where(eq(systemConfig.key, "total_engagement_events"));
  const totalEngagements =
    typeof engRow?.value === "number" ? (engRow.value as number) : 0;
  const isPhase1 =
    embeddings.resonanceEmbeddings.length < phase1ViewerThoughtThreshold ||
    totalEngagements < phase1SystemEngagementThreshold;

  // Precompute reply quality scores for all candidate thoughts
  const thoughtAuthorConcMap = new Map<string, string | null>();
  const candidateThoughtIds: string[] = [];
  for (const { thought } of candidates) {
    candidateThoughtIds.push(thought.id);
    thoughtAuthorConcMap.set(thought.id, thought.authorConcentration ?? null);
  }
  const replyQualityMap = await buildReplyQualityMap(candidateThoughtIds, thoughtAuthorConcMap);

  // Rank all candidates
  const bucketMap = new Map<string, BucketLabel>();
  const withRank: Array<{ thought: ThoughtCandidate; rankScore: number; bucket: BucketLabel }> = [];
  for (const { thought, bucket } of candidates) {
    bucketMap.set(thought.id, bucket);
    const layer2 = layer2Scores.get(thought.id) ?? 0;
    const rankScore = isPhase1
      ? rankScorePhase1(thought, profile, layer2)
      : rankScorePhase2(
          thought,
          profile,
          layer2,
          weights,
          layer2Max,
          maps,
          viewerClusterIds,
          replyQualityMap.get(thought.id)
        );
    withRank.push({ thought, rankScore, bucket });
  }

  // Split by bucket, apply diversity per bucket
  const b1Items = withRank.filter((x) => x.bucket === "resonance");
  const b2Items = withRank.filter((x) => x.bucket === "adjacent");
  const b3Items = withRank.filter((x) => x.bucket === "wildcard");

  const ratios = feedConfig.bucketRatios[stage];
  const targetTotal = CACHE_MAX_ITEMS;
  const b1Count = Math.ceil(targetTotal * ratios.resonance);
  const b2Count = Math.ceil(targetTotal * ratios.adjacent);
  const b3Count = Math.max(1, Math.ceil(targetTotal * ratios.wildcard));

  // Diversity enforcement on main buckets
  const b1Diverse = applyDiversityEnforcement(b1Items).slice(0, b1Count);
  const b2Diverse = applyDiversityEnforcement(b2Items).slice(0, b2Count);
  // Wild cards: sort by rank but no diversity enforcement (they're already random)
  const b3Sorted = [...b3Items].sort((a, b) => b.rankScore - a.rankScore).slice(0, b3Count);

  // Merge B1+B2 by rank score, then intersperse wild cards
  const mainMerged = [...b1Diverse, ...b2Diverse].sort((a, b) => b.rankScore - a.rankScore);
  const allItems = intersperseWildcards(mainMerged, b3Sorted);

  // Hydrate FeedItemThought
  const slice = allItems.slice(0, CACHE_MAX_ITEMS);
  const thoughtIds = slice.map((x) => x.thought.id);
  const replyCounts = await getAcceptedReplyCounts(thoughtIds);
  const authorIds = [...new Set(slice.map((x) => x.thought.userId))];
  const authorRows =
    authorIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
          .from(users)
          .where(inArray(users.id, authorIds))
      : [];
  const authorMap = new Map(authorRows.map((u) => [u.id, u]));

  const thoughtItems: FeedItem[] = slice.map(({ thought }) => {
    const author = authorMap.get(thought.userId);
    const acceptedCount = replyCounts.get(thought.id) ?? 0;
    return {
      type: "thought",
      thought: {
        id: thought.id,
        sentence: thought.sentence,
        photo_url: thought.photoUrl,
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

  // Mix in shifts
  const userShifts = await db
    .select()
    .from(shifts)
    .where(or(eq(shifts.participantA, userId), eq(shifts.participantB, userId)))
    .orderBy(desc(shifts.createdAt))
    .limit(CACHE_MAX_ITEMS);
  const shiftUserIds = [...new Set(userShifts.flatMap((s) => [s.participantA, s.participantB]))];
  const shiftUsers = shiftUserIds.length > 0
    ? await db.select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, shiftUserIds))
    : [];
  const shiftUserMap = new Map(shiftUsers.map((u) => [u.id, { id: u.id, name: u.name, photo_url: u.photoUrl }]));
  const shiftItems: FeedItem[] = userShifts.map((s) => ({
    type: "shift",
    id: s.id,
    created_at: s.createdAt?.toISOString() ?? new Date().toISOString(),
    participant_a: {
      ...(shiftUserMap.get(s.participantA) ?? { id: s.participantA, name: null, photo_url: null }),
      before: s.aBefore,
      after: s.aAfter,
    },
    participant_b: {
      ...(shiftUserMap.get(s.participantB) ?? { id: s.participantB, name: null, photo_url: null }),
      before: s.bBefore,
      after: s.bAfter,
    },
  }));

  // Mix in crossings
  const userCrossings = await db
    .select()
    .from(crossings)
    .where(or(eq(crossings.participantA, userId), eq(crossings.participantB, userId)))
    .orderBy(desc(crossings.createdAt))
    .limit(CACHE_MAX_ITEMS);
  const crossingUserIds = [...new Set(userCrossings.flatMap((c) => [c.participantA, c.participantB]))];
  const crossingUsers = crossingUserIds.length > 0
    ? await db.select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, crossingUserIds))
    : [];
  const crossingUserMap = new Map(crossingUsers.map((u) => [u.id, { id: u.id, name: u.name, photo_url: u.photoUrl }]));

  // Count accepted crossing replies for warmth
  const crossingIds = userCrossings.map((c) => c.id);
  const crossingReplyCountRows = crossingIds.length > 0
    ? await db
        .select({ crossingId: crossingReplies.crossingId, count: sql<number>`count(*)::int` })
        .from(crossingReplies)
        .where(and(inArray(crossingReplies.crossingId, crossingIds), eq(crossingReplies.status, "accepted")))
        .groupBy(crossingReplies.crossingId)
    : [];
  const crossingReplyCountMap = new Map(crossingReplyCountRows.map((r) => [r.crossingId, r.count]));

  const crossingItems: FeedItem[] = userCrossings.map((c) => ({
    type: "crossing",
    crossing: {
      id: c.id,
      sentence: c.sentence,
      context: c.context,
      created_at: c.createdAt?.toISOString() ?? new Date().toISOString(),
    },
    participant_a: crossingUserMap.get(c.participantA) ?? { id: c.participantA, name: null, photo_url: null },
    participant_b: crossingUserMap.get(c.participantB) ?? { id: c.participantB, name: null, photo_url: null },
    warmth_level: getWarmthLevel(crossingReplyCountMap.get(c.id) ?? 0),
  }));

  const byDate = (a: FeedItem, b: FeedItem) => {
    const dateA = a.type === "thought" ? a.thought.created_at : a.type === "crossing" ? a.crossing.created_at : a.created_at;
    const dateB = b.type === "thought" ? b.thought.created_at : b.type === "crossing" ? b.crossing.created_at : b.created_at;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  };
  const items = [...thoughtItems, ...shiftItems, ...crossingItems].sort(byDate).slice(0, CACHE_MAX_ITEMS);

  cache.set(userId, {
    items,
    expiresAt: Date.now() + cacheTtlSeconds * 1000,
  });
  // bounded LRU: evict oldest user entries when over capacity
  if (cache.size > CACHE_MAX_USERS) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey) cache.delete(oldestKey);
  }
  return items.slice(offset, offset + limit);
}

export type FeedDebugInfo = {
  phase_used: "pre-data" | "learning";
  bucket: BucketLabel;
  stage: string;
  scores: { Q: number; D: number; F: number; R: number; final_rank: number };
  resonance_summary: string;
  surface_similarity: number;
  resonance_similarity: number;
};

/** Same as getFeed but skips cache and returns debug for each item. For ENABLE_DEBUG_ENDPOINTS only. */
export async function getFeedWithDebug(
  userId: string,
  limit: number = feedConfig.feedLimit,
  offset: number = 0
): Promise<Array<FeedItem & { _debug: FeedDebugInfo }>> {
  const [viewerData, affinityMap, resonanceMap, clusterAffinityMap] = await Promise.all([
    loadViewerEmbeddingsAndProfile(userId),
    loadCrossDomainAffinityMap(),
    loadTemporalResonanceMap(),
    loadClusterAffinityMap(),
  ]);
  const { embeddings, profile, weights } = viewerData;
  const maps: LearningMaps = { affinityMap, resonanceMap, clusterAffinityMap };

  const viewerClusterRows = await db
    .select({ clusterId: thoughts.clusterId })
    .from(thoughts)
    .where(and(eq(thoughts.userId, userId), sql`${thoughts.clusterId} IS NOT NULL`));
  const viewerClusterIds = [...new Set(viewerClusterRows.map((r) => r.clusterId!))];

  const { candidates, stage } = await getBucketedCandidates(userId, embeddings);
  if (candidates.length === 0) return [];

  const layer2Scores = new Map<string, number>();
  let layer2Max = 0;
  for (const { thought } of candidates) {
    const s = scoreThought(thought, embeddings, profile, weights.alpha);
    layer2Scores.set(thought.id, s);
    if (s > layer2Max) layer2Max = s;
  }
  const [engRow] = await db
    .select({ value: systemConfig.value })
    .from(systemConfig)
    .where(eq(systemConfig.key, "total_engagement_events"));
  const totalEngagements =
    typeof engRow?.value === "number" ? (engRow.value as number) : 0;
  const isPhase1 =
    embeddings.resonanceEmbeddings.length < phase1ViewerThoughtThreshold ||
    totalEngagements < phase1SystemEngagementThreshold;
  const phase_used = isPhase1 ? "pre-data" : "learning";

  // Precompute reply quality for debug as well
  const thoughtAuthorConcMap = new Map<string, string | null>();
  const candidateThoughtIds: string[] = [];
  for (const { thought } of candidates) {
    candidateThoughtIds.push(thought.id);
    thoughtAuthorConcMap.set(thought.id, thought.authorConcentration ?? null);
  }
  const replyQualityMap = await buildReplyQualityMap(candidateThoughtIds, thoughtAuthorConcMap);

  const withRank: Array<{ thought: ThoughtCandidate; bucket: BucketLabel; rankScore: number; Q: number; D: number; F: number; R: number }> = [];
  for (const { thought, bucket } of candidates) {
    const layer2 = layer2Scores.get(thought.id) ?? 0;
    if (isPhase1) {
      const rankScore = rankScorePhase1(thought, profile, layer2);
      withRank.push({ thought, bucket, rankScore, Q: layer2Max > 0 ? layer2 / layer2Max : 0.5, D: 0, F: 0, R: 0 });
    } else {
      const debugRank = rankScorePhase2WithDebug(
        thought,
        profile,
        layer2,
        weights,
        layer2Max,
        maps,
        viewerClusterIds,
        replyQualityMap.get(thought.id)
      );
      withRank.push({
        thought,
        bucket,
        rankScore: debugRank.score,
        Q: debugRank.Q,
        D: debugRank.D,
        F: debugRank.F,
        R: debugRank.R,
      });
    }
  }

  // Apply bucket-based assembly with interspersion
  const b1Items = withRank.filter((x) => x.bucket === "resonance");
  const b2Items = withRank.filter((x) => x.bucket === "adjacent");
  const b3Items = withRank.filter((x) => x.bucket === "wildcard");

  const ratios = feedConfig.bucketRatios[stage];
  const b1Count = Math.ceil(CACHE_MAX_ITEMS * ratios.resonance);
  const b2Count = Math.ceil(CACHE_MAX_ITEMS * ratios.adjacent);
  const b3Count = Math.max(1, Math.ceil(CACHE_MAX_ITEMS * ratios.wildcard));

  // Build lookup map for extra debug fields before diversity enforcement strips them
  const debugLookup = new Map(withRank.map((x) => [x.thought.id, { bucket: x.bucket, Q: x.Q, D: x.D, F: x.F, R: x.R }]));

  const b1Diverse = applyDiversityEnforcement(b1Items).slice(0, b1Count);
  const b2Diverse = applyDiversityEnforcement(b2Items).slice(0, b2Count);
  const b3Sorted = [...b3Items].sort((a, b) => b.rankScore - a.rankScore).slice(0, b3Count);

  const mainMerged = [...b1Diverse, ...b2Diverse].sort((a, b) => b.rankScore - a.rankScore);
  const allItems = intersperseWildcards(mainMerged, b3Sorted);
  const slice = allItems.slice(0, CACHE_MAX_ITEMS);

  const thoughtIds = slice.map((x) => x.thought.id);
  const replyCounts = await getAcceptedReplyCounts(thoughtIds);
  const authorIds = [...new Set(slice.map((x) => x.thought.userId))];
  const authorRows = authorIds.length
    ? await db
        .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
        .from(users)
        .where(inArray(users.id, authorIds))
    : [];
  const authorMap = new Map(authorRows.map((u) => [u.id, u]));

  const itemsWithDebug: Array<FeedItemThought & { _debug: FeedDebugInfo }> = slice.map((item) => {
    const { thought, rankScore } = item;
    const debug = debugLookup.get(thought.id) ?? { bucket: "wildcard" as const, Q: 0, D: 0, F: 0, R: 0 };
    const { bucket, Q, D, F, R } = debug;
    const author = authorMap.get(thought.userId);
    const acceptedCount = replyCounts.get(thought.id) ?? 0;
    const sims = getSimilarities(thought, embeddings);
    return {
      type: "thought",
      thought: {
        id: thought.id,
        sentence: thought.sentence,
        photo_url: thought.photoUrl,
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
        bucket,
        stage,
        scores: { Q, D, F, R, final_rank: rankScore },
        resonance_summary: "",
        surface_similarity: sims.surface_similarity,
        resonance_similarity: sims.resonance_similarity,
      },
    };
  });
  return itemsWithDebug.slice(offset, offset + limit);
}
