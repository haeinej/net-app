/**
 * Layer 1 — RETRIEVE: pgvector candidate retrieval (Phase 5).
 * Three-bucket system: Resonance Matches / Adjacent Territory / Wild Cards.
 */

import { and, desc, eq, ne, sql, isNull, or, notInArray } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm";
import { db, thoughts, users, conversations } from "../db";
import { feedConfig, type FeedRuntimeConfig } from "./config";
import { getSimilarities } from "./score";
import type { ThoughtCandidate, ViewerEmbeddings, BucketedCandidate, UserStage } from "./types";

type CandidateRow = {
  id: string;
  userId: string;
  sentence: string;
  context: string | null;
  photoUrl: string | null;
  imageUrl: string | null;
  surfaceEmbedding: unknown;
  questionEmbedding: unknown;
  qualityScore: number | null;
  createdAt: Date | null;
  authorCohortYear: number | null;
  authorConcentration: string | null;
  clusterId: string | null;
};

const candidateSelect = {
  id: thoughts.id,
  userId: thoughts.userId,
  sentence: thoughts.sentence,
  context: thoughts.context,
  photoUrl: thoughts.photoUrl,
  imageUrl: thoughts.imageUrl,
  surfaceEmbedding: thoughts.surfaceEmbedding,
  questionEmbedding: thoughts.questionEmbedding,
  qualityScore: thoughts.qualityScore,
  createdAt: thoughts.createdAt,
  clusterId: thoughts.clusterId,
  authorCohortYear: users.cohortYear,
  authorConcentration: users.concentration,
} as const;

/** Map DB row to ThoughtCandidate (embeddings as number[] from driver). */
function toCandidate(row: CandidateRow): ThoughtCandidate {
  return {
    id: row.id,
    userId: row.userId,
    sentence: row.sentence,
    context: row.context,
    photoUrl: row.photoUrl,
    imageUrl: row.imageUrl,
    surfaceEmbedding: Array.isArray(row.surfaceEmbedding) ? (row.surfaceEmbedding as number[]) : null,
    resonanceEmbedding: Array.isArray(row.questionEmbedding)
      ? (row.questionEmbedding as number[])
      : null,
    qualityScore: row.qualityScore,
    createdAt: row.createdAt ?? new Date(),
    authorCohortYear: row.authorCohortYear,
    authorConcentration: row.authorConcentration,
    clusterId: row.clusterId ?? null,
  };
}

