"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationRoutes = conversationRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const auth_1 = require("../lib/auth");
const track_1 = require("../engagement/track");
const blocked_users_1 = require("../lib/blocked-users");
const content_filter_1 = require("../lib/content-filter");
const push_1 = require("../lib/push");
const DORMANT_DAYS = 14;
const MESSAGE_PREVIEW_LEN = 100;
const MESSAGE_TEXT_MAX = 2000;
const CROSSING_MESSAGE_STEP = 10;
const AUTO_POSTED_CROSSING_DRAFT_STATUSES = ["auto_posted"];
function getNextCrossingMessageCount(resolvedCrossingCount) {
    return (resolvedCrossingCount + 1) * CROSSING_MESSAGE_STEP;
}
async function markConversationRead(conv, userId) {
    const now = new Date();
    if (conv.participantA === userId) {
        const seenAt = conv.participantASeenAt;
        if (conv.lastMessageAt && seenAt && conv.lastMessageAt <= seenAt)
            return;
        await db_1.db
            .update(db_1.conversations)
            .set({ participantASeenAt: now })
            .where((0, drizzle_orm_1.eq)(db_1.conversations.id, conv.id));
        return;
    }
    if (conv.participantB === userId) {
        const seenAt = conv.participantBSeenAt;
        if (conv.lastMessageAt && seenAt && conv.lastMessageAt <= seenAt)
            return;
        await db_1.db
            .update(db_1.conversations)
            .set({ participantBSeenAt: now })
            .where((0, drizzle_orm_1.eq)(db_1.conversations.id, conv.id));
    }
}
async function conversationRoutes(app) {
    app.addHook("onRequest", auth_1.authenticate);
    app.get("/api/conversations", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const blockedIds = await (0, blocked_users_1.getBlockedUserIds)(userId);
        const rawLimit = parseInt(request.query.limit ?? "50", 10);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
        const beforeId = request.query.before_id;
        let allConvs = [];
        if (beforeId) {
            const [before] = await db_1.db
                .select({
                id: db_1.conversations.id,
                lastMessageAt: db_1.conversations.lastMessageAt,
            })
                .from(db_1.conversations)
                .where((0, drizzle_orm_1.eq)(db_1.conversations.id, beforeId));
            if (!before?.lastMessageAt) {
                allConvs = [];
            }
            else {
                allConvs = await db_1.db
                    .select()
                    .from(db_1.conversations)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.conversations.participantA, userId), (0, drizzle_orm_1.eq)(db_1.conversations.participantB, userId)), (0, drizzle_orm_1.sql) `(${db_1.conversations.lastMessageAt}, ${db_1.conversations.id}) < (${before.lastMessageAt}, ${before.id})`))
                    .orderBy((0, drizzle_orm_1.desc)(db_1.conversations.lastMessageAt), (0, drizzle_orm_1.desc)(db_1.conversations.id))
                    .limit(limit);
            }
        }
        else {
            allConvs = await db_1.db
                .select()
                .from(db_1.conversations)
                .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.conversations.participantA, userId), (0, drizzle_orm_1.eq)(db_1.conversations.participantB, userId)))
                .orderBy((0, drizzle_orm_1.desc)(db_1.conversations.lastMessageAt), (0, drizzle_orm_1.desc)(db_1.conversations.id))
                .limit(limit);
        }
        // Filter out conversations with blocked users
        const list = blockedIds.size > 0
            ? allConvs.filter((c) => {
                const otherId = c.participantA === userId ? c.participantB : c.participantA;
                return !blockedIds.has(otherId);
            })
            : allConvs;
        const convIds = list.map((c) => c.id);
        if (convIds.length === 0)
            return reply.send([]);
        const lastMessages = await db_1.db.execute((0, drizzle_orm_1.sql) `
      select distinct on (conversation_id)
        conversation_id,
        text,
        created_at,
        sender_id
      from messages
      where conversation_id in (${drizzle_orm_1.sql.join(convIds.map((value) => (0, drizzle_orm_1.sql) `${value}`), (0, drizzle_orm_1.sql) `, `)})
      order by conversation_id, created_at desc, id desc
    `);
        const lastByConv = new Map();
        for (const m of lastMessages) {
            if (m.conversation_id && !lastByConv.has(m.conversation_id))
                lastByConv.set(m.conversation_id, {
                    text: m.text,
                    createdAt: m.created_at,
                    senderId: m.sender_id,
                });
        }
        const otherIds = list.map((c) => c.participantA === userId ? c.participantB : c.participantA);
        const otherUsers = otherIds.length
            ? await db_1.db
                .select({ id: db_1.users.id, name: db_1.users.name, photoUrl: db_1.users.photoUrl })
                .from(db_1.users)
                .where((0, drizzle_orm_1.inArray)(db_1.users.id, otherIds))
            : [];
        const userMap = new Map(otherUsers.map((u) => [u.id, u]));
        const cutoff = new Date(Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000);
        const body = list.map((c) => {
            const otherId = c.participantA === userId ? c.participantB : c.participantA;
            const other = userMap.get(otherId);
            const last = lastByConv.get(c.id);
            const seenAt = c.participantA === userId ? c.participantASeenAt : c.participantBSeenAt;
            const unread = Boolean(last &&
                last.senderId &&
                last.senderId !== userId &&
                last.createdAt &&
                (!seenAt || last.createdAt > seenAt));
            return {
                id: c.id,
                other_user: other
                    ? { id: other.id, name: other.name, photo_url: other.photoUrl }
                    : null,
                last_message_preview: last ? last.text.slice(0, MESSAGE_PREVIEW_LEN) : "",
                last_message_at: c.lastMessageAt?.toISOString() ?? null,
                is_dormant: (c.lastMessageAt ? c.lastMessageAt < cutoff : true),
                unread,
            };
        });
        return reply.send(body);
    });
    app.get("/api/conversations/:id", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const convId = request.params.id;
        const [conv] = await db_1.db
            .select()
            .from(db_1.conversations)
            .where((0, drizzle_orm_1.eq)(db_1.conversations.id, convId));
        if (!conv)
            return reply.status(404).send();
        if (conv.participantA !== userId && conv.participantB !== userId)
            return reply.status(403).send();
        await markConversationRead(conv, userId);
        const messageCount = conv.messageCount ?? 0;
        const otherId = conv.participantA === userId ? conv.participantB : conv.participantA;
        // Batch all independent queries in parallel
        const [crossDraftRows, completedCrossingCountRows, autoPostedCrossingCountRows, thoughtRows, otherUserRows,] = await Promise.all([
            db_1.db.select().from(db_1.crossingDrafts).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.conversationId, convId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.status, "draft"), (0, drizzle_orm_1.eq)(db_1.crossingDrafts.status, "awaiting_other")))).orderBy((0, drizzle_orm_1.desc)(db_1.crossingDrafts.updatedAt), (0, drizzle_orm_1.desc)(db_1.crossingDrafts.createdAt)).limit(1),
            db_1.db.select({ count: (0, drizzle_orm_1.sql) `cast(count(*) as int)` }).from(db_1.crossings).where((0, drizzle_orm_1.eq)(db_1.crossings.conversationId, convId)),
            db_1.db.select({ count: (0, drizzle_orm_1.sql) `cast(count(*) as int)` }).from(db_1.crossingDrafts).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.conversationId, convId), (0, drizzle_orm_1.inArray)(db_1.crossingDrafts.status, AUTO_POSTED_CROSSING_DRAFT_STATUSES))),
            db_1.db.select({ id: db_1.thoughts.id, sentence: db_1.thoughts.sentence, photoUrl: db_1.thoughts.photoUrl, imageUrl: db_1.thoughts.imageUrl })
                .from(db_1.thoughts).where((0, drizzle_orm_1.eq)(db_1.thoughts.id, conv.thoughtId)).limit(1),
            db_1.db.select({ name: db_1.users.name, photoUrl: db_1.users.photoUrl }).from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.id, otherId)).limit(1),
        ]);
        const crossDraft = crossDraftRows[0] ?? null;
        const resolvedCrossingCount = Number(completedCrossingCountRows[0]?.count ?? 0) +
            Number(autoPostedCrossingCountRows[0]?.count ?? 0);
        const nextCrossingMessageCount = getNextCrossingMessageCount(resolvedCrossingCount);
        const thought = thoughtRows[0] ?? null;
        const otherUser = otherUserRows[0] ?? null;
        // Initiator name only needed if crossing draft exists
        let initiatorName = null;
        if (crossDraft) {
            const [u] = await db_1.db.select({ name: db_1.users.name }).from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.id, crossDraft.initiatorId)).limit(1);
            initiatorName = u?.name ?? null;
        }
        return reply.send({
            id: conv.id,
            message_count: messageCount,
            participant_a_id: conv.participantA,
            participant_b_id: conv.participantB,
            other_participant: {
                id: otherId,
                name: otherUser?.name ?? null,
                photo_url: otherUser?.photoUrl ?? null,
            },
            thought: thought
                ? {
                    id: thought.id,
                    sentence: thought.sentence,
                    photo_url: thought.photoUrl,
                    image_url: thought.imageUrl,
                }
                : null,
            crossing_draft: crossDraft
                ? {
                    id: crossDraft.id,
                    initiator_id: crossDraft.initiatorId,
                    initiator_name: initiatorName,
                    sentence: crossDraft.sentence,
                    sentence_b: crossDraft.sentenceB ?? null,
                    context: crossDraft.context,
                    status: crossDraft.status,
                    submitted_at: crossDraft.submittedAt?.toISOString() ?? null,
                    auto_post_at: crossDraft.autoPostAt?.toISOString() ?? null,
                    auto_posted_thought_id: crossDraft.autoPostedThoughtId ?? null,
                }
                : null,
            crossing_complete: resolvedCrossingCount > 0,
            crossing_available: Boolean(crossDraft) || messageCount >= nextCrossingMessageCount,
            next_crossing_message_count: nextCrossingMessageCount,
        });
    });
    app.get("/api/conversations/:id/messages", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const convId = request.params.id;
        const [conv] = await db_1.db
            .select()
            .from(db_1.conversations)
            .where((0, drizzle_orm_1.eq)(db_1.conversations.id, convId));
        if (!conv)
            return reply.status(404).send();
        if (conv.participantA !== userId && conv.participantB !== userId)
            return reply.status(403).send();
        await markConversationRead(conv, userId);
        const limit = Math.min(50, Math.max(1, parseInt(request.query.limit ?? "50", 10) || 50));
        const beforeId = request.query.before_id;
        if (beforeId) {
            const [before] = await db_1.db
                .select({ id: db_1.messages.id, createdAt: db_1.messages.createdAt })
                .from(db_1.messages)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.messages.conversationId, convId), (0, drizzle_orm_1.eq)(db_1.messages.id, beforeId)));
            if (before?.createdAt) {
                const rows = await db_1.db
                    .select()
                    .from(db_1.messages)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.messages.conversationId, convId), (0, drizzle_orm_1.sql) `(${db_1.messages.createdAt}, ${db_1.messages.id}) < (${before.createdAt}, ${before.id})`))
                    .orderBy((0, drizzle_orm_1.desc)(db_1.messages.createdAt), (0, drizzle_orm_1.desc)(db_1.messages.id))
                    .limit(limit);
                const out = rows.reverse().map((m) => ({
                    id: m.id,
                    sender_id: m.senderId,
                    text: m.text,
                    metadata: m.metadata ?? null,
                    created_at: m.createdAt?.toISOString(),
                }));
                return reply.send(out);
            }
        }
        const rows = await db_1.db
            .select()
            .from(db_1.messages)
            .where((0, drizzle_orm_1.eq)(db_1.messages.conversationId, convId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.messages.createdAt), (0, drizzle_orm_1.asc)(db_1.messages.id))
            .limit(limit);
        const out = rows.map((m) => ({
            id: m.id,
            sender_id: m.senderId,
            text: m.text,
            metadata: m.metadata ?? null,
            created_at: m.createdAt?.toISOString(),
        }));
        return reply.send(out);
    });
    app.post("/api/conversations/:id/messages", {
        config: {
            rateLimit: {
                max: 30,
                timeWindow: "1 minute",
                keyGenerator: (req) => {
                    const userId = (0, auth_1.getUserId)(req);
                    return userId ? `user:${userId}` : `ip:${req.ip}`;
                },
            },
        },
    }, async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const convId = request.params.id;
        const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
        if (!text)
            return reply.status(400).send({ error: "text required" });
        if (text.length > MESSAGE_TEXT_MAX) {
            return reply.status(400).send({ error: `text max ${MESSAGE_TEXT_MAX} chars` });
        }
        const messageFilter = (0, content_filter_1.filterContent)(text);
        if (messageFilter.flagged) {
            return reply.status(400).send({
                error: "Your message was flagged for potentially objectionable content. Please revise and try again.",
            });
        }
        const [conv] = await db_1.db
            .select()
            .from(db_1.conversations)
            .where((0, drizzle_orm_1.eq)(db_1.conversations.id, convId));
        if (!conv)
            return reply.status(404).send();
        if (conv.participantA !== userId && conv.participantB !== userId)
            return reply.status(403).send();
        const now = new Date();
        const cutoff = new Date(Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000);
        const wasDormant = conv.isDormant === true || (conv.lastMessageAt && conv.lastMessageAt < cutoff);
        const result = await db_1.db.transaction(async (tx) => {
            const [msg] = await tx
                .insert(db_1.messages)
                .values({ conversationId: convId, senderId: userId, text })
                .returning({ id: db_1.messages.id, text: db_1.messages.text, createdAt: db_1.messages.createdAt });
            if (!msg)
                return null;
            const [updatedConversation] = await tx
                .update(db_1.conversations)
                .set({
                lastMessageAt: now,
                messageCount: (0, drizzle_orm_1.sql) `coalesce(${db_1.conversations.messageCount}, 0) + 1`,
                ...(conv.participantA === userId
                    ? { participantASeenAt: now }
                    : { participantBSeenAt: now }),
                ...(wasDormant ? { isDormant: false } : {}),
            })
                .where((0, drizzle_orm_1.eq)(db_1.conversations.id, convId))
                .returning({ messageCount: db_1.conversations.messageCount });
            const newCount = updatedConversation?.messageCount ?? (conv.messageCount ?? 0) + 1;
            // Update materialized conversation stats for this thought
            await tx
                .insert(db_1.thoughtFeedStats)
                .values({
                thoughtId: conv.thoughtId,
                acceptedReplyCount: 0,
                crossDomainAcceptedReplyCount: 0,
                sustainedConversationCount: newCount >= 10 ? 1 : 0,
                maxConversationDepth: newCount,
            })
                .onConflictDoUpdate({
                target: db_1.thoughtFeedStats.thoughtId,
                set: {
                    sustainedConversationCount: newCount >= 10
                        ? (0, drizzle_orm_1.sql) `greatest(thought_feed_stats.sustained_conversation_count, 1)`
                        : db_1.thoughtFeedStats.sustainedConversationCount,
                    maxConversationDepth: (0, drizzle_orm_1.sql) `greatest(thought_feed_stats.max_conversation_depth, ${newCount})`,
                    updatedAt: (0, drizzle_orm_1.sql) `now()`,
                },
            });
            return {
                msg,
                newCount,
            };
        });
        if (!result)
            return reply.status(500).send();
        const { msg, newCount } = result;
        // Push notification to the other participant
        const recipientId = conv.participantA === userId ? conv.participantB : conv.participantA;
        (0, push_1.notifyNewMessage)(recipientId, userId, text, convId).catch((err) => {
            console.error("[push] notifyNewMessage failed:", {
                recipientId,
                senderId: userId,
                conversationId: convId,
                error: err instanceof Error ? err.message : String(err),
            });
        });
        if ([5, 10, 20].includes(newCount)) {
            (0, track_1.trackEngagementEvents)(userId, [{
                    event_type: "reply_sent",
                    thought_id: conv.thoughtId,
                    session_id: "",
                    metadata: { conversation_depth_milestone: newCount, conversation_id: convId },
                    timestamp: new Date().toISOString(),
                }]).catch((err) => {
                console.error("trackEngagementEvents failed", {
                    userId,
                    convId,
                    message: err?.message ?? String(err),
                    code: err?.code,
                });
            });
        }
        return reply.send({
            id: msg.id,
            text: msg.text,
            created_at: msg.createdAt?.toISOString(),
        });
    });
}
