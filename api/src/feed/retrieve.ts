/**
 * Layer 1 — RETRIEVE: pgvector candidate retrieval (Phase 5).
 * Three-bucket system: Resonance Matches / Adjacent Territory / Wild Cards.
 */

import { and, desc, eq, ne, sql, isNull, or } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm";
import { db, thoughts, users, conversations } from "../db";
import { getEmbeddingService } from "../embedding";
import { feedConfig } from "./config";
import { getSimilarities } from "./score";
import type { ThoughtCandidate, ViewerEmbeddings, BucketedCandidate, UserStage } from "./types";

const { candidateLimit, recentLimit, newUserSurfaceLimit } = feedConfig;

/** Map DB row to ThoughtCandidate (embeddings as number[] from driver). */
function toCandidate(row: {
  thought: typeof thoughts.$inferSelect;
  authorCohortYear: number | null;
  authorConcentration: string | null;
}): ThoughtCandidate {
  const t = row.thought;
  return {
    id: t.id,
    userId: t.userId,
    sentence: t.sentence,
    context: t.context,
    imageUrl: t.imageUrl,
    surfaceEmbedding: Array.isArray(t.surfaceEmbedding) ? (t.surfaceEmbedding as number[]) : null,
    resonanceEmbedding: Array.isArray(t.questionEmbedding)
      ? (t.questionEmbedding as number[])
      : null,
    qualityScore: t.qualityScore,
    createdAt: t.createdAt ?? new Date(),
    authorCohortYear: row.authorCohortYear,
    authorConcentration: row.authorConcentration,
    clusterId: t.clusterId ?? null,
  };
}

/** 50 most recent thoughts (excluding viewer). */
async function getRecentCandidates(viewerId: string): Promise<ThoughtCandidate[]> {
  const rows = await db
    .select({
      thought: thoughts,
      authorCohortYear: users.cohortYear,
      authorConcentration: users.concentration,
    })
    .from(thoughts)
    .innerJoin(users, eq(thoughts.userId, users.id))
    .where(and(ne(thoughts.userId, viewerId), isNull(thoughts.deletedAt)))
    .orderBy(desc(thoughts.createdAt))
    .limit(recentLimit);
  return rows.map(toCandidate);
}

/** k nearest thoughts by resonance embedding to a single vector (excluding viewer). */
async function getNearestByResonance(
  viewerId: string,
  queryEmbedding: number[],
  k: number
): Promise<ThoughtCandidate[]> {
  const rows = await db
    .select({
      thought: thoughts,
      authorCohortYear: users.cohortYear,
      authorConcentration: users.concentration,
    })
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
    .select({
      thought: thoughts,
      authorCohortYear: users.cohortYear,
      authorConcentration: users.concentration,
    })
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
  limit: number
): Promise<ThoughtCandidate[]> {
  const { thoughtActiveDays, thoughtSleepTransitionDays, wildcardMinQuality } = feedConfig;
  const maxAgeDays = thoughtActiveDays + thoughtSleepTransitionDays;
  const excludeArr = [...excludeIds];

  const baseWhere = and(
    ne(thoughts.userId, viewerId),
    isNull(thoughts.deletedAt),
    sql`${thoughts.qualityScore} >= ${wildcardMinQuality}`,
    sql`${thoughts.createdAt} > now() - interval '${sql.raw(String(maxAgeDays))} days'`,
    excludeArr.length > 0 ? sql`${thoughts.id} NOT IN (${sql.raw(excludeArr.map(id => `'${id}'`).join(","))})` : sql`true`
  );

  const rows = await db
    .select({
      thought: thoughts,
      authorCohortYear: users.cohortYear,
      authorConcentration: users.concentration,
    })
    .from(thoughts)
    .innerJoin(users, eq(thoughts.userId, users.id))
    .where(baseWhere)
    .orderBy(sql`random()`)
    .limit(limit);
  return rows.map(toCandidate);
}

