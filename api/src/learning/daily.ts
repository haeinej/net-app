/**
 * Daily learning job (Phase 7): cross-domain affinity, adaptive user weights, temporal resonance.
 */

import { eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  conversations,
  thoughts,
  users,
  engagementEvents,
  crossDomainAffinity,
  userRecommendationWeights,
  systemConfig,
} from "../db";
import { getUserEngagementProfile } from "../engagement/analytics";
import { learningConfig } from "./config";

const {
  dailyIncrement,
  weightMin,
  weightMax,
  alphaMin,
  alphaMax,
  crossCohortThreshold,
  crossConcentrationThreshold,
  freshContentDays,
  freshContentFraction,
  minEngagementEventsForWeights,
  engagementDaysLookback,
  conversationLookbackHours,
} = learningConfig;

/** 1. Cross-domain affinity from conversations (last 24h). */
export async function runCrossDomainAffinity(): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - conversationLookbackHours * 60 * 60 * 1000);
  const rows = await db
    .select({
      messageCount: conversations.messageCount,
      thoughtId: conversations.thoughtId,
      participantA: conversations.participantA,
      participantB: conversations.participantB,
    })
    .from(conversations)
    .where(gte(conversations.createdAt, since));

  const thoughtAuthors = await db
    .select({ id: thoughts.id, userId: thoughts.userId })
    .from(thoughts)
    .where(
      inArray(
        thoughts.id,
        rows.map((r) => r.thoughtId)
      )
    );
  const thoughtAuthorMap = new Map(thoughtAuthors.map((t) => [t.id, t.userId]));

  const userIds = new Set<string>();
  for (const r of rows) {
    userIds.add(r.participantA);
    userIds.add(r.participantB);
    const author = thoughtAuthorMap.get(r.thoughtId);
    if (author) userIds.add(author);
  }
  const userRows = await db
    .select({ id: users.id, concentration: users.concentration })
    .from(users)
    .where(inArray(users.id, [...userIds]));
  const userConc = new Map(userRows.map((u) => [u.id, (u.concentration ?? "").trim() || "_"]));

  const keyCounts: Map<string, { total: number; sustained: number; depthSum: number }> = new Map();
  function key(a: string, b: string) {
    return [a, b].sort().join("\0");
  }
  for (const r of rows) {
    const author = thoughtAuthorMap.get(r.thoughtId);
    if (!author) continue;
    const replier = r.participantA === author ? r.participantB : r.participantA;
    const concA = userConc.get(author) ?? "_";
    const concB = userConc.get(replier) ?? "_";
    const k = key(concA, concB);
    const msg = r.messageCount ?? 0;
    const entry = keyCounts.get(k) ?? { total: 0, sustained: 0, depthSum: 0 };
    entry.total += 1;
    if (msg >= 10) entry.sustained += 1;
    entry.depthSum += msg;
    keyCounts.set(k, entry);
  }

  const upserted: string[] = [];
  for (const [k, v] of keyCounts) {
    const [concentrationA, concentrationB] = k.split("\0");
    const sustainRate = v.total > 0 ? v.sustained / v.total : 0;
    const avgDepth = v.total > 0 ? v.depthSum / v.total : 0;
    await db
      .insert(crossDomainAffinity)
      .values({
        concentrationA,
        concentrationB,
        totalConversations: v.total,
        sustainedConversations: v.sustained,
        sustainRate,
        avgDepth,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [crossDomainAffinity.concentrationA, crossDomainAffinity.concentrationB],
        set: {
          totalConversations: v.total,
          sustainedConversations: v.sustained,
          sustainRate,
          avgDepth,
          updatedAt: new Date(),
        },
      });
    upserted.push(k);
  }
  return { cross_domain_affinity_rows: upserted.length };
}

