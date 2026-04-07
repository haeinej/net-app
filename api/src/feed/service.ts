/**
 * FeedService — Phase 5. getFeed orchestrates retrieve → score → rank → diversity → FeedItem[].
 * Three-bucket system with wild card interspersion.
 */

import { eq, inArray, sql, desc, and, isNull, gte } from "drizzle-orm";
import {
  db,
  users,
  userRecommendationWeights,
  systemConfig,
  feedSnapshots,
  manualBoosts,
  thoughts,
  feedServes,
} from "../db";
import {
  getBucketedCandidates,
  getVisibleFallbackCandidates,
  getVisibleRecentCandidates,
} from "./retrieve";
import { flushPendingFeedServes } from "./analytics";
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
  FeedItemUser,
  BucketLabel,
  FeedPhaseUsed,
  FeedServeTrace,
} from "./types";
import { getBlockedUserIds } from "../lib/blocked-users";
import { loadViewerFeedProfile } from "./viewer-profile";
import { computeThoughtFeedSignals } from "../thought-processing/feed-signals";

const FEED_SNAPSHOT_PREFETCH_PAGES = 1;
const FEED_SNAPSHOT_MIN_ITEMS = 3;
const FEED_SNAPSHOT_MAX_ITEMS = 10;

type FeedRequestOptions = {
  config?: FeedRuntimeConfig;
  configVersion?: string;
  disableServeLogging?: boolean;
  skipCache?: boolean;
  anchorThoughtId?: string;
};

type FeedPageResult = {
  items: FeedItem[];
  nextCursor: string | null;
};

type FeedSnapshotRecord = {
  id: string;
  items: FeedItem[];
  traces: FeedServeTrace[];
  hasMore: boolean;
};

type FeedCursorPayload = {
  snapshot_id: string;
  offset: number;
};

function asStoredRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStoredString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStoredNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStoredBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeFeedUser(value: unknown, fallbackId = ""): FeedItemUser {
  const record = asStoredRecord(value);
  return {
    id: asStoredString(record?.id) ?? fallbackId,
    name: asStoredNullableString(record?.name),
    photo_url: asStoredNullableString(record?.photo_url),
  };
}

function sanitizeFeedItem(value: unknown): FeedItem | null {
  const record = asStoredRecord(value);
  const type = asStoredString(record?.type);

  if (type === "thought") {
    const thought = asStoredRecord(record?.thought);
    const id = asStoredString(thought?.id);
    const sentence = asStoredString(thought?.sentence);
    const createdAt = asStoredString(thought?.created_at);

    if (!id || !sentence || !createdAt) return null;

    const item: FeedItemThought = {
      type: "thought",
      thought: {
        id,
        sentence,
        photo_url: asStoredNullableString(thought?.photo_url),
        image_url: asStoredNullableString(thought?.image_url),
        created_at: createdAt,
        has_context: asStoredBoolean(thought?.has_context),
      },
      user: sanitizeFeedUser(record?.user),
    };

    return item;
  }

  return null;
}

