/**
 * Weekly learning job (Phase 7): question cluster discovery + cross_cluster_affinity.
 * Ships as stub; full logic (k-means, silhouette, LLM labels) fills in with real data.
 */

import { sql } from "drizzle-orm";
import { db, thoughts, questionClusters } from "../db";
import { learningConfig } from "./config";

const { weeklyMinThoughtsWithEmbedding } = learningConfig;

/** 4. Question cluster discovery: only when 100+ thoughts with question_embeddings. Stub. */
export async function runQuestionClusterDiscovery(): Promise<Record<string, unknown>> {
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(thoughts)
    .where(sql`${thoughts.questionEmbedding} IS NOT NULL`);
  const total = countRow?.count ?? 0;
  if (total < weeklyMinThoughtsWithEmbedding) {
    return { skipped: true, reason: "insufficient_thoughts", total };
  }
  // Stub: real implementation would:
  // a) Fetch all question_embeddings, run k-means (e.g. ml-kmeans), pick k by silhouette
  // b) For each cluster get 5 nearest thoughts to centroid, call LLM for label
  // c) Insert question_clusters, update thoughts.cluster_id
  // d) Compute cross_cluster_affinity from conversations
  return { skipped: false, stub: true, total };
}

/** Compute cross_cluster_affinity from conversations (thought author cluster × replier cluster). Stub until clusters exist. */
export async function runCrossClusterAffinity(): Promise<Record<string, unknown>> {
  const clusterCount = await db.select().from(questionClusters).limit(1);
  if (clusterCount.length === 0) {
    return { skipped: true, reason: "no_clusters" };
  }
  // Stub: for each pair of clusters, count conversations where thought author in cluster_a, replier's recent thought in cluster_b; compute reply_rate, conversation_rate, sustain_rate
  return { skipped: false, stub: true };
}
