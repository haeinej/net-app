/**
 * Weekly learning job (Phase 7): resonance cluster discovery + cross-cluster affinity.
 * Table names still use the legacy "question" wording for compatibility.
 */

import { sql } from "drizzle-orm";
import { db, thoughts, questionClusters } from "../db";
import { learningConfig } from "./config";

const { weeklyMinThoughtsWithEmbedding } = learningConfig;

/** Discovery only when enough primary resonance embeddings exist. Stub. */
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
  // a) Fetch all primary resonance embeddings, run k-means, pick k by silhouette
  // b) For each cluster get 5 nearest thoughts to centroid, call LLM for label
  // c) Insert question_clusters, update thoughts.cluster_id
  // d) Compute cross_cluster_affinity from conversations
  return { skipped: false, stub: true, total };
}

/** Compute cross-cluster affinity from conversations. Stub until clusters exist. */
export async function runCrossClusterAffinity(): Promise<Record<string, unknown>> {
  const clusterCount = await db.select().from(questionClusters).limit(1);
  if (clusterCount.length === 0) {
    return { skipped: true, reason: "no_clusters" };
  }
  // Stub: for each pair of clusters, count conversations where thought author in cluster_a, replier's recent thought in cluster_b; compute reply_rate, conversation_rate, sustain_rate
  return { skipped: false, stub: true };
}
