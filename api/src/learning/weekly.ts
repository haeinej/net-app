/**
 * Weekly learning job (Phase 7): resonance cluster discovery + cross-cluster affinity.
 * Table names still use the legacy "question" wording for compatibility.
 */

import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  thoughts,
  questionClusters,
  crossClusterAffinity,
  conversations,
  replies,
} from "../db";
import { llmConfig, complete } from "../llm";
import { learningConfig } from "./config";
import { kmeanspp, nearestToCenter } from "./kmeans";

const {
  weeklyMinThoughtsWithEmbedding,
  clusterKMin,
  clusterKMax,
  samplesPerCluster,
  kmeansMaxIter,
} = learningConfig;

/**
 * Discover resonance clusters via k-means++ on question_embedding vectors.
 * Labels each cluster using LLM on sample thought sentences.
 */
export async function runQuestionClusterDiscovery(): Promise<Record<string, unknown>> {
  // Fetch all thoughts with resonance embeddings
  const rows = await db
    .select({
      id: thoughts.id,
      sentence: thoughts.sentence,
      questionEmbedding: thoughts.questionEmbedding,
    })
    .from(thoughts)
    .where(sql`${thoughts.questionEmbedding} IS NOT NULL`);

  const total = rows.length;
  if (total < weeklyMinThoughtsWithEmbedding) {
    return { skipped: true, reason: "insufficient_thoughts", total };
  }

  // Extract vectors
  const vectors: number[][] = [];
  const thoughtIds: string[] = [];
  const sentences: string[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.questionEmbedding)) continue;
    vectors.push(row.questionEmbedding as number[]);
    thoughtIds.push(row.id);
    sentences.push(row.sentence);
  }

  if (vectors.length < weeklyMinThoughtsWithEmbedding) {
    return { skipped: true, reason: "insufficient_valid_embeddings", count: vectors.length };
  }

  // Determine k
  const k = Math.max(clusterKMin, Math.min(clusterKMax, Math.round(Math.sqrt(vectors.length / 2))));

  // Run k-means++
  const { centroids, assignments } = kmeanspp(vectors, k, kmeansMaxIter);

  // Group thoughts by cluster
  const clusterThoughts: Map<number, { ids: string[]; sentences: string[] }> = new Map();
  for (let i = 0; i < assignments.length; i++) {
    const c = assignments[i]!;
    if (!clusterThoughts.has(c)) clusterThoughts.set(c, { ids: [], sentences: [] });
    clusterThoughts.get(c)!.ids.push(thoughtIds[i]!);
    clusterThoughts.get(c)!.sentences.push(sentences[i]!);
  }

  // Delete old clusters (cascade will not affect FK-less thoughts.cluster_id)
  await db.delete(crossClusterAffinity);
  await db.delete(questionClusters);

  // Insert new clusters + label via LLM
  const clusterIdMap: Map<number, string> = new Map(); // k-means index → DB uuid
  for (let c = 0; c < centroids.length; c++) {
    const centroid = centroids[c]!;
    const group = clusterThoughts.get(c);
    if (!group || group.ids.length === 0) continue;

    // Pick sample thoughts nearest to centroid
    const nearestIdx = nearestToCenter(vectors, centroid, samplesPerCluster);
    const sampleSentences = nearestIdx
      .filter((i) => assignments[i] === c)
      .map((i) => sentences[i]!)
      .slice(0, samplesPerCluster);

    // Label cluster via LLM
    let label = `Cluster ${c + 1}`;
    try {
      const system = "You are labeling a group of related thoughts. Return ONLY a short 3-6 word descriptive label, nothing else.";
      const user = `These thoughts share a common theme:\n${sampleSentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nWhat is the theme?`;
      label = await complete(llmConfig.provider, system, user);
      // Clean up: take first line, strip quotes
      label = label.split("\n")[0]!.replace(/^["']|["']$/g, "").trim() || label;
    } catch {
      // Fallback to generic label
    }

    const [inserted] = await db
      .insert(questionClusters)
      .values({
        centroidEmbedding: centroid,
        label,
        sampleQuestions: sampleSentences,
        thoughtCount: group.ids.length,
      })
      .returning({ id: questionClusters.id });

    if (inserted) {
      clusterIdMap.set(c, inserted.id);
    }
  }

  // Update thoughts.cluster_id
  for (const [c, dbId] of clusterIdMap) {
    const group = clusterThoughts.get(c);
    if (!group) continue;
    // Batch update in chunks of 500
    for (let i = 0; i < group.ids.length; i += 500) {
      const chunk = group.ids.slice(i, i + 500);
      await db
        .update(thoughts)
        .set({ clusterId: dbId })
        .where(inArray(thoughts.id, chunk));
    }
  }

  return {
    skipped: false,
    total_thoughts: vectors.length,
    k,
    clusters: Array.from(clusterIdMap.entries()).map(([c, id]) => ({
      id,
      label: clusterThoughts.get(c)?.sentences.slice(0, 2).join("; ") ?? "",
      count: clusterThoughts.get(c)?.ids.length ?? 0,
    })),
  };
}

/**
 * Compute cross-cluster affinity from conversations.
 * For each (cluster_a, cluster_b) pair: sustain_rate, reply_rate, avg_depth.
 */
export async function runCrossClusterAffinity(): Promise<Record<string, unknown>> {
  const clusterCount = await db.select().from(questionClusters).limit(1);
  if (clusterCount.length === 0) {
    return { skipped: true, reason: "no_clusters" };
  }

  // Get all thoughts with cluster assignments
  const thoughtRows = await db
    .select({ id: thoughts.id, userId: thoughts.userId, clusterId: thoughts.clusterId })
    .from(thoughts)
    .where(sql`${thoughts.clusterId} IS NOT NULL`);
  const thoughtCluster = new Map(thoughtRows.map((t) => [t.id, t.clusterId!]));
  const userThoughts = new Map<string, string[]>();
  for (const t of thoughtRows) {
    if (!userThoughts.has(t.userId)) userThoughts.set(t.userId, []);
    userThoughts.get(t.userId)!.push(t.id);
  }

  // Determine each user's "primary cluster" = cluster of their most recent thought
  const userCluster = new Map<string, string>();
  for (const [userId, ids] of userThoughts) {
    // Last thought in the list (array maintains insertion order; use first cluster found)
    for (const id of ids) {
      const c = thoughtCluster.get(id);
      if (c) {
        userCluster.set(userId, c);
        break;
      }
    }
  }

  // Get conversations + their thought and participants
  const convRows = await db
    .select({
      thoughtId: conversations.thoughtId,
      participantA: conversations.participantA,
      participantB: conversations.participantB,
      messageCount: conversations.messageCount,
    })
    .from(conversations);

  // Count by cluster pair
  const pairStats = new Map<string, { total: number; sustained: number; depthSum: number; replies: number }>();
  function pairKey(a: string, b: string) {
    return [a, b].sort().join("\0");
  }

  for (const conv of convRows) {
    // Get thought's cluster
    const thoughtClusterId = thoughtCluster.get(conv.thoughtId);
    if (!thoughtClusterId) continue;

    // Get replier: the participant who is NOT the thought author
    // participantA is usually the thought author (from reply acceptance flow)
    const replierCluster = userCluster.get(conv.participantB) ?? userCluster.get(conv.participantA);
    if (!replierCluster) continue;

    const key = pairKey(thoughtClusterId, replierCluster);
    const entry = pairStats.get(key) ?? { total: 0, sustained: 0, depthSum: 0, replies: 0 };
    entry.total += 1;
    entry.replies += 1;
    if ((conv.messageCount ?? 0) >= 10) entry.sustained += 1;
    entry.depthSum += conv.messageCount ?? 0;
    pairStats.set(key, entry);
  }

  // Upsert cross_cluster_affinity
  let upserted = 0;
  for (const [key, stats] of pairStats) {
    const [clusterAId, clusterBId] = key.split("\0") as [string, string];
    const sustainRate = stats.total > 0 ? stats.sustained / stats.total : 0;
    const avgDepth = stats.total > 0 ? stats.depthSum / stats.total : 0;

    await db
      .insert(crossClusterAffinity)
      .values({
        clusterAId,
        clusterBId,
        replyRate: stats.replies / Math.max(stats.total, 1),
        conversationRate: stats.total > 0 ? 1.0 : 0,
        sustainRate,
        avgConversationDepth: avgDepth,
      })
      .onConflictDoUpdate({
        target: [crossClusterAffinity.clusterAId, crossClusterAffinity.clusterBId],
        set: {
          replyRate: stats.replies / Math.max(stats.total, 1),
          conversationRate: stats.total > 0 ? 1.0 : 0,
          sustainRate,
          avgConversationDepth: avgDepth,
        },
      });
    upserted++;
  }

  return { skipped: false, pairs_upserted: upserted };
}
