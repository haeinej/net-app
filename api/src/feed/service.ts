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
  systemConfig,
  crossings,
} from "../db";
import { getBucketedCandidates } from "./retrieve";
import { scoreThought } from "./score";
import {
  rankScorePhase1,
  rankScorePhase2WithDebug,
  applyDiversityEnforcement,
  loadCrossDomainAffinityMap,
  loadTemporalResonanceMap,
  loadClusterAffinityMap,
  buildReplyQualityMap,
} from "./rank";
import type { LearningMaps } from "./rank";
import { getSimilarities } from "./score";
import { feedConfig, type FeedRuntimeConfig } from "./config";
import { recordFeedServe } from "./analytics";
import { getActiveRankingConfig, type RankingConfigSnapshot } from "./runtime-config";
import type {
  ThoughtCandidate,
  ViewerEmbeddings,
  ViewerProfile,
  RecommendationWeights,
  FeedItem,
  FeedItemThought,
  BucketLabel,
  FeedPhaseUsed,
  FeedServeTrace,
} from "./types";

/** Cache per user (up to 100 items), 5 min TTL. */
type FeedCacheEntry = {
  items: FeedItem[];
  traces: FeedServeTrace[];
  expiresAt: number;
};

const cache = new Map<string, FeedCacheEntry>();
const CACHE_MAX_ITEMS = 100;
const CACHE_MAX_USERS = 1000;

type FeedRequestOptions = {
  config?: FeedRuntimeConfig;
  configVersion?: string;
  disableServeLogging?: boolean;
  skipCache?: boolean;
};

function getCacheKey(userId: string, configVersion: string): string {
  return `${userId}:${configVersion}`;
}