/** Determine user stage from accepted conversation count. */
async function getUserStage(viewerId: string): Promise<UserStage> {
  const { stageThresholds } = feedConfig;
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
 */
export async function getCandidates(
  viewerId: string,
  limit: number = candidateLimit
): Promise<ThoughtCandidate[]> {
  const recent = await getRecentCandidates(viewerId);

  const viewerThoughts = await db
    .select({
      resonanceEmbedding: thoughts.questionEmbedding,
      surfaceEmbedding: thoughts.surfaceEmbedding,
    })
    .from(thoughts)
    .where(eq(thoughts.userId, viewerId));

  const hasViewerThoughts =
    viewerThoughts.length > 0 &&
    viewerThoughts.some(
      (t) => t.resonanceEmbedding != null && Array.isArray(t.resonanceEmbedding)
    );

  const bySimilarity: ThoughtCandidate[] = [];

  if (hasViewerThoughts) {
    const perQuery = Math.ceil(limit / Math.max(viewerThoughts.length, 1));
    const seen = new Set<string>();
    for (const row of viewerThoughts) {
      const q = Array.isArray(row.resonanceEmbedding)
        ? (row.resonanceEmbedding as number[])
        : null;
      if (!q) continue;
      const batch = await getNearestByResonance(viewerId, q, perQuery);
      for (const c of batch) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          bySimilarity.push(c);
        }
      }
    }
  } else {
    const embeddingService = getEmbeddingService();
    const [viewer] = await db
      .select({ interests: users.interests })
      .from(users)
      .where(eq(users.id, viewerId));
    const interestsText = Array.isArray(viewer?.interests)
      ? (viewer!.interests as string[]).filter(Boolean).join(" ")
      : "";
    const interestsEmbedding =
      interestsText.length > 0
        ? await embeddingService.embed(interestsText, "query")
        : await embeddingService.embed("general", "query");
    const batch = await getNearestBySurface(
      viewerId,
      interestsEmbedding,
      newUserSurfaceLimit
    );
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
  limit: number = candidateLimit
): Promise<{ candidates: BucketedCandidate[]; stage: UserStage }> {
  const stage = await getUserStage(viewerId);
  const activeConvUserIds = await getActiveConversationUserIds(viewerId);

  // Retrieve flat candidate pool (reuse existing logic)
  const recent = await getRecentCandidates(viewerId);
  const viewerThoughts = await db
    .select({
      resonanceEmbedding: thoughts.questionEmbedding,
      surfaceEmbedding: thoughts.surfaceEmbedding,
    })
    .from(thoughts)
    .where(eq(thoughts.userId, viewerId));

  const hasViewerThoughts =
    viewerThoughts.length > 0 &&
    viewerThoughts.some(
      (t) => t.resonanceEmbedding != null && Array.isArray(t.resonanceEmbedding)
    );

  const bySimilarity: ThoughtCandidate[] = [];

  if (hasViewerThoughts) {
    const perQuery = Math.ceil(limit / Math.max(viewerThoughts.length, 1));
    const seen = new Set<string>();
    for (const row of viewerThoughts) {
      const q = Array.isArray(row.resonanceEmbedding)
        ? (row.resonanceEmbedding as number[])
        : null;
      if (!q) continue;
      const batch = await getNearestByResonance(viewerId, q, perQuery);
      for (const c of batch) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          bySimilarity.push(c);
        }
      }
    }
  } else {
    const embeddingService = getEmbeddingService();
    const [viewer] = await db
      .select({ interests: users.interests })
      .from(users)
      .where(eq(users.id, viewerId));
    const interestsText = Array.isArray(viewer?.interests)
      ? (viewer!.interests as string[]).filter(Boolean).join(" ")
      : "";
    const interestsEmbedding =
      interestsText.length > 0
        ? await embeddingService.embed(interestsText, "query")
        : await embeddingService.embed("general", "query");
    const batch = await getNearestBySurface(viewerId, interestsEmbedding, newUserSurfaceLimit);
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
  const { thoughtActiveDays, thoughtSleepTransitionDays } = feedConfig;
  const maxAgeMs = (thoughtActiveDays + thoughtSleepTransitionDays) * 24 * 60 * 60 * 1000;
  const pool = bySimilarity.filter((c) => {
    if (activeConvUserIds.has(c.userId)) return false;
    // Filter sleeping thoughts (older than active + transition period)
    const ageMs = Date.now() - c.createdAt.getTime();
    if (ageMs > maxAgeMs) return false;
    return true;
  });

  // Compute similarities for bucket assignment
  const { resonanceTopFraction, adjacentMinResonance, adjacentMinSurfaceDistance, wildcardMinQuality } = feedConfig;

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
  const ratios = feedConfig.bucketRatios[stage];
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
    const random = await getRandomCandidates(viewerId, allExclude, needed);
    for (const t of random) {
      if (!activeConvUserIds.has(t.userId)) {
        bucket3.push({ thought: t, bucket: "wildcard" });
      }
    }
  }

  const candidates = [...bucket1, ...bucket2, ...bucket3];
  return { candidates, stage };
}
