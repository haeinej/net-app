/**
 * Analytics for engagement (Phase 6). Internal use only — never expose to users.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db, engagementEvents, replies, thoughts, users, conversations } from "../db";
import type { ThoughtFunnel, UserEngagement } from "./types";

export async function getThoughtFunnel(thoughtId: string): Promise<ThoughtFunnel> {
  const counts = await db
    .select({
      eventType: engagementEvents.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(engagementEvents)
    .where(eq(engagementEvents.thoughtId, thoughtId))
    .groupBy(engagementEvents.eventType);

  const byType = new Map(counts.map((r) => [r.eventType, r.count]));
  const views = byType.get("view_p1") ?? 0;
  const swipe_to_context = byType.get("swipe_p2") ?? 0;
  const swipe_to_replies = byType.get("swipe_p3") ?? 0;
  const typing_started = byType.get("type_start") ?? 0;
  const replies_sent = byType.get("reply_sent") ?? 0;

  const [acceptedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(replies)
    .where(and(eq(replies.thoughtId, thoughtId), eq(replies.status, "accepted")));
  const replies_accepted = acceptedRow?.count ?? 0;

  return {
    views,
    swipe_to_context,
    swipe_to_replies,
    typing_started,
    replies_sent,
    replies_accepted,
    conversion_rates: {
      p1_to_p2: views > 0 ? swipe_to_context / views : 0,
      p2_to_p3: swipe_to_context > 0 ? swipe_to_replies / swipe_to_context : 0,
      p3_to_reply: swipe_to_replies > 0 ? replies_sent / swipe_to_replies : 0,
      reply_to_accepted: replies_sent > 0 ? replies_accepted / replies_sent : 0,
    },
  };
}

export async function getUserEngagementProfile(userId: string): Promise<UserEngagement> {
  const [thoughtsPosted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(thoughts)
    .where(eq(thoughts.userId, userId));
  const total_thoughts_posted = thoughtsPosted?.count ?? 0;

  const [repliesSent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(engagementEvents)
    .where(and(eq(engagementEvents.userId, userId), eq(engagementEvents.eventType, "reply_sent")));
  const total_replies_sent = repliesSent?.count ?? 0;

  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.participantA, userId));
  const convRowsB = await db
    .select()
    .from(conversations)
    .where(eq(conversations.participantB, userId));
  const total_conversations = convRows.length + convRowsB.length;

  const viewRows = await db
    .select({ thoughtId: engagementEvents.thoughtId, eventType: engagementEvents.eventType })
    .from(engagementEvents)
    .where(eq(engagementEvents.userId, userId));
  const views = viewRows.filter((r) => r.eventType === "view_p1").length;
  const swipeP3 = viewRows.filter((r) => r.eventType === "swipe_p3").length;
  const avg_swipe_through_rate = views > 0 ? swipeP3 / views : 0;
  const avg_reply_rate = views > 0 ? total_replies_sent / views : 0;

  const replyEvents = viewRows.filter((r) => r.eventType === "reply_sent");
  const thoughtIdsForReplies = [...new Set(replyEvents.map((r) => r.thoughtId))];
  let cross_cohort = 0;
  let cross_concentration = 0;
  let totalReplyLength = 0;
  let replyLengthCount = 0;
  const [viewer] = await db.select({ cohortYear: users.cohortYear, concentration: users.concentration }).from(users).where(eq(users.id, userId));
  if (thoughtIdsForReplies.length > 0) {
    const authorRows = await db
      .select({ userId: thoughts.userId })
      .from(thoughts)
      .where(inArray(thoughts.id, thoughtIdsForReplies));
    const authorIds = [...new Set(authorRows.map((r) => r.userId))];
    if (authorIds.length > 0) {
      const authors = await db.select({ id: users.id, cohortYear: users.cohortYear, concentration: users.concentration }).from(users).where(inArray(users.id, authorIds));
      const authorMap = new Map(authors.map((a) => [a.id, a]));
      for (const r of authorRows) {
        const a = authorMap.get(r.userId);
        if (a && viewer) {
          if (a.cohortYear !== viewer.cohortYear) cross_cohort++;
          if ((a.concentration ?? "") !== (viewer.concentration ?? "")) cross_concentration++;
        }
      }
      const totalReplies = authorRows.length;
      cross_cohort = totalReplies > 0 ? cross_cohort / totalReplies : 0;
      cross_concentration = totalReplies > 0 ? cross_concentration / totalReplies : 0;
    }
  }
  const metaRows = await db
    .select({ metadata: engagementEvents.metadata })
    .from(engagementEvents)
    .where(and(eq(engagementEvents.userId, userId), eq(engagementEvents.eventType, "reply_sent")));
  for (const r of metaRows) {
    const m = r.metadata as { reply_length_chars?: number } | null;
    if (m && typeof m.reply_length_chars === "number") {
      totalReplyLength += m.reply_length_chars;
      replyLengthCount++;
    }
  }
  const avg_reply_length = replyLengthCount > 0 ? totalReplyLength / replyLengthCount : 0;

  return {
    avg_swipe_through_rate,
    avg_reply_rate,
    cross_cohort_reply_rate: cross_cohort,
    cross_concentration_reply_rate: cross_concentration,
    avg_reply_length,
    total_thoughts_posted,
    total_replies_sent,
    total_conversations,
  };
}
