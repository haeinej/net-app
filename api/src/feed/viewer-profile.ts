import { and, desc, eq, isNull } from "drizzle-orm";
import { db, thoughts, userFeedProfiles } from "../db";
import type { ViewerEmbeddings } from "./types";

const RECENT_CLUSTER_LIMIT = 12;

type StoredViewerFeedProfile = {
  embeddings: ViewerEmbeddings;
  viewerClusterIds: string[];
  embeddedThoughtCount: number;
};

function isVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number");
}

function computeCentroid(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dims = vectors[0]?.length ?? 0;
  if (dims === 0) return null;
  const sum = new Array<number>(dims).fill(0);
  for (const vector of vectors) {
    if (vector.length !== dims) continue;
    for (let i = 0; i < dims; i++) {
      sum[i] += vector[i] ?? 0;
    }
  }
  return sum.map((value) => value / vectors.length);
}

function toStoredProfile(
  row: typeof userFeedProfiles.$inferSelect | undefined
): StoredViewerFeedProfile {
  const resonance = isVector(row?.resonanceCentroid) ? [row.resonanceCentroid] : [];
  const surface = isVector(row?.surfaceCentroid) ? [row.surfaceCentroid] : [];
  return {
    embeddings: {
      resonanceEmbeddings: resonance,
      surfaceEmbeddings: surface,
      interestsEmbedding: null,
    },
    viewerClusterIds: Array.isArray(row?.recentClusterIds)
      ? row.recentClusterIds.filter((clusterId): clusterId is string => typeof clusterId === "string")
      : [],
    embeddedThoughtCount: row?.embeddedThoughtCount ?? 0,
  };
}

export async function rebuildViewerFeedProfile(
  userId: string
): Promise<StoredViewerFeedProfile> {
  const rows = await db
    .select({
      resonanceEmbedding: thoughts.questionEmbedding,
      surfaceEmbedding: thoughts.surfaceEmbedding,
      clusterId: thoughts.clusterId,
    })
    .from(thoughts)
    .where(and(eq(thoughts.userId, userId), isNull(thoughts.deletedAt)))
    .orderBy(desc(thoughts.createdAt));

  const resonanceVectors: number[][] = [];
  const surfaceVectors: number[][] = [];
  const recentClusterIds: string[] = [];

  for (const row of rows) {
    if (isVector(row.resonanceEmbedding)) resonanceVectors.push(row.resonanceEmbedding);
    if (isVector(row.surfaceEmbedding)) surfaceVectors.push(row.surfaceEmbedding);
    if (
      row.clusterId &&
      !recentClusterIds.includes(row.clusterId) &&
      recentClusterIds.length < RECENT_CLUSTER_LIMIT
    ) {
      recentClusterIds.push(row.clusterId);
    }
  }

  const resonanceCentroid = computeCentroid(resonanceVectors);
  const surfaceCentroid = computeCentroid(surfaceVectors);
  const embeddedThoughtCount = rows.filter(
    (row) => isVector(row.resonanceEmbedding) || isVector(row.surfaceEmbedding)
  ).length;

  await db
    .insert(userFeedProfiles)
    .values({
      userId,
      resonanceCentroid,
      surfaceCentroid,
      recentClusterIds,
      embeddedThoughtCount,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userFeedProfiles.userId,
      set: {
        resonanceCentroid,
        surfaceCentroid,
        recentClusterIds,
        embeddedThoughtCount,
        updatedAt: new Date(),
      },
    });

  return {
    embeddings: {
      resonanceEmbeddings: resonanceCentroid ? [resonanceCentroid] : [],
      surfaceEmbeddings: surfaceCentroid ? [surfaceCentroid] : [],
      interestsEmbedding: null,
    },
    viewerClusterIds: recentClusterIds,
    embeddedThoughtCount,
  };
}

export async function loadViewerFeedProfile(
  userId: string
): Promise<StoredViewerFeedProfile> {
  const row = await db
    .select()
    .from(userFeedProfiles)
    .where(eq(userFeedProfiles.userId, userId))
    .then((rows) => rows[0]);

  if (!row) {
    return rebuildViewerFeedProfile(userId);
  }

  return toStoredProfile(row);
}

export async function invalidateViewerFeedProfile(userId?: string): Promise<void> {
  if (!userId) {
    await db.delete(userFeedProfiles);
    return;
  }
  await db.delete(userFeedProfiles).where(eq(userFeedProfiles.userId, userId));
}