async function logFeedSlice(
  userId: string,
  traces: FeedServeTrace[],
  offset: number,
  limit: number,
  configVersion: string
): Promise<void> {
  const slice = traces.slice(offset, offset + limit);
  if (slice.length === 0) return;
  try {
    await recordFeedServe(userId, slice, configVersion);
  } catch (error) {
    console.error("recordFeedServe failed", {
      userId,
      configVersion,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function invalidateFeedCache(userId?: string): void {
  if (!userId) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${userId}:`)) {
      cache.delete(key);
    }
  }
}

let totalEngagementEventsCache: { value: number; expiresAt: number } | null = null;

async function getTotalEngagementEvents(
  config: FeedRuntimeConfig = feedConfig
): Promise<number> {
  const now = Date.now();
  if (totalEngagementEventsCache && totalEngagementEventsCache.expiresAt > now) {
    return totalEngagementEventsCache.value;
  }
  const [engRow] = await db
    .select({ value: systemConfig.value })
    .from(systemConfig)
    .where(eq(systemConfig.key, "total_engagement_events"));
  const value = typeof engRow?.value === "number" ? (engRow.value as number) : 0;
  totalEngagementEventsCache = {
    value,
    expiresAt: now + config.cacheTtlSeconds * 1000,
  };
  return value;
}

async function loadViewerEmbeddingsAndProfile(
  viewerId: string,
  config: FeedRuntimeConfig = feedConfig
): Promise<{
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

  const weights: RecommendationWeights = weightsRow[0]
    ? {
        qWeight: weightsRow[0].qWeight ?? config.defaultWeights.qWeight,
        dWeight: weightsRow[0].dWeight ?? config.defaultWeights.dWeight,
        fWeight: weightsRow[0].fWeight ?? config.defaultWeights.fWeight,
        rWeight: weightsRow[0].rWeight ?? config.defaultWeights.rWeight,
        alpha: weightsRow[0].alpha ?? config.defaultWeights.alpha,
      }
    : config.defaultWeights;

  return {
    embeddings: {
      resonanceEmbeddings,
      surfaceEmbeddings,
      interestsEmbedding: null,
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
  offset: number = 0,
  options: FeedRequestOptions = {}
): Promise<FeedItem[]> {
  const activeSnapshot =
    options.config && options.configVersion
      ? ({
          id: null,
          version: options.configVersion,
          name: options.configVersion,
          notes: null,
          is_active: false,
          source: "database",
          config: options.config,
          created_at: null,
          updated_at: null,
          activated_at: null,
        } as RankingConfigSnapshot)
      : await getActiveRankingConfig();
  const runtimeConfig = options.config ?? activeSnapshot.config;
  const configVersion = options.configVersion ?? activeSnapshot.version;
  const cacheKey = getCacheKey(userId, configVersion);

  const hit = options.skipCache ? undefined : cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now() && offset + limit <= hit.items.length) {
    // simple LRU: move this entry to the end of the Map
    cache.delete(cacheKey);
    cache.set(cacheKey, hit);
    if (!options.disableServeLogging) {
      await logFeedSlice(userId, hit.traces, offset, limit, configVersion);
    }
    return hit.items.slice(offset, offset + limit);
  }

  // Load viewer + learning data in parallel
  const [viewerData, affinityMap, resonanceMap, clusterAffinityMap] = await Promise.all([
    loadViewerEmbeddingsAndProfile(userId, runtimeConfig),
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
  const { candidates, stage } = await getBucketedCandidates(
    userId,
    embeddings,
    runtimeConfig.candidateLimit,
    runtimeConfig
  );
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
  const totalEngagements = await getTotalEngagementEvents(runtimeConfig);
  const isPhase1 =
    embeddings.resonanceEmbeddings.length < runtimeConfig.phase1ViewerThoughtThreshold ||
    totalEngagements < runtimeConfig.phase1SystemEngagementThreshold;
  const phaseUsed: FeedPhaseUsed = isPhase1 ? "pre-data" : "learning";

  // Precompute reply quality scores for all candidate thoughts
  const thoughtAuthorConcMap = new Map<string, string | null>();
  const candidateThoughtIds: string[] = [];
  for (const { thought } of candidates) {
    candidateThoughtIds.push(thought.id);
    thoughtAuthorConcMap.set(thought.id, thought.authorConcentration ?? null);
  }
  const replyQualityMap = await buildReplyQualityMap(candidateThoughtIds, thoughtAuthorConcMap);

  // Rank all candidates
  const withRank: Array<{
    thought: ThoughtCandidate;
    rankScore: number;
    bucket: BucketLabel;
    Q: number;
    D: number;
    F: number;
    R: number;
  }> = [];
  for (const { thought, bucket } of candidates) {
    const layer2 = layer2Scores.get(thought.id) ?? 0;
    if (isPhase1) {
      const rankScore = rankScorePhase1(thought, profile, layer2, runtimeConfig);
      withRank.push({
        thought,
        rankScore,
        bucket,
        Q: layer2Max > 0 ? layer2 / layer2Max : 0.5,
        D: 0,
        F: 0,
        R: 0,
      });
      continue;
    }

    const debugRank = rankScorePhase2WithDebug(
      thought,
      profile,
      layer2,
      weights,
      layer2Max,
      maps,
      viewerClusterIds,
      replyQualityMap.get(thought.id),
      runtimeConfig
    );
    withRank.push({
      thought,
      rankScore: debugRank.score,
      bucket,
      Q: debugRank.Q,
      D: debugRank.D,
      F: debugRank.F,
      R: debugRank.R,
    });
  }

  // Split by bucket, apply diversity per bucket
  const b1Items = withRank.filter((x) => x.bucket === "resonance");
  const b2Items = withRank.filter((x) => x.bucket === "adjacent");
  const b3Items = withRank.filter((x) => x.bucket === "wildcard");

  const ratios = runtimeConfig.bucketRatios[stage];
  const targetTotal = CACHE_MAX_ITEMS;
  const b1Count = Math.ceil(targetTotal * ratios.resonance);
  const b2Count = Math.ceil(targetTotal * ratios.adjacent);
  const b3Count = Math.max(1, Math.ceil(targetTotal * ratios.wildcard));

  // Diversity enforcement on main buckets
  const b1Diverse = applyDiversityEnforcement(b1Items, runtimeConfig).slice(0, b1Count);
  const b2Diverse = applyDiversityEnforcement(b2Items, runtimeConfig).slice(0, b2Count);
  // Wild cards: sort by rank but no diversity enforcement (they're already random)
  const b3Sorted = [...b3Items].sort((a, b) => b.rankScore - a.rankScore).slice(0, b3Count);

  // Merge B1+B2 by rank score, then intersperse wild cards
  const mainMerged = [...b1Diverse, ...b2Diverse].sort((a, b) => b.rankScore - a.rankScore);
  const allItems = intersperseWildcards(mainMerged, b3Sorted);

  // Hydrate FeedItemThought
  const slice = allItems.slice(0, CACHE_MAX_ITEMS);
  const candidateMap = new Map(withRank.map((item) => [item.thought.id, item.thought]));
  const rankDebugMap = new Map(
    withRank.map((item) => [
      item.thought.id,
      {
        bucket: item.bucket,
        Q: item.Q,
        D: item.D,
        F: item.F,
        R: item.R,
        final_rank: item.rankScore,
      },
    ])
  );
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
    };
  });

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
  }));

  const byDate = (a: FeedItem, b: FeedItem) => {
    const dateA = a.type === "thought" ? a.thought.created_at : a.crossing.created_at;
    const dateB = b.type === "thought" ? b.thought.created_at : b.crossing.created_at;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  };
  const items = [...thoughtItems, ...crossingItems].sort(byDate).slice(0, CACHE_MAX_ITEMS);

  const traces: FeedServeTrace[] = items.map((item, index) => {
    if (item.type === "crossing") {
      return {
        item_type: "crossing",
        thought_id: null,
        crossing_id: item.crossing.id,
        author_id: null,
        position: index + 1,
        bucket: null,
        stage: null,
        phase_used: null,
        scores: {
          Q: null,
          D: null,
          F: null,
          R: null,
          final_rank: null,
        },
        resonance_similarity: null,
        surface_similarity: null,
      };
    }

    const candidate = candidateMap.get(item.thought.id);
    const rankDebug = rankDebugMap.get(item.thought.id);
    const similarities = candidate
      ? getSimilarities(candidate, embeddings)
      : { resonance_similarity: 0, surface_similarity: 0 };
    return {
      item_type: "thought",
      thought_id: item.thought.id,
      crossing_id: null,
      author_id: item.user.id,
      position: index + 1,
      bucket: rankDebug?.bucket ?? null,
      stage,
      phase_used: phaseUsed,
      scores: {
        Q: rankDebug?.Q ?? null,
        D: rankDebug?.D ?? null,
        F: rankDebug?.F ?? null,
        R: rankDebug?.R ?? null,
        final_rank: rankDebug?.final_rank ?? null,
      },
      resonance_similarity: candidate ? similarities.resonance_similarity : null,
      surface_similarity: candidate ? similarities.surface_similarity : null,
    };
  });

  cache.set(cacheKey, {
    items,
    traces,
    expiresAt: Date.now() + runtimeConfig.cacheTtlSeconds * 1000,
  });
  // bounded LRU: evict oldest user entries when over capacity
  if (cache.size > CACHE_MAX_USERS) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey) cache.delete(oldestKey);
  }
  if (!options.disableServeLogging) {
    await logFeedSlice(userId, traces, offset, limit, configVersion);
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
  offset: number = 0,
  options: FeedRequestOptions = {}
): Promise<Array<FeedItem & { _debug: FeedDebugInfo }>> {
  const activeSnapshot =
    options.config && options.configVersion
      ? ({
          id: null,
          version: options.configVersion,
          name: options.configVersion,
          notes: null,
          is_active: false,
          source: "database",
          config: options.config,
          created_at: null,
          updated_at: null,
          activated_at: null,
        } as RankingConfigSnapshot)
      : await getActiveRankingConfig();
  const runtimeConfig = options.config ?? activeSnapshot.config;

  const [viewerData, affinityMap, resonanceMap, clusterAffinityMap] = await Promise.all([
    loadViewerEmbeddingsAndProfile(userId, runtimeConfig),
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

  const { candidates, stage } = await getBucketedCandidates(
    userId,
    embeddings,
    runtimeConfig.candidateLimit,
    runtimeConfig
  );
  if (candidates.length === 0) return [];

  const layer2Scores = new Map<string, number>();
  let layer2Max = 0;
  for (const { thought } of candidates) {
    const s = scoreThought(thought, embeddings, profile, weights.alpha);
    layer2Scores.set(thought.id, s);
    if (s > layer2Max) layer2Max = s;
  }
  const totalEngagements = await getTotalEngagementEvents(runtimeConfig);
  const isPhase1 =
    embeddings.resonanceEmbeddings.length < runtimeConfig.phase1ViewerThoughtThreshold ||
    totalEngagements < runtimeConfig.phase1SystemEngagementThreshold;
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
      const rankScore = rankScorePhase1(thought, profile, layer2, runtimeConfig);
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
        replyQualityMap.get(thought.id),
        runtimeConfig
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

  const ratios = runtimeConfig.bucketRatios[stage];
  const b1Count = Math.ceil(CACHE_MAX_ITEMS * ratios.resonance);
  const b2Count = Math.ceil(CACHE_MAX_ITEMS * ratios.adjacent);
  const b3Count = Math.max(1, Math.ceil(CACHE_MAX_ITEMS * ratios.wildcard));

  // Build lookup map for extra debug fields before diversity enforcement strips them
  const debugLookup = new Map(withRank.map((x) => [x.thought.id, { bucket: x.bucket, Q: x.Q, D: x.D, F: x.F, R: x.R }]));

  const b1Diverse = applyDiversityEnforcement(b1Items, runtimeConfig).slice(0, b1Count);
  const b2Diverse = applyDiversityEnforcement(b2Items, runtimeConfig).slice(0, b2Count);
  const b3Sorted = [...b3Items].sort((a, b) => b.rankScore - a.rankScore).slice(0, b3Count);

  const mainMerged = [...b1Diverse, ...b2Diverse].sort((a, b) => b.rankScore - a.rankScore);
  const allItems = intersperseWildcards(mainMerged, b3Sorted);
  const slice = allItems.slice(0, CACHE_MAX_ITEMS);

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