function stableShuffleScore(viewerId: string, thoughtId: string, dayKey: number): number {
  const input = `${viewerId}:${thoughtId}:${dayKey}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 50 most recent thoughts (excluding viewer). */
async function getRecentCandidates(
  viewerId: string,
  config: FeedRuntimeConfig = feedConfig
): Promise<ThoughtCandidate[]> {
  const rows = await db
    .select(candidateSelect)
    .from(thoughts)
    .innerJoin(users, eq(thoughts.userId, users.id))
    .where(and(ne(thoughts.userId, viewerId), isNull(thoughts.deletedAt)))
    .orderBy(desc(thoughts.createdAt))
    .limit(config.recentLimit);
  return rows.map(toCandidate);
}

/** k nearest thoughts by resonance embedding to a single vector (excluding viewer). */
async function getNearestByResonance(
  viewerId: string,
  queryEmbedding: number[],
  k: number
): Promise<ThoughtCandidate[]> {
  const rows = await db
    .select(candidateSelect)
    .from(thoughts)
    .innerJoin(users, eq(thoughts.userId, users.id))
    .where(
      and(
        ne(thoughts.userId, viewerId),
        isNull(thoughts.deletedAt),
        sql`${thoughts.questionEmbedding} IS NOT NULL`
      )
    )
    .orderBy(cosineDistance(thoughts.questionEmbedding, queryEmbedding))
    .limit(k);
  return rows.map(toCandidate);
}

/** k nearest thoughts by surface_embedding (excluding viewer). */
async function getNearestBySurface(
  viewerId: string,
  queryEmbedding: number[],
  k: number
): Promise<ThoughtCandidate[]> {
  const rows = await db
    .select(candidateSelect)
    .from(thoughts)
    .innerJoin(users, eq(thoughts.userId, users.id))
    .where(
      and(
        ne(thoughts.userId, viewerId),
        isNull(thoughts.deletedAt),
        sql`${thoughts.surfaceEmbedding} IS NOT NULL`
      )
    )
    .orderBy(cosineDistance(thoughts.surfaceEmbedding, queryEmbedding))
    .limit(k);
  return rows.map(toCandidate);
}

/** Random quality-filtered thoughts for wild card pool. */
async function getRandomCandidates(
  viewerId: string,
  excludeIds: Set<string>,
  limit: number,
  config: FeedRuntimeConfig = feedConfig
): Promise<ThoughtCandidate[]> {
  const { thoughtActiveDays, thoughtSleepTransitionDays, wildcardMinQuality } = config;
  const maxAgeDays = thoughtActiveDays + thoughtSleepTransitionDays;
  const excludeArr = [...excludeIds];
  const poolLimit = Math.max(limit * 6, 120);
  const dayKey = Math.floor(Date.now() / (24 * 60 * 60 * 1000));

  const conditions = [
    ne(thoughts.userId, viewerId),
    isNull(thoughts.deletedAt),
    sql`${thoughts.qualityScore} >= ${wildcardMinQuality}`,
    sql`${thoughts.createdAt} > now() - interval '${sql.raw(String(maxAgeDays))} days'`,
  ];

  if (excludeArr.length > 0) {
    const limited = excludeArr.slice(0, 200);
    conditions.push(notInArray(thoughts.id, limited));
  }

  const rows = await db
    .select(candidateSelect)
    .from(thoughts)
    .innerJoin(users, eq(thoughts.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(thoughts.createdAt))
    .limit(poolLimit);
  return rows
    .map((row) => ({
      score: stableShuffleScore(viewerId, row.id, dayKey),
      candidate: toCandidate(row),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((row) => row.candidate);
}

export async function getVisibleRecentCandidates(
  viewerId: string,
  excludeIds: Set<string>,
  limit: number,
  blockedUserIds: Set<string> = new Set()
): Promise<ThoughtCandidate[]> {
  if (limit <= 0) return [];

  const conditions = [ne(thoughts.userId, viewerId), isNull(thoughts.deletedAt)];
  const excludeArr = [...excludeIds];
  const blockedArr = [...blockedUserIds];

  if (excludeArr.length > 0) {
    conditions.push(notInArray(thoughts.id, excludeArr.slice(0, 200)));
  }

  if (blockedArr.length > 0) {
    conditions.push(notInArray(thoughts.userId, blockedArr.slice(0, 200)));
  }

  const rows = await db
    .select(candidateSelect)
    .from(thoughts)
    .innerJoin(users, eq(thoughts.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(thoughts.createdAt))
    .limit(limit);

  return rows.map(toCandidate);
}

/** Determine user stage from accepted conversation count. */
async function getUserStage(
  viewerId: string,
  config: FeedRuntimeConfig = feedConfig
): Promise<UserStage> {
  const { stageThresholds } = config;
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(
      or(
        eq(conversations.participantA, viewerId),
        eq(conversations.participantB, viewerId)
      )
    );
  const count = result?.count ?? 0;
  if (count <= stageThresholds.new) return "new";
  if (count <= stageThresholds.building) return "building";
  if (count <= stageThresholds.established) return "established";
  return "wanderer";
}

/** Get IDs of users the viewer has active conversations with. */
async function getActiveConversationUserIds(viewerId: string): Promise<Set<string>> {
  const rows = await db
    .select({
      participantA: conversations.participantA,
      participantB: conversations.participantB,
    })
    .from(conversations)
    .where(
      and(
        or(
          eq(conversations.participantA, viewerId),
          eq(conversations.participantB, viewerId)
        ),
        eq(conversations.isDormant, false)
      )
    );
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.participantA !== viewerId) ids.add(r.participantA);
    if (r.participantB !== viewerId) ids.add(r.participantB);
  }
  return ids;
}

/**
 * Layer 1 (legacy): flat candidate retrieval. Kept for backward compat.
 * Uses a single averaged resonance embedding for the viewer to avoid per-thought kNN queries.
 */
export async function getCandidates(
  viewerId: string,
  limit: number = feedConfig.candidateLimit,
  config: FeedRuntimeConfig = feedConfig
): Promise<ThoughtCandidate[]> {
  const recent = await getRecentCandidates(viewerId, config);

  const viewerThoughts = await db
    .select({
      resonanceEmbedding: thoughts.questionEmbedding,
      surfaceEmbedding: thoughts.surfaceEmbedding,
    })
    .from(thoughts)
    .where(eq(thoughts.userId, viewerId));

  const resonanceVecs = viewerThoughts
    .map((t) =>
      Array.isArray(t.resonanceEmbedding)
        ? (t.resonanceEmbedding as number[])
        : null
    )
    .filter((v): v is number[] => v != null);

  const hasViewerThoughts = resonanceVecs.length > 0;

  const bySimilarity: ThoughtCandidate[] = [];

  if (hasViewerThoughts) {
    const dim = resonanceVecs[0]!.length;
    const sum = new Array(dim).fill(0);
    for (const v of resonanceVecs) {
      for (let i = 0; i < dim; i++) sum[i] += v[i]!;
    }
    const avg = sum.map((x) => x / resonanceVecs.length);
    const batch = await getNearestByResonance(viewerId, avg, limit);
    bySimilarity.push(...batch);
  }

  const bySimilarityIds = new Set(bySimilarity.map((c) => c.id));
  for (const c of recent) {
    if (!bySimilarityIds.has(c.id)) bySimilarity.push(c);
  }

  return bySimilarity.slice(0, limit);
}

/**
 * Three-bucket candidate retrieval.
 * 1. Determine user stage → bucket ratios
 * 2. Pre-filter: exclude active-conversation users, sleeping thoughts
 * 3. Retrieve pool via resonance kNN + recent
 * 4. Assign buckets by resonance similarity + surface distance
 * 5. Fill wild cards from random quality-filtered pool
 */
export async function getBucketedCandidates(
  viewerId: string,
  viewerEmbeddings: ViewerEmbeddings,
  limit: number = feedConfig.candidateLimit,
  config: FeedRuntimeConfig = feedConfig
): Promise<{ candidates: BucketedCandidate[]; stage: UserStage }> {
  const stage = await getUserStage(viewerId, config);
  const activeConvUserIds = await getActiveConversationUserIds(viewerId);

  // Retrieve flat candidate pool (reuse existing logic)
  const recent = await getRecentCandidates(viewerId, config);
  const bySimilarity: ThoughtCandidate[] = [];
  const primaryResonanceEmbedding = viewerEmbeddings.resonanceEmbeddings[0] ?? null;
  const hasViewerThoughts = Boolean(primaryResonanceEmbedding);

  if (hasViewerThoughts) {
    const batch = await getNearestByResonance(viewerId, primaryResonanceEmbedding!, limit);
    bySimilarity.push(...batch);
  }

  // Merge similarity + recent, deduplicate
  const allIds = new Set(bySimilarity.map((c) => c.id));
  for (const c of recent) {
    if (!allIds.has(c.id)) {
      allIds.add(c.id);
      bySimilarity.push(c);
    }
  }

  // Pre-filter: remove thoughts from users with active conversations
  const { thoughtActiveDays, thoughtSleepTransitionDays } = config;
  const maxAgeMs = (thoughtActiveDays + thoughtSleepTransitionDays) * 24 * 60 * 60 * 1000;
  const pool = bySimilarity.filter((c) => {
    if (activeConvUserIds.has(c.userId)) return false;
    // Filter sleeping thoughts (older than active + transition period)
    const ageMs = Date.now() - c.createdAt.getTime();
    if (ageMs > maxAgeMs) return false;
    return true;
  });

  // Compute similarities for bucket assignment
  const {
    resonanceTopFraction,
    adjacentMinResonance,
    adjacentMinSurfaceDistance,
    wildcardMinQuality,
  } = config;

  const scored = pool.map((thought) => {
    const { resonance_similarity, surface_similarity } = getSimilarities(thought, viewerEmbeddings);
    return { thought, resonanceSim: resonance_similarity, surfaceDistance: 1 - surface_similarity };
  });

  // Sort by resonance similarity descending for bucket assignment
  scored.sort((a, b) => b.resonanceSim - a.resonanceSim);

  const bucket1: BucketedCandidate[] = [];
  const bucket2: BucketedCandidate[] = [];
  const remaining: ThoughtCandidate[] = [];

  if (!hasViewerThoughts) {
    // New user: all go to bucket 1 (no resonance signal to differentiate)
    for (const s of scored) {
      bucket1.push({ thought: s.thought, bucket: "resonance" });
    }
  } else {
    const cutoffIndex = Math.max(1, Math.ceil(scored.length * resonanceTopFraction));
    for (let i = 0; i < scored.length; i++) {
      const s = scored[i]!;
      if (i < cutoffIndex) {
        bucket1.push({ thought: s.thought, bucket: "resonance" });
      } else if (s.resonanceSim >= adjacentMinResonance && s.surfaceDistance >= adjacentMinSurfaceDistance) {
        bucket2.push({ thought: s.thought, bucket: "adjacent" });
      } else {
        remaining.push(s.thought);
      }
    }
  }

  // Bucket 3: wild cards from remaining + random DB query
  const ratios = config.bucketRatios[stage];
  const wildcardTarget = Math.max(1, Math.ceil(limit * ratios.wildcard));
  const bucket1And2Ids = new Set([
    ...bucket1.map((c) => c.thought.id),
    ...bucket2.map((c) => c.thought.id),
  ]);

  // Use remaining candidates that pass quality filter
  const bucket3: BucketedCandidate[] = [];
  for (const t of remaining) {
    if (bucket3.length >= wildcardTarget) break;
    if ((t.qualityScore ?? 0) >= wildcardMinQuality) {
      bucket3.push({ thought: t, bucket: "wildcard" });
    }
  }

  // If not enough wild cards from remaining, fetch random from DB
  if (bucket3.length < wildcardTarget) {
    const needed = wildcardTarget - bucket3.length;
    const allExclude = new Set([...bucket1And2Ids, ...bucket3.map((c) => c.thought.id)]);
    const random = await getRandomCandidates(viewerId, allExclude, needed, config);
    for (const t of random) {
      if (!activeConvUserIds.has(t.userId)) {
        bucket3.push({ thought: t, bucket: "wildcard" });
      }
    }
  }

  const candidates = [...bucket1, ...bucket2, ...bucket3];
  return { candidates, stage };
}
