"use strict";
/**
 * Analytics for engagement (Phase 6). Internal use only — never expose to users.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getThoughtFunnel = getThoughtFunnel;
exports.getUserEngagementProfile = getUserEngagementProfile;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
async function getThoughtFunnel(thoughtId) {
    const counts = await db_1.db
        .select({
        eventType: db_1.engagementEvents.eventType,
        count: (0, drizzle_orm_1.sql) `count(*)::int`,
    })
        .from(db_1.engagementEvents)
        .where((0, drizzle_orm_1.eq)(db_1.engagementEvents.thoughtId, thoughtId))
        .groupBy(db_1.engagementEvents.eventType);
    const byType = new Map(counts.map((r) => [r.eventType, r.count]));
    const views = byType.get("view_p1") ?? 0;
    const swipe_to_context = byType.get("swipe_p2") ?? 0;
    const swipe_to_replies = byType.get("swipe_p3") ?? 0;
    const typing_started = byType.get("type_start") ?? 0;
    const replies_sent = byType.get("reply_sent") ?? 0;
    const [acceptedRow] = await db_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(db_1.replies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.replies.thoughtId, thoughtId), (0, drizzle_orm_1.eq)(db_1.replies.status, "accepted")));
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
async function getUserEngagementProfile(userId) {
    const [thoughtsPosted] = await db_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(db_1.thoughts)
        .where((0, drizzle_orm_1.eq)(db_1.thoughts.userId, userId));
    const total_thoughts_posted = thoughtsPosted?.count ?? 0;
    const [repliesSent] = await db_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(db_1.engagementEvents)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.engagementEvents.userId, userId), (0, drizzle_orm_1.eq)(db_1.engagementEvents.eventType, "reply_sent")));
    const total_replies_sent = repliesSent?.count ?? 0;
    const convRows = await db_1.db
        .select()
        .from(db_1.conversations)
        .where((0, drizzle_orm_1.eq)(db_1.conversations.participantA, userId));
    const convRowsB = await db_1.db
        .select()
        .from(db_1.conversations)
        .where((0, drizzle_orm_1.eq)(db_1.conversations.participantB, userId));
    const total_conversations = convRows.length + convRowsB.length;
    const viewRows = await db_1.db
        .select({ thoughtId: db_1.engagementEvents.thoughtId, eventType: db_1.engagementEvents.eventType })
        .from(db_1.engagementEvents)
        .where((0, drizzle_orm_1.eq)(db_1.engagementEvents.userId, userId));
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
    const [viewer] = await db_1.db.select({ cohortYear: db_1.users.cohortYear, concentration: db_1.users.concentration }).from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.id, userId));
    if (thoughtIdsForReplies.length > 0) {
        const authorRows = await db_1.db
            .select({ userId: db_1.thoughts.userId })
            .from(db_1.thoughts)
            .where((0, drizzle_orm_1.inArray)(db_1.thoughts.id, thoughtIdsForReplies));
        const authorIds = [...new Set(authorRows.map((r) => r.userId))];
        if (authorIds.length > 0) {
            const authors = await db_1.db.select({ id: db_1.users.id, cohortYear: db_1.users.cohortYear, concentration: db_1.users.concentration }).from(db_1.users).where((0, drizzle_orm_1.inArray)(db_1.users.id, authorIds));
            const authorMap = new Map(authors.map((a) => [a.id, a]));
            for (const r of authorRows) {
                const a = authorMap.get(r.userId);
                if (a && viewer) {
                    if (a.cohortYear !== viewer.cohortYear)
                        cross_cohort++;
                    if ((a.concentration ?? "") !== (viewer.concentration ?? ""))
                        cross_concentration++;
                }
            }
            const totalReplies = authorRows.length;
            cross_cohort = totalReplies > 0 ? cross_cohort / totalReplies : 0;
            cross_concentration = totalReplies > 0 ? cross_concentration / totalReplies : 0;
        }
    }
    const metaRows = await db_1.db
        .select({ metadata: db_1.engagementEvents.metadata })
        .from(db_1.engagementEvents)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.engagementEvents.userId, userId), (0, drizzle_orm_1.eq)(db_1.engagementEvents.eventType, "reply_sent")));
    for (const r of metaRows) {
        const m = r.metadata;
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