/** 2. Adaptive user weights from engagement profile. */
export async function runAdaptiveUserWeights(): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - engagementDaysLookback * 24 * 60 * 60 * 1000);
  const active = await db
    .select({ userId: engagementEvents.userId, count: sql<number>`count(*)::int` })
    .from(engagementEvents)
    .where(gte(engagementEvents.createdAt, since))
    .groupBy(engagementEvents.userId);
  const eligible = active.filter((r) => (r.count ?? 0) >= minEngagementEventsForWeights).map((r) => r.userId);
  if (eligible.length === 0) return { users_updated: 0 };

  const weightChanges: Array<{ userId: string; changes: Record<string, number> }> = [];
  for (const userId of eligible) {
    const profile = await getUserEngagementProfile(userId);
    const [existing] = await db
      .select()
      .from(userRecommendationWeights)
      .where(eq(userRecommendationWeights.userId, userId));
    let q = existing?.qWeight ?? 0.4;
    let d = existing?.dWeight ?? 0.25;
    let f = existing?.fWeight ?? 0.2;
    let r = existing?.rWeight ?? 0.15;
    let alpha = existing?.alpha ?? 0.3;

    if (profile.cross_cohort_reply_rate > crossCohortThreshold) d += dailyIncrement;
    if (profile.cross_concentration_reply_rate > crossConcentrationThreshold) alpha += dailyIncrement;
    // Stub: fresh content and resonance similarity would need event-level data; skip for now
    // if (profile.fresh_engagement_fraction > freshContentFraction) f += dailyIncrement;
    // if (profile.high_q_similarity_engagement) q += dailyIncrement;

    q = Math.max(weightMin, Math.min(weightMax, q));
    d = Math.max(weightMin, Math.min(weightMax, d));
    f = Math.max(weightMin, Math.min(weightMax, f));
    r = Math.max(weightMin, Math.min(weightMax, r));
    alpha = Math.max(alphaMin, Math.min(alphaMax, alpha));
    const sum = q + d + f + r;
    q /= sum;
    d /= sum;
    f /= sum;
    r /= sum;

    await db
      .insert(userRecommendationWeights)
      .values({
        userId,
        qWeight: q,
        dWeight: d,
        fWeight: f,
        rWeight: r,
        alpha,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userRecommendationWeights.userId,
        set: {
          qWeight: q,
          dWeight: d,
          fWeight: f,
          rWeight: r,
          alpha,
          updatedAt: new Date(),
        },
      });
    weightChanges.push({
      userId,
      changes: { qWeight: q, dWeight: d, fWeight: f, rWeight: r, alpha },
    });
  }
  return { users_updated: weightChanges.length, weight_changes: weightChanges };
}

/** 3. Temporal resonance: sustain_rate by cohort_distance; store in system_config. */
export async function runTemporalResonance(): Promise<Record<string, unknown>> {
  const convRows = await db
    .select({
      messageCount: conversations.messageCount,
      participantA: conversations.participantA,
      participantB: conversations.participantB,
    })
    .from(conversations);
  const userIds = new Set<string>();
  for (const r of convRows) {
    userIds.add(r.participantA);
    userIds.add(r.participantB);
  }
  const userRows = await db
    .select({ id: users.id, cohortYear: users.cohortYear })
    .from(users)
    .where(inArray(users.id, [...userIds]));
  const cohortByUser = new Map(userRows.map((u) => [u.id, u.cohortYear]));
  const byDistance = new Map<
    number,
    { total: number; sustained: number; depthSum: number }
  >();
  for (const r of convRows) {
    const ca = cohortByUser.get(r.participantA);
    const cb = cohortByUser.get(r.participantB);
    if (ca == null || cb == null) continue;
    const dist = Math.abs(ca - cb);
    const entry = byDistance.get(dist) ?? { total: 0, sustained: 0, depthSum: 0 };
    entry.total += 1;
    if ((r.messageCount ?? 0) >= 10) entry.sustained += 1;
    entry.depthSum += r.messageCount ?? 0;
    byDistance.set(dist, entry);
  }
  const result = Array.from(byDistance.entries()).map(([cohort_distance, v]) => ({
    cohort_distance,
    total: v.total,
    sustained: v.sustained,
    sustain_rate: v.total > 0 ? v.sustained / v.total : 0,
    avg_depth: v.total > 0 ? v.depthSum / v.total : 0,
  }));
  await db
    .insert(systemConfig)
    .values({
      key: "temporal_resonance",
      value: { by_distance: result },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value: { by_distance: result }, updatedAt: new Date() },
    });
  return { temporal_resonance: result };
}