function sanitizeFeedItems(value: unknown): FeedItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeFeedItem(item))
    .filter((item): item is FeedItem => item !== null);
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
    void recordFeedServe(userId, slice, configVersion);
  } catch (error) {
    console.error("recordFeedServe failed", {
      userId,
      configVersion,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function invalidateFeedCache(userId?: string): Promise<void> {
  if (!userId) {
    await db.delete(feedSnapshots);
    return;
  }
  await db.delete(feedSnapshots).where(eq(feedSnapshots.viewerId, userId));
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
  viewerClusterIds: string[];
}> {
  const [viewer, weightsRow, viewerFeedProfile] = await Promise.all([
    db.select().from(users).where(eq(users.id, viewerId)).limit(1),
    db
      .select()
      .from(userRecommendationWeights)
      .where(eq(userRecommendationWeights.userId, viewerId))
      .limit(1),
    loadViewerFeedProfile(viewerId),
  ]);

  const profile: ViewerProfile = {
    id: viewerId,
    cohortYear: viewer[0]?.cohortYear ?? null,
    concentration: viewer[0]?.concentration ?? null,
  };

  const defaultWeights: RecommendationWeights = {
    qWeight: config.defaultWeights.qWeight,
    dWeight: config.defaultWeights.dWeight,
    fWeight: config.defaultWeights.fWeight,
    rWeight: config.defaultWeights.rWeight,
    alpha: config.defaultWeights.alpha,
  };

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
    embeddings: viewerFeedProfile.embeddings,
    profile,
    weights,
    viewerClusterIds: viewerFeedProfile.viewerClusterIds,
  };
}

function encodeFeedCursor(snapshotId: string, offset: number): string {
  return Buffer.from(
    JSON.stringify({
      snapshot_id: snapshotId,
      offset,
    } satisfies FeedCursorPayload)
  ).toString("base64url");
}

function decodeFeedCursor(cursor?: string | null): FeedCursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      snapshot_id?: unknown;
      offset?: unknown;
    };
    if (
      typeof parsed.snapshot_id !== "string" ||
      typeof parsed.offset !== "number" ||
      !Number.isFinite(parsed.offset) ||
      parsed.offset < 0
    ) {
      return null;
    }
    return {
      snapshot_id: parsed.snapshot_id,
      offset: Math.floor(parsed.offset),
    };
  } catch {
    return null;
  }
}

function getSnapshotTargetCount(limit: number, offset: number): number {
  const requested = offset + limit * FEED_SNAPSHOT_PREFETCH_PAGES;
  return Math.max(
    FEED_SNAPSHOT_MIN_ITEMS,
    Math.min(FEED_SNAPSHOT_MAX_ITEMS, requested)
  );
}

function toFeedSnapshotRecord(
  row: typeof feedSnapshots.$inferSelect | undefined
): FeedSnapshotRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    items: sanitizeFeedItems(row.items),
    traces: Array.isArray(row.traces) ? (row.traces as FeedServeTrace[]) : [],
    hasMore: row.hasMore,
  };
}

async function getFeedSnapshot(
  viewerId: string,
  snapshotId: string,
  configVersion: string
): Promise<FeedSnapshotRecord | null> {
  const [row] = await db
    .select()
    .from(feedSnapshots)
    .where(
      and(
        eq(feedSnapshots.id, snapshotId),
        eq(feedSnapshots.viewerId, viewerId),
        eq(feedSnapshots.configVersion, configVersion),
        sql`${feedSnapshots.expiresAt} > now()`
      )
    )
    .limit(1);
  return toFeedSnapshotRecord(row);
}

async function getLatestFeedSnapshot(
  viewerId: string,
  configVersion: string
): Promise<FeedSnapshotRecord | null> {
  const [row] = await db
    .select()
    .from(feedSnapshots)
    .where(
      and(
        eq(feedSnapshots.viewerId, viewerId),
        eq(feedSnapshots.configVersion, configVersion),
        sql`${feedSnapshots.expiresAt} > now()`
      )
    )
    .orderBy(desc(feedSnapshots.createdAt))
    .limit(1);
  return toFeedSnapshotRecord(row);
}

