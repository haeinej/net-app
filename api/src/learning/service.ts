/**
 * RecommendationLearningService (Phase 7). Daily and weekly jobs; lock + log.
 */

import { db, learningLog } from "../db";
import { acquireLock, releaseLock } from "./lock";
import { runCrossDomainAffinity, runAdaptiveUserWeights, runTemporalResonance } from "./daily";
import {
  runQuestionClusterDiscovery,
  runCrossClusterAffinity,
} from "./weekly";

const LOCK_ID = "learning-job-runner";

async function log(
  jobType: "daily" | "weekly",
  details: Record<string, unknown>
): Promise<void> {
  await db.insert(learningLog).values({
    jobType,
    details,
  });
}

/**
 * Daily job: cross-domain affinity, adaptive user weights, temporal resonance.
 * Run at 3am UTC. Idempotent. Uses lock to prevent concurrent runs.
 */
export async function runDailyLearning(): Promise<{ ok: boolean; details?: Record<string, unknown> }> {
  const got = await acquireLock("daily", LOCK_ID);
  if (!got) {
    return { ok: false, details: { reason: "lock_held" } };
  }
  try {
    const affinity = await runCrossDomainAffinity();
    const weights = await runAdaptiveUserWeights();
    const resonance = await runTemporalResonance();
    const details = { affinity, weights, resonance };
    await log("daily", details);
    return { ok: true, details };
  } finally {
    await releaseLock("daily");
  }
}

/**
 * Weekly job: question cluster discovery + cross_cluster_affinity.
 * Run Sunday 4am UTC. Idempotent. Uses lock.
 */
export async function runWeeklyLearning(): Promise<{ ok: boolean; details?: Record<string, unknown> }> {
  const got = await acquireLock("weekly", LOCK_ID);
  if (!got) {
    return { ok: false, details: { reason: "lock_held" } };
  }
  try {
    const clusters = await runQuestionClusterDiscovery();
    const crossCluster = await runCrossClusterAffinity();
    const details = { clusters, cross_cluster_affinity: crossCluster };
    await log("weekly", details);
    return { ok: true, details };
  } finally {
    await releaseLock("weekly");
  }
}
