"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replyRoutes = replyRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const feed_1 = require("../feed");
const auth_1 = require("../lib/auth");
const track_1 = require("../engagement/track");
const content_filter_1 = require("../lib/content-filter");
const push_1 = require("../lib/push");
const REPLY_TEXT_MIN = 30;
const REPLY_TEXT_MAX = 300;
function isUniqueViolation(error) {
    return (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505");
}
async function replyRoutes(app) {
    app.addHook("onRequest", auth_1.authenticate);
    app.post("/api/thoughts/:id/reply", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const thoughtId = request.params.id;
        const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
        if (!text)
            return reply.status(400).send({ error: "text required" });
        if (text.length < REPLY_TEXT_MIN) {
            return reply
                .status(400)
                .send({ error: `text min ${REPLY_TEXT_MIN} chars` });
        }
        if (text.length > REPLY_TEXT_MAX)
            return reply.status(400).send({ error: `text max ${REPLY_TEXT_MAX} chars` });
        const textFilter = (0, content_filter_1.filterContent)(text);
        if (textFilter.flagged) {
            return reply.status(400).send({
                error: "Your reply was flagged for potentially objectionable content. Please revise and try again.",
            });
        }
        const [t] = await db_1.db.select().from(db_1.thoughts).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.thoughts.id, thoughtId), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt)));
        if (!t)
            return reply.status(404).send();
        if (t.userId === userId)
            return reply.status(403).send();
        const existing = await db_1.db
            .select()
            .from(db_1.replies)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.replies.thoughtId, thoughtId), (0, drizzle_orm_1.eq)(db_1.replies.replierId, userId), (0, drizzle_orm_1.eq)(db_1.replies.status, "pending")))
            .limit(1);
        if (existing.length > 0)
            return reply.status(409).send();
        const [row] = await db_1.db
            .insert(db_1.replies)
            .values({ thoughtId, replierId: userId, text, status: "pending" })
            .returning({ id: db_1.replies.id, status: db_1.replies.status, createdAt: db_1.replies.createdAt });
        if (!row)
            return reply.status(500).send();
        (0, track_1.trackEngagementEvents)(userId, [
            {
                event_type: "reply_sent",
                thought_id: thoughtId,
                session_id: "",
                metadata: { reply_length_chars: text.length },
                timestamp: new Date().toISOString(),
            },
        ]).catch(() => { });
        // Push notification to thought author
        (0, push_1.notifyNewReply)(t.userId, userId, t.sentence, text, thoughtId).catch((err) => {
            console.error("[push] notifyNewReply failed:", {
                thoughtAuthorId: t.userId,
                replierId: userId,
                thoughtId,
                error: err instanceof Error ? err.message : String(err),
            });
        });
        return reply.status(201).send({
            id: row.id,
            status: "pending",
            created_at: row.createdAt?.toISOString(),
        });
    });
    app.post("/api/replies/:id/accept", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const replyId = request.params.id;
        const accepted = await db_1.db.transaction(async (tx) => {
            const [existingReply] = await tx.select().from(db_1.replies).where((0, drizzle_orm_1.eq)(db_1.replies.id, replyId)).limit(1);
            if (!existingReply)
                return { status: 404 };
            const [thought] = await tx.select().from(db_1.thoughts).where((0, drizzle_orm_1.eq)(db_1.thoughts.id, existingReply.thoughtId)).limit(1);
            if (!thought || thought.userId !== userId)
                return { status: 403 };
            const [acceptedReply] = await tx
                .update(db_1.replies)
                .set({ status: "accepted" })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.replies.id, replyId), (0, drizzle_orm_1.eq)(db_1.replies.status, "pending")))
                .returning();
            if (!acceptedReply) {
                const [existingConversation] = await tx
                    .select({ id: db_1.conversations.id })
                    .from(db_1.conversations)
                    .where((0, drizzle_orm_1.eq)(db_1.conversations.replyId, replyId))
                    .limit(1);
                return existingConversation
                    ? {
                        status: 200,
                        conversationId: existingConversation.id,
                        thoughtId: thought.id,
                        replierId: existingReply.replierId,
                        authorId: thought.userId,
                        trackAcceptance: false,
                    }
                    : { status: 409 };
            }
            const now = new Date();
            let conversationId = null;
            // Check if a conversation already exists between these two users
            const [existingConvForPair] = await tx
                .select({ id: db_1.conversations.id, participantA: db_1.conversations.participantA })
                .from(db_1.conversations)
                .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.conversations.participantA, thought.userId), (0, drizzle_orm_1.eq)(db_1.conversations.participantB, acceptedReply.replierId)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.conversations.participantA, acceptedReply.replierId), (0, drizzle_orm_1.eq)(db_1.conversations.participantB, thought.userId))))
                .limit(1);
            if (existingConvForPair) {
                // Merge into existing conversation
                conversationId = existingConvForPair.id;
                await tx.insert(db_1.messages).values({
                    conversationId,
                    senderId: acceptedReply.replierId,
                    text: acceptedReply.text,
                    metadata: {
                        type: "thought_reply",
                        thoughtId: thought.id,
                        thoughtSentence: thought.sentence,
                        replyId: acceptedReply.id,
                    },
                });
                const isAuthorA = existingConvForPair.participantA === thought.userId;
                await tx
                    .update(db_1.conversations)
                    .set({
                    messageCount: (0, drizzle_orm_1.sql) `coalesce(${db_1.conversations.messageCount}, 0) + 1`,
                    lastMessageAt: now,
                    isDormant: false,
                    ...(isAuthorA
                        ? { participantASeenAt: null }
                        : { participantBSeenAt: null }),
                })
                    .where((0, drizzle_orm_1.eq)(db_1.conversations.id, conversationId));
            }
            else {
                // No existing conversation — create a new one
                let createdConversation = false;
                try {
                    const [created] = await tx
                        .insert(db_1.conversations)
                        .values({
                        thoughtId: thought.id,
                        replyId: acceptedReply.id,
                        participantA: thought.userId,
                        participantB: acceptedReply.replierId,
                        messageCount: 1,
                        lastMessageAt: now,
                        participantASeenAt: now,
                        participantBSeenAt: now,
                    })
                        .returning({ id: db_1.conversations.id });
                    conversationId = created?.id ?? null;
                    createdConversation = Boolean(created);
                }
                catch (error) {
                    if (!isUniqueViolation(error))
                        throw error;
                }
                if (!conversationId) {
                    const [existingConversation] = await tx
                        .select({ id: db_1.conversations.id })
                        .from(db_1.conversations)
                        .where((0, drizzle_orm_1.eq)(db_1.conversations.replyId, acceptedReply.id))
                        .limit(1);
                    conversationId = existingConversation?.id ?? null;
                }
                if (!conversationId) {
                    throw new Error("Failed to create or load conversation for accepted reply");
                }
                if (createdConversation) {
                    await tx.insert(db_1.messages).values({
                        conversationId,
                        senderId: acceptedReply.replierId,
                        text: acceptedReply.text,
                    });
                }
            }
            // Update materialized reply stats for this thought
            const [[author], [replier]] = await Promise.all([
                tx
                    .select({ concentration: db_1.users.concentration })
                    .from(db_1.users)
                    .where((0, drizzle_orm_1.eq)(db_1.users.id, thought.userId))
                    .limit(1),
                tx
                    .select({ concentration: db_1.users.concentration })
                    .from(db_1.users)
                    .where((0, drizzle_orm_1.eq)(db_1.users.id, acceptedReply.replierId))
                    .limit(1),
            ]);
            const authorConc = (author?.concentration ?? "").trim().toLowerCase();
            const replierConc = (replier?.concentration ?? "").trim().toLowerCase();
            const isCrossDomain = authorConc.length > 0 && replierConc.length > 0 && authorConc !== replierConc;
            await tx
                .insert(db_1.thoughtFeedStats)
                .values({
                thoughtId: thought.id,
                acceptedReplyCount: 1,
                crossDomainAcceptedReplyCount: isCrossDomain ? 1 : 0,
                sustainedConversationCount: 0,
                maxConversationDepth: 1,
            })
                .onConflictDoUpdate({
                target: db_1.thoughtFeedStats.thoughtId,
                set: {
                    acceptedReplyCount: (0, drizzle_orm_1.sql) `thought_feed_stats.accepted_reply_count + 1`,
                    crossDomainAcceptedReplyCount: isCrossDomain
                        ? (0, drizzle_orm_1.sql) `thought_feed_stats.cross_domain_accepted_reply_count + 1`
                        : db_1.thoughtFeedStats.crossDomainAcceptedReplyCount,
                    updatedAt: (0, drizzle_orm_1.sql) `now()`,
                },
            });
            return {
                status: 200,
                conversationId,
                thoughtId: thought.id,
                replierId: acceptedReply.replierId,
                authorId: thought.userId,
                trackAcceptance: true,
            };
        });
        if (accepted.status !== 200) {
            return reply.status(accepted.status).send();
        }
        void (0, feed_1.invalidateFeedCache)(accepted.authorId);
        void (0, feed_1.invalidateFeedCache)(accepted.replierId);
        // Check if this thought hit the 10 accepted-reply milestone
        if (accepted.trackAcceptance) {
            (async () => {
                try {
                    const [stats] = await db_1.db
                        .select({ count: db_1.thoughtFeedStats.acceptedReplyCount })
                        .from(db_1.thoughtFeedStats)
                        .where((0, drizzle_orm_1.eq)(db_1.thoughtFeedStats.thoughtId, accepted.thoughtId))
                        .limit(1);
                    const count = stats?.count ?? 0;
                    if (count >= 10 && count <= 12) {
                        const [t] = await db_1.db.select({ sentence: db_1.thoughts.sentence }).from(db_1.thoughts).where((0, drizzle_orm_1.eq)(db_1.thoughts.id, accepted.thoughtId)).limit(1);
                        if (t) {
                            (0, push_1.notifyResonanceMilestone)(accepted.authorId, t.sentence, count, accepted.thoughtId).catch((err) => {
                                console.error("[push] notifyResonanceMilestone failed:", {
                                    authorId: accepted.authorId,
                                    thoughtId: accepted.thoughtId,
                                    count,
                                    error: err instanceof Error ? err.message : String(err),
                                });
                            });
                        }
                    }
                }
                catch (err) {
                    console.error("[push] Resonance milestone check failed:", {
                        thoughtId: accepted.thoughtId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            })();
        }
        if (accepted.trackAcceptance) {
            (0, track_1.trackEngagementEvents)(userId, [{
                    event_type: "reply_accepted",
                    thought_id: accepted.thoughtId,
                    session_id: "",
                    metadata: { reply_id: replyId, replier_id: accepted.replierId },
                    timestamp: new Date().toISOString(),
                }]).catch(() => { });
        }
        return reply.send({ conversation_id: accepted.conversationId });
    });
    const ignoreReply = async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const replyId = request.params.id;
        const [r] = await db_1.db.select().from(db_1.replies).where((0, drizzle_orm_1.eq)(db_1.replies.id, replyId));
        if (!r)
            return reply.status(404).send();
        const [t] = await db_1.db.select().from(db_1.thoughts).where((0, drizzle_orm_1.eq)(db_1.thoughts.id, r.thoughtId));
        if (!t || t.userId !== userId)
            return reply.status(403).send();
        await db_1.db.update(db_1.replies).set({ status: "deleted" }).where((0, drizzle_orm_1.eq)(db_1.replies.id, replyId));
        return reply.status(200).send();
    };
    app.post("/api/replies/:id/ignore", ignoreReply);
    app.post("/api/replies/:id/delete", ignoreReply);
}