async function createFeedSnapshot(
  viewerId: string,
  configVersion: string,
  items: FeedItem[],
  traces: FeedServeTrace[],
  hasMore: boolean,
  ttlSeconds: number
): Promise<FeedSnapshotRecord> {
  await db.delete(feedSnapshots).where(sql`${feedSnapshots.expiresAt} <= now()`);
  const [row] = await db
    .insert(feedSnapshots)
    .values({
      viewerId,
      configVersion,
      items,
      traces,
      hasMore,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    })
    .returning();
  const snapshot = toFeedSnapshotRecord(row);
  if (!snapshot) {
    throw new Error("Failed to persist feed snapshot");
  }
  return snapshot;
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

async function buildFeedSnapshot(
  userId: string,
  targetTotal: number,
  runtimeConfig: FeedRuntimeConfig,
  anchorThoughtId?: string
): Promise<{ items: FeedItem[]; traces: FeedServeTrace[]; hasMore: boolean }> {
  const [viewerData, affinityMap, resonanceMap, clusterAffinityMap] = await Promise.all([
    loadViewerEmbeddingsAndProfile(userId, runtimeConfig),
    loadCrossDomainAffinityMap(),
    loadTemporalResonanceMap(),
    loadClusterAffinityMap(),
  ]);
  let { embeddings } = viewerData;
  const { profile, weights, viewerClusterIds } = viewerData;

  // Anchor-biased retrieval: when a user just posted, use the new thought's
  // embeddings as the primary retrieval vectors so the feed refreshes with
  // cards resonant to what they just created.
  if (anchorThoughtId) {
    const [anchor] = await db
      .select({
        sentence: thoughts.sentence,
        context: thoughts.context,
        surfaceEmbedding: thoughts.surfaceEmbedding,
        questionEmbedding: thoughts.questionEmbedding,
      })
      .from(thoughts)
      .where(eq(thoughts.id, anchorThoughtId))
      .limit(1);

    let anchorResonanceEmbedding = Array.isArray(anchor?.questionEmbedding)
      ? (anchor.questionEmbedding as number[])
      : null;
    let anchorSurfaceEmbedding = Array.isArray(anchor?.surfaceEmbedding)
      ? (anchor.surfaceEmbedding as number[])
      : null;

    if (
      anchor &&
      (!anchorResonanceEmbedding || !anchorSurfaceEmbedding)
    ) {
      try {
        const computed = await computeThoughtFeedSignals(
          anchor.sentence,
          anchor.context
        );
        anchorResonanceEmbedding ??= computed.questionEmbedding;
        anchorSurfaceEmbedding ??= computed.surfaceEmbedding;

        void db
          .update(thoughts)
          .set({
            surfaceEmbedding: computed.surfaceEmbedding,
            questionEmbedding: computed.questionEmbedding,
            qualityScore: computed.qualityScore,
          })
          .where(eq(thoughts.id, anchorThoughtId))
          .catch((error) => {
            console.error("persist anchor feed signals failed", {
              anchorThoughtId,
              message: error instanceof Error ? error.message : String(error),
            });
          });
      } catch (error) {
        console.error("computeThoughtFeedSignals for anchor failed", {
          anchorThoughtId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (anchorResonanceEmbedding) {
      embeddings = {
        ...embeddings,
        resonanceEmbeddings: [anchorResonanceEmbedding],
        surfaceEmbeddings: anchorSurfaceEmbedding
          ? [anchorSurfaceEmbedding]
          : embeddings.surfaceEmbeddings,
      };
    }
  }
  const maps: LearningMaps = { affinityMap, resonanceMap, clusterAffinityMap };
  const candidateLimit = Math.max(
    runtimeConfig.candidateLimit,
    Math.min(targetTotal * 2, 400)
  );

  const { candidates: rawCandidates, stage } = await getBucketedCandidates(
    userId,
    embeddings,
    candidateLimit,
    runtimeConfig
  );

  if (rawCandidates.length === 0) {
    console.warn(`[feed] getBucketedCandidates returned 0 candidates for viewer ${userId} (stage=${stage})`);
  }

  const blockedUserIds = await getBlockedUserIds(userId);
  const afterBlocked = blockedUserIds.size > 0
    ? rawCandidates.filter((candidate) => !blockedUserIds.has(candidate.thought.userId))
    : rawCandidates;

  // Exclude thoughts served in the last 3 days — same card shouldn't reappear
  // for at least 3 days. When not enough fresh candidates exist, fall back to
  // least-recently-served ordering so users see the stalest cards first.
  await flushPendingFeedServes();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const recentlyServed = await db
    .select({ thoughtId: feedServes.thoughtId, servedAt: feedServes.servedAt })
    .from(feedServes)
    .where(
      and(
        eq(feedServes.viewerId, userId),
        gte(feedServes.servedAt, threeDaysAgo),
        sql`${feedServes.thoughtId} IS NOT NULL`
      )
    );
  const servedThoughtIds = new Set<string>(
    recentlyServed
      .map((r) => r.thoughtId)
      .filter((thoughtId): thoughtId is string => typeof thoughtId === "string")
  );
  let candidates = afterBlocked;
  if (servedThoughtIds.size > 0) {
    const filtered = afterBlocked.filter((c) => !servedThoughtIds.has(c.thought.id));
    if (filtered.length >= targetTotal) {
      candidates = filtered;
    } else {
      // Not enough fresh candidates — include served ones but prefer least-recently-served
      const servedAtMap = new Map<string, Date>();
      for (const r of recentlyServed) {
        if (r.thoughtId && r.servedAt) {
          const existing = servedAtMap.get(r.thoughtId);
          if (!existing || r.servedAt > existing) {
            servedAtMap.set(r.thoughtId, r.servedAt);
          }
        }
      }
      candidates = [...afterBlocked].sort((a, b) => {
        const aServed = servedAtMap.get(a.thought.id);
        const bServed = servedAtMap.get(b.thought.id);
        if (!aServed && !bServed) return 0;
        if (!aServed) return -1;  // never served → show first
        if (!bServed) return 1;
        return aServed.getTime() - bServed.getTime();  // oldest serve first
      });
    }
  }

  const layer2Scores = new Map<string, number>();
  let layer2Max = 0;
  for (const { thought } of candidates) {
    const score = scoreThought(thought, embeddings, profile, weights.alpha);
    layer2Scores.set(thought.id, score);
    if (score > layer2Max) layer2Max = score;
  }

  const totalEngagements = await getTotalEngagementEvents(runtimeConfig);
  const isPhase1 =
    embeddings.resonanceEmbeddings.length < runtimeConfig.phase1ViewerThoughtThreshold ||
    totalEngagements < runtimeConfig.phase1SystemEngagementThreshold;
  const phaseUsed: FeedPhaseUsed = isPhase1 ? "pre-data" : "learning";

  const thoughtAuthorConcMap = new Map<string, string | null>();
  const candidateThoughtIds: string[] = [];
  for (const { thought } of candidates) {
    candidateThoughtIds.push(thought.id);
    thoughtAuthorConcMap.set(thought.id, thought.authorConcentration ?? null);
  }
  const replyQualityMap = await buildReplyQualityMap(candidateThoughtIds, thoughtAuthorConcMap);


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
        Q: Math.min(1, Math.max(0, layer2)),
        D: 0.5,
        F: 0.1,
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

  const b1Items = withRank.filter((item) => item.bucket === "resonance");
  const b2Items = withRank.filter((item) => item.bucket === "adjacent");
  const b3Items = withRank.filter((item) => item.bucket === "wildcard");

  const ratios = runtimeConfig.bucketRatios[stage];
  const b1Count = Math.ceil(targetTotal * ratios.resonance);
  const b2Count = Math.ceil(targetTotal * ratios.adjacent);
  const b3Count = Math.max(1, Math.ceil(targetTotal * ratios.wildcard));

  const b1Diverse = applyDiversityEnforcement(b1Items, runtimeConfig).slice(0, b1Count);
  const b2Diverse = applyDiversityEnforcement(b2Items, runtimeConfig).slice(0, b2Count);
  const b3Sorted = [...b3Items]
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, b3Count);

  // Daily shuffle: date-seeded jitter so cards rotate each day but stay stable within a day
  const dayKey = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const stableJitter = (thoughtId: string) => {
    let hash = 2166136261;
    const input = `${userId}:${thoughtId}:${dayKey}`;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) / 0xffffffff) * 0.15;
  };
  const mainMerged = [...b1Diverse, ...b2Diverse].sort(
    (a, b) => (b.rankScore + stableJitter(b.thought.id)) - (a.rankScore + stableJitter(a.thought.id))
  );
  const selectedThoughts = intersperseWildcards(mainMerged, b3Sorted);

  if (selectedThoughts.length < targetTotal) {
    // First fallback: quality-sorted candidates (exclude already selected, but NOT served)
    const fallbackExcludeIds = new Set(
      selectedThoughts.map((item) => item.thought.id)
    );
    const additionalThoughts = await getVisibleFallbackCandidates(
      userId,
      fallbackExcludeIds,
      targetTotal - selectedThoughts.length,
      blockedUserIds,
      runtimeConfig
    );

    for (const thought of additionalThoughts) {
      selectedThoughts.push({
        thought,
        rankScore: Number.NEGATIVE_INFINITY,
      });
    }
  }

  // Ultimate fallback: if still empty, get ANY recent thoughts (skip all filters)
  if (selectedThoughts.length === 0) {
    console.warn(`[feed] Pipeline produced 0 items for viewer ${userId}, using last-resort fallback`);
    const lastResort = await getVisibleRecentCandidates(
      userId,
      new Set(),
      targetTotal,
      blockedUserIds
    );
    for (const thought of lastResort) {
      selectedThoughts.push({
        thought,
        rankScore: Number.NEGATIVE_INFINITY,
      });
    }
  }

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

  const authorIds = [...new Set(selectedThoughts.map((item) => item.thought.userId))];
  const authorRows =
    authorIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
          .from(users)
          .where(inArray(users.id, authorIds))
      : [];
  const authorMap = new Map(authorRows.map((user) => [user.id, user]));

  // Fetch parent thought info for replies (in_response_to)
  const parentIds = [
    ...new Set(
      selectedThoughts
        .map((item) => item.thought.inResponseToId)
        .filter((id): id is string => id != null)
    ),
  ];
  const parentRows =
    parentIds.length > 0
      ? await db
          .select({
            id: thoughts.id,
            sentence: thoughts.sentence,
            userId: thoughts.userId,
          })
          .from(thoughts)
          .where(inArray(thoughts.id, parentIds))
      : [];
  // Also fetch parent authors
  const parentAuthorIds = [...new Set(parentRows.map((r) => r.userId))];
  const parentAuthorRows =
    parentAuthorIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
          .from(users)
          .where(inArray(users.id, parentAuthorIds))
      : [];
  const parentAuthorMap = new Map(parentAuthorRows.map((u) => [u.id, u]));
  const parentMap = new Map(
    parentRows.map((r) => {
      const pAuthor = parentAuthorMap.get(r.userId);
      return [
        r.id,
        {
          id: r.id,
          sentence: r.sentence,
          user: {
            id: r.userId,
            name: pAuthor?.name ?? null,
            photo_url: pAuthor?.photoUrl ?? null,
          },
        },
      ];
    })
  );

  const thoughtItems: FeedItem[] = selectedThoughts.map(({ thought }) => {
    const author = authorMap.get(thought.userId);
    const parentInfo = thought.inResponseToId
      ? parentMap.get(thought.inResponseToId) ?? null
      : null;
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
      in_response_to: parentInfo,
    };
  });

  const hasMore = thoughtItems.length > targetTotal;
  const items = thoughtItems.slice(0, targetTotal);

  // ── Manual boost injection (Wizard of Oz) ──
  const pendingBoosts = await db
    .select({ boostId: manualBoosts.id, thoughtId: manualBoosts.thoughtId })
    .from(manualBoosts)
    .where(and(eq(manualBoosts.targetUserId, userId), isNull(manualBoosts.consumedAt)));

  if (pendingBoosts.length > 0) {
    const existingIds = new Set(items.filter((i): i is FeedItemThought => i.type === "thought").map((i) => i.thought.id));
    const boostIds = pendingBoosts.map((b) => b.thoughtId).filter((id) => !existingIds.has(id));

    if (boostIds.length > 0) {
      const boostedRows = await db
        .select({ id: thoughts.id, sentence: thoughts.sentence, photoUrl: thoughts.photoUrl, imageUrl: thoughts.imageUrl, context: thoughts.context, createdAt: thoughts.createdAt, userId: thoughts.userId })
        .from(thoughts)
        .where(inArray(thoughts.id, boostIds));

      const authorIds = [...new Set(boostedRows.map((t) => t.userId))];
      const authors = authorIds.length > 0
        ? await db.select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, authorIds))
        : [];
      const authorMap = new Map(authors.map((u) => [u.id, u]));

      const boostItems: FeedItemThought[] = boostedRows.map((t) => {
        const author = authorMap.get(t.userId);
        return {
          type: "thought" as const,
          thought: {
            id: t.id,
            sentence: t.sentence,
            photo_url: t.photoUrl,
            image_url: t.imageUrl,
            created_at: t.createdAt?.toISOString() ?? new Date().toISOString(),
            has_context: (t.context ?? "").trim().length > 0,
          },
          user: { id: t.userId, name: author?.name ?? null, photo_url: author?.photoUrl ?? null },
        };
      });

      items.unshift(...boostItems);
    }

    await db.update(manualBoosts).set({ consumedAt: new Date() }).where(inArray(manualBoosts.id, pendingBoosts.map((b) => b.boostId)));
  }

  const traces: FeedServeTrace[] = items.map((item, index) => {
    const thoughtItem = item as FeedItemThought;
    const candidate = candidateMap.get(thoughtItem.thought.id);
    const rankDebug = rankDebugMap.get(thoughtItem.thought.id);
    const similarities = candidate
      ? getSimilarities(candidate, embeddings)
      : { resonance_similarity: 0, surface_similarity: 0 };

    return {
      item_type: "thought",
      thought_id: thoughtItem.thought.id,
      crossing_id: null,
      author_id: thoughtItem.user.id,
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

  return { items, traces, hasMore };
}

/**
 * getFeed(userId, limit, cursor): cursor + snapshot pagination.
 */
export async function getFeed(
  userId: string,
  limit: number = feedConfig.feedLimit,
  cursor?: string | null,
  options: FeedRequestOptions = {}
): Promise<FeedPageResult> {
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
  const decodedCursor = decodeFeedCursor(cursor);
  const offset = decodedCursor?.offset ?? 0;
  let snapshot =
    !options.skipCache && decodedCursor?.snapshot_id
      ? await getFeedSnapshot(userId, decodedCursor.snapshot_id, configVersion)
      : null;

  if (!snapshot && !options.skipCache) {
    snapshot = await getLatestFeedSnapshot(userId, configVersion);
  }

  if (!snapshot || snapshot.items.length < offset + limit) {
    const targetTotal = getSnapshotTargetCount(limit, offset);
    const built = await buildFeedSnapshot(userId, targetTotal, runtimeConfig, options.anchorThoughtId);
    snapshot = await createFeedSnapshot(
      userId,
      configVersion,
      built.items,
      built.traces,
      built.hasMore,
      runtimeConfig.cacheTtlSeconds
    );
  }

  const items = snapshot.items.slice(offset, offset + limit);
  if (items.length === 0) {
    return {
      items: [],
      nextCursor: null,
    };
  }
  const nextOffset = offset + items.length;
  const hasMore =
    nextOffset < snapshot.items.length ||
    (nextOffset === snapshot.items.length && snapshot.hasMore);
  const nextCursor = hasMore ? encodeFeedCursor(snapshot.id, nextOffset) : null;

  if (!options.disableServeLogging) {
    void logFeedSlice(userId, snapshot.traces, offset, limit, configVersion);
  }
  return {
    items,
    nextCursor,
  };
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
  const { embeddings, profile, weights, viewerClusterIds } = viewerData;
  const maps: LearningMaps = { affinityMap, resonanceMap, clusterAffinityMap };

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
      withRank.push({
        thought,
        bucket,
        rankScore,
        Q: Math.min(1, Math.max(0, layer2)),
        D: 0.5,
        F: 0.1,
        R: 0,
      });
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
  const targetTotal = FEED_SNAPSHOT_MAX_ITEMS;
  const b1Count = Math.ceil(targetTotal * ratios.resonance);
  const b2Count = Math.ceil(targetTotal * ratios.adjacent);
  const b3Count = Math.max(1, Math.ceil(targetTotal * ratios.wildcard));

  // Build lookup map for extra debug fields before diversity enforcement strips them
  const debugLookup = new Map(withRank.map((x) => [x.thought.id, { bucket: x.bucket, Q: x.Q, D: x.D, F: x.F, R: x.R }]));

  const b1Diverse = applyDiversityEnforcement(b1Items, runtimeConfig).slice(0, b1Count);
  const b2Diverse = applyDiversityEnforcement(b2Items, runtimeConfig).slice(0, b2Count);
  const b3Sorted = [...b3Items].sort((a, b) => b.rankScore - a.rankScore).slice(0, b3Count);

  const mainMerged = [...b1Diverse, ...b2Diverse].sort((a, b) => b.rankScore - a.rankScore);
  const allItems = intersperseWildcards(mainMerged, b3Sorted);
  const slice = allItems.slice(0, targetTotal);

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
