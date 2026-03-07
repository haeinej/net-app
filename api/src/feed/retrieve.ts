/**
 * Layer 1 — RETRIEVE: pgvector candidate retrieval (Phase 5).
 */

import { and, desc, eq, ne, sql, isNull } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm";
import { db, thoughts, users } from "../db";
import { getEmbeddingService } from "../embedding";
import { feedConfig } from "./config";
import type { ThoughtCandidate } from "./types";

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
    questionEmbedding: Array.isArray(t.questionEmbedding) ? (t.questionEmbedding as number[]) : null,
    qualityScore: t.qualityScore,
    createdAt: t.createdAt ?? new Date(),
    authorCohortYear: row.authorCohortYear,
    authorConcentration: row.authorConcentration,
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

/** k nearest thoughts by question_embedding to a single vector (excluding viewer). */
async function getNearestByQuestion(
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

/**
 * Layer 1: get candidate thoughts for scoring.
 * Viewer with thoughts: 100 nearest by question_embedding (union per viewer thought) + 50 recent.
 * New user: 80 nearest by surface_embedding to embedded interests + 50 recent.
 * Deduplicated, excluding viewer's own thoughts.
 */
export async function getCandidates(
  viewerId: string,
  limit: number = candidateLimit
): Promise<ThoughtCandidate[]> {
  const recent = await getRecentCandidates(viewerId);
  const recentIds = new Set(recent.map((c) => c.id));

  const viewerThoughts = await db
    .select({
      questionEmbedding: thoughts.questionEmbedding,
      surfaceEmbedding: thoughts.surfaceEmbedding,
    })
    .from(thoughts)
    .where(eq(thoughts.userId, viewerId));

  const hasViewerThoughts =
    viewerThoughts.length > 0 &&
    viewerThoughts.some((t) => t.questionEmbedding != null && Array.isArray(t.questionEmbedding));

  const bySimilarity: ThoughtCandidate[] = [];

  if (hasViewerThoughts) {
    const perQuery = Math.ceil(limit / Math.max(viewerThoughts.length, 1));
    const seen = new Set<string>();
    for (const row of viewerThoughts) {
      const q = Array.isArray(row.questionEmbedding) ? (row.questionEmbedding as number[]) : null;
      if (!q) continue;
      const batch = await getNearestByQuestion(viewerId, q, perQuery);
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
