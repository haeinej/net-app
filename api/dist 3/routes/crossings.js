"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crossingRoutes = crossingRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const auth_1 = require("../lib/auth");
const feed_1 = require("../feed");
const content_filter_1 = require("../lib/content-filter");
const CROSSING_CONTEXT_MAX = 600;
const CROSSING_SENTENCE_MAX = 200;
const CROSSING_MESSAGE_STEP = 10;
const CROSSING_AUTO_POST_DAYS = 3;
const ACTIVE_CROSSING_DRAFT_STATUSES = ["draft", "awaiting_other"];
const AUTO_POSTED_CROSSING_DRAFT_STATUSES = ["auto_posted"];
const REPLY_TEXT_MIN = 30;
const REPLY_TEXT_MAX = 300;
function getNextCrossingMessageCount(resolvedCrossingCount) {
    return (resolvedCrossingCount + 1) * CROSSING_MESSAGE_STEP;
}
function isUniqueViolation(error) {
    return (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505");
}
async function getConvAndParticipant(request, reply) {
    const userId = (0, auth_1.getUserId)(request);
    if (!userId) {
        reply.status(401).send();
        return null;
    }
    const convId = request.params.id;
    const [conv] = await db_1.db.select().from(db_1.conversations).where((0, drizzle_orm_1.eq)(db_1.conversations.id, convId)).limit(1);
    if (!conv) {
        reply.status(404).send();
        return null;
    }
    if (conv.participantA !== userId && conv.participantB !== userId) {
        reply.status(403).send();
        return null;
    }
    return {
        convId,
        userId,
        participantA: conv.participantA,
        participantB: conv.participantB,
        messageCount: conv.messageCount ?? 0,
    };
}
function serializeCrossingDraft(draft, initiatorName) {
    return {
        id: draft.id,
        initiator_id: draft.initiatorId,
        initiator_name: initiatorName,
        sentence: draft.sentence,
        sentence_b: draft.sentenceB ?? null,
        context: draft.context,
        status: draft.status,
        submitted_at: draft.submittedAt?.toISOString() ?? null,
        auto_post_at: draft.autoPostAt?.toISOString() ?? null,
        auto_posted_thought_id: draft.autoPostedThoughtId ?? null,
    };
}
function serializeCrossing(crossing) {
    return {
        id: crossing.id,
        sentence: crossing.sentence,
        sentence_a: crossing.sentenceA ?? crossing.sentence,
        sentence_b: crossing.sentenceB ?? null,
        context: crossing.context ?? null,
        image_url: crossing.imageUrl ?? null,
        created_at: crossing.createdAt?.toISOString() ?? null,
    };
}
async function crossingRoutes(app) {
    app.addHook("onRequest", auth_1.authenticate);
    // ——— Crossing ———
    app.post("/api/conversations/:id/crossing/start", async (request, reply) => {
        const ctx = await getConvAndParticipant(request, reply);
        if (!ctx)
            return;
        const result = await db_1.db.transaction(async (tx) => {
            const [existing] = await tx
                .select()
                .from(db_1.crossingDrafts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.conversationId, ctx.convId), (0, drizzle_orm_1.inArray)(db_1.crossingDrafts.status, ACTIVE_CROSSING_DRAFT_STATUSES)))
                .orderBy((0, drizzle_orm_1.desc)(db_1.crossingDrafts.updatedAt), (0, drizzle_orm_1.desc)(db_1.crossingDrafts.createdAt))
                .limit(1);
            if (existing) {
                const [initiator] = await tx
                    .select({ name: db_1.users.name })
                    .from(db_1.users)
                    .where((0, drizzle_orm_1.eq)(db_1.users.id, existing.initiatorId))
                    .limit(1);
                return {
                    status: 200,
                    body: serializeCrossingDraft(existing, initiator?.name ?? null),
                };
            }
            const [completedCrossingCountRow] = await tx
                .select({
                count: (0, drizzle_orm_1.sql) `cast(count(*) as int)`,
            })
                .from(db_1.crossings)
                .where((0, drizzle_orm_1.eq)(db_1.crossings.conversationId, ctx.convId));
            const [autoPostedCrossingCountRow] = await tx
                .select({
                count: (0, drizzle_orm_1.sql) `cast(count(*) as int)`,
            })
                .from(db_1.crossingDrafts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.conversationId, ctx.convId), (0, drizzle_orm_1.inArray)(db_1.crossingDrafts.status, AUTO_POSTED_CROSSING_DRAFT_STATUSES)));
            const resolvedCrossingCount = Number(completedCrossingCountRow?.count ?? 0) +
                Number(autoPostedCrossingCountRow?.count ?? 0);
            const nextCrossingMessageCount = getNextCrossingMessageCount(resolvedCrossingCount);
            if (ctx.messageCount < nextCrossingMessageCount) {
                return {
                    status: 403,
                    body: { error: `conversation needs ${nextCrossingMessageCount}+ messages` },
                };
            }
            try {
                const [draft] = await tx
                    .insert(db_1.crossingDrafts)
                    .values({
                    conversationId: ctx.convId,
                    initiatorId: ctx.userId,
                    status: "draft",
                })
                    .returning();
                if (!draft)
                    return { status: 500, body: undefined };
                return {
                    status: 200,
                    body: serializeCrossingDraft(draft, null),
                };
            }
            catch (error) {
                if (!isUniqueViolation(error))
                    throw error;
                const [draft] = await tx
                    .select()
                    .from(db_1.crossingDrafts)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.conversationId, ctx.convId), (0, drizzle_orm_1.inArray)(db_1.crossingDrafts.status, ACTIVE_CROSSING_DRAFT_STATUSES)))
                    .orderBy((0, drizzle_orm_1.desc)(db_1.crossingDrafts.updatedAt), (0, drizzle_orm_1.desc)(db_1.crossingDrafts.createdAt))
                    .limit(1);
                if (!draft) {
                    return { status: 409, body: { error: "crossing already started" } };
                }
                const [initiator] = await tx
                    .select({ name: db_1.users.name })
                    .from(db_1.users)
                    .where((0, drizzle_orm_1.eq)(db_1.users.id, draft.initiatorId))
                    .limit(1);
                return {
                    status: 200,
                    body: serializeCrossingDraft(draft, initiator?.name ?? null),
                };
            }
        });
        return reply.status(result.status).send(result.body);
    });
    app.get("/api/conversations/:id/crossing", async (request, reply) => {
        const ctx = await getConvAndParticipant(request, reply);
        if (!ctx)
            return;
        const [draft] = await db_1.db
            .select()
            .from(db_1.crossingDrafts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.conversationId, ctx.convId), (0, drizzle_orm_1.inArray)(db_1.crossingDrafts.status, ACTIVE_CROSSING_DRAFT_STATUSES)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.crossingDrafts.updatedAt), (0, drizzle_orm_1.desc)(db_1.crossingDrafts.createdAt))
            .limit(1);
        if (!draft)
            return reply.status(404).send();
        const [initiator] = await db_1.db
            .select({ name: db_1.users.name })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, draft.initiatorId))
            .limit(1);
        return reply.send(serializeCrossingDraft(draft, initiator?.name ?? null));
    });
    app.put("/api/conversations/:id/crossing", async (request, reply) => {
        const ctx = await getConvAndParticipant(request, reply);
        if (!ctx)
            return;
        const body = request.body ?? {};
        const [draft] = await db_1.db
            .select()
            .from(db_1.crossingDrafts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.conversationId, ctx.convId), (0, drizzle_orm_1.inArray)(db_1.crossingDrafts.status, ACTIVE_CROSSING_DRAFT_STATUSES)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.crossingDrafts.updatedAt), (0, drizzle_orm_1.desc)(db_1.crossingDrafts.createdAt))
            .limit(1);
        if (!draft)
            return reply.status(404).send();
        const isInitiator = draft.initiatorId === ctx.userId;
        // Initiator edits sentence_a, other participant edits sentence_b
        const sentenceField = typeof body.sentence === "string" ? body.sentence.trim() || null : null;
        const context = typeof body.context === "string"
            ? body.context.slice(0, CROSSING_CONTEXT_MAX).trim() || null
            : draft.context;
        if (sentenceField && sentenceField.length > CROSSING_SENTENCE_MAX) {
            return reply
                .status(400)
                .send({ error: `sentence max ${CROSSING_SENTENCE_MAX} chars` });
        }
        if (sentenceField) {
            const sentenceFilter = (0, content_filter_1.filterContent)(sentenceField);
            if (sentenceFilter.flagged) {
                return reply.status(400).send({
                    error: "Your crossing was flagged for potentially objectionable content. Please revise and try again.",
                });
            }
        }
        if (context) {
            const contextFilter = (0, content_filter_1.filterContent)(context);
            if (contextFilter.flagged) {
                return reply.status(400).send({
                    error: "Your context was flagged for potentially objectionable content. Please revise and try again.",
                });
            }
        }
        const updateSet = {
            updatedAt: new Date(),
        };
        if (isInitiator) {
            if (sentenceField !== null)
                updateSet.sentence = sentenceField;
            if (context !== undefined)
                updateSet.context = context;
        }
        else {
            // Other participant can only edit sentence_b
            if (sentenceField !== null)
                updateSet.sentenceB = sentenceField;
        }
        await db_1.db
            .update(db_1.crossingDrafts)
            .set(updateSet)
            .where((0, drizzle_orm_1.eq)(db_1.crossingDrafts.id, draft.id));
        return reply.send({ ok: true });
    });
    app.post("/api/conversations/:id/crossing/complete", async (request, reply) => {
        const ctx = await getConvAndParticipant(request, reply);
        if (!ctx)
            return;
        const inputSentence = typeof request.body?.sentence === "string" ? request.body.sentence.trim() : "";
        const inputContext = typeof request.body?.context === "string"
            ? request.body.context.slice(0, CROSSING_CONTEXT_MAX).trim() || undefined
            : undefined;
        const result = await db_1.db.transaction(async (tx) => {
            const [draft] = await tx
                .select()
                .from(db_1.crossingDrafts)
                .where((0, drizzle_orm_1.eq)(db_1.crossingDrafts.conversationId, ctx.convId))
                .orderBy((0, drizzle_orm_1.desc)(db_1.crossingDrafts.updatedAt), (0, drizzle_orm_1.desc)(db_1.crossingDrafts.createdAt))
                .limit(1);
            if (!draft)
                return { status: 404, body: undefined };
            if (ctx.userId === draft.initiatorId) {
                if (!ACTIVE_CROSSING_DRAFT_STATUSES.includes(draft.status)) {
                    return {
                        status: 409,
                        body: { error: "crossing can no longer be edited" },
                    };
                }
                const sentence = inputSentence || draft.sentence?.trim() || "";
                if (!sentence)
                    return { status: 400, body: { error: "sentence required" } };
                const now = new Date();
                const autoPostAt = new Date(now.getTime() + CROSSING_AUTO_POST_DAYS * 24 * 60 * 60 * 1000);
                await tx
                    .update(db_1.crossingDrafts)
                    .set({
                    sentence,
                    context: inputContext !== undefined ? inputContext : draft.context,
                    submittedAt: now,
                    autoPostAt,
                    status: "awaiting_other",
                    updatedAt: now,
                })
                    .where((0, drizzle_orm_1.eq)(db_1.crossingDrafts.id, draft.id));
                return {
                    status: 200,
                    body: {
                        status: "awaiting_other",
                        auto_post_at: autoPostAt.toISOString(),
                    },
                };
            }
            if (draft.status === "complete") {
                const [existingCrossing] = await tx
                    .select()
                    .from(db_1.crossings)
                    .where((0, drizzle_orm_1.eq)(db_1.crossings.sourceDraftId, draft.id))
                    .limit(1);
                if (existingCrossing) {
                    return {
                        status: 200,
                        body: {
                            status: "complete",
                            id: existingCrossing.id,
                            sentence: existingCrossing.sentence,
                            context: existingCrossing.context,
                            image_url: existingCrossing.imageUrl,
                        },
                    };
                }
            }
            if (draft.status !== "awaiting_other" || !draft.submittedAt || !draft.sentence?.trim()) {
                return {
                    status: 409,
                    body: { error: "crossing is not ready for approval yet" },
                };
            }
            // Other participant provides their own sentence (sentence_b)
            const otherSentence = inputSentence || draft.sentenceB?.trim() || "";
            const [claimedDraft] = await tx
                .update(db_1.crossingDrafts)
                .set({
                status: "complete",
                autoPostAt: null,
                sentenceB: otherSentence || draft.sentenceB,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.id, draft.id), (0, drizzle_orm_1.eq)(db_1.crossingDrafts.status, "awaiting_other")))
                .returning({
                id: db_1.crossingDrafts.id,
                sentence: db_1.crossingDrafts.sentence,
                sentenceB: db_1.crossingDrafts.sentenceB,
                context: db_1.crossingDrafts.context,
            });
            if (!claimedDraft) {
                const [existingCrossing] = await tx
                    .select()
                    .from(db_1.crossings)
                    .where((0, drizzle_orm_1.eq)(db_1.crossings.sourceDraftId, draft.id))
                    .limit(1);
                if (existingCrossing) {
                    return {
                        status: 200,
                        body: {
                            status: "complete",
                            id: existingCrossing.id,
                            sentence: existingCrossing.sentence,
                            context: existingCrossing.context,
                            image_url: existingCrossing.imageUrl,
                        },
                    };
                }
                return {
                    status: 409,
                    body: { error: "crossing is not ready for approval yet" },
                };
            }
            const sentence = claimedDraft.sentence?.trim();
            if (!sentence) {
                throw new Error("Claimed crossing draft has no sentence");
            }
            let crossing;
            try {
                [crossing] = await tx
                    .insert(db_1.crossings)
                    .values({
                    conversationId: ctx.convId,
                    sourceDraftId: claimedDraft.id,
                    participantA: ctx.participantA,
                    participantB: ctx.participantB,
                    sentence,
                    sentenceA: sentence,
                    sentenceB: claimedDraft.sentenceB ?? null,
                    context: claimedDraft.context ?? null,
                    imageUrl: null,
                })
                    .returning();
            }
            catch (error) {
                if (!isUniqueViolation(error))
                    throw error;
                [crossing] = await tx
                    .select()
                    .from(db_1.crossings)
                    .where((0, drizzle_orm_1.eq)(db_1.crossings.sourceDraftId, claimedDraft.id))
                    .limit(1);
            }
            if (!crossing)
                return { status: 500, body: undefined };
            return {
                status: 200,
                body: {
                    status: "complete",
                    id: crossing.id,
                    sentence: crossing.sentence,
                    context: crossing.context,
                    image_url: crossing.imageUrl,
                },
            };
        });
        if (result.status !== 200) {
            return reply.status(result.status).send(result.body);
        }
        (0, feed_1.invalidateFeedCache)(ctx.participantA).catch((err) => {
            console.error("[cache] invalidateFeedCache failed:", err instanceof Error ? err.message : String(err));
        });
        (0, feed_1.invalidateFeedCache)(ctx.participantB).catch((err) => {
            console.error("[cache] invalidateFeedCache failed:", err instanceof Error ? err.message : String(err));
        });
        return reply.send(result.body);
    });
    app.post("/api/conversations/:id/crossing/abandon", async (request, reply) => {
        const ctx = await getConvAndParticipant(request, reply);
        if (!ctx)
            return;
        const result = await db_1.db.transaction(async (tx) => {
            const [draft] = await tx
                .select()
                .from(db_1.crossingDrafts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.conversationId, ctx.convId), (0, drizzle_orm_1.inArray)(db_1.crossingDrafts.status, ACTIVE_CROSSING_DRAFT_STATUSES)))
                .orderBy((0, drizzle_orm_1.desc)(db_1.crossingDrafts.updatedAt), (0, drizzle_orm_1.desc)(db_1.crossingDrafts.createdAt))
                .limit(1);
            if (!draft)
                return { status: 404 };
            if (draft.initiatorId !== ctx.userId) {
                return { status: 403 };
            }
            await tx
                .update(db_1.crossingDrafts)
                .set({
                status: "abandoned",
                submittedAt: null,
                autoPostAt: null,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(db_1.crossingDrafts.id, draft.id));
            return { status: 200 };
        });
        if (result.status !== 200)
            return reply.status(result.status).send();
        return reply.send({ ok: true });
    });
    app.put("/api/crossings/:id", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const crossingId = request.params.id;
        const [crossing] = await db_1.db
            .select()
            .from(db_1.crossings)
            .where((0, drizzle_orm_1.eq)(db_1.crossings.id, crossingId))
            .limit(1);
        if (!crossing)
            return reply.status(404).send();
        const isParticipant = crossing.participantA === userId || crossing.participantB === userId;
        if (!isParticipant) {
            return reply.status(403).send({ error: "only participants can edit this crossing" });
        }
        const body = request.body ?? {};
        const sentence = typeof body.sentence === "string" ? body.sentence.trim() : undefined;
        const context = typeof body.context === "string"
            ? body.context.slice(0, CROSSING_CONTEXT_MAX).trim()
            : undefined;
        if (sentence !== undefined && !sentence) {
            return reply.status(400).send({ error: "sentence required" });
        }
        if (sentence && sentence.length > CROSSING_SENTENCE_MAX) {
            return reply
                .status(400)
                .send({ error: `sentence max ${CROSSING_SENTENCE_MAX} chars` });
        }
        if (context !== undefined && context.length > CROSSING_CONTEXT_MAX) {
            return reply
                .status(400)
                .send({ error: `context max ${CROSSING_CONTEXT_MAX} chars` });
        }
        if (sentence !== undefined) {
            const sentenceFilter = (0, content_filter_1.filterContent)(sentence);
            if (sentenceFilter.flagged) {
                return reply.status(400).send({
                    error: "Your crossing was flagged for potentially objectionable content. Please revise and try again.",
                });
            }
        }
        if (context) {
            const contextFilter = (0, content_filter_1.filterContent)(context);
            if (contextFilter.flagged) {
                return reply.status(400).send({
                    error: "Your context was flagged for potentially objectionable content. Please revise and try again.",
                });
            }
        }
        if (sentence === undefined && context === undefined) {
            return reply.send(serializeCrossing(crossing));
        }
        // Each participant edits their own sentence
        const isParticipantA = crossing.participantA === userId;
        const sentenceUpdate = sentence !== undefined
            ? {
                sentence,
                ...(isParticipantA ? { sentenceA: sentence } : { sentenceB: sentence }),
            }
            : {};
        await db_1.db
            .update(db_1.crossings)
            .set({
            ...sentenceUpdate,
            ...(context !== undefined ? { context: context || null } : {}),
        })
            .where((0, drizzle_orm_1.eq)(db_1.crossings.id, crossingId));
        const [updated] = await db_1.db
            .select()
            .from(db_1.crossings)
            .where((0, drizzle_orm_1.eq)(db_1.crossings.id, crossingId))
            .limit(1);
        if (!updated)
            return reply.status(404).send();
        (0, feed_1.invalidateFeedCache)(crossing.participantA).catch((err) => {
            console.error("[cache] invalidateFeedCache failed:", err instanceof Error ? err.message : String(err));
        });
        (0, feed_1.invalidateFeedCache)(crossing.participantB).catch((err) => {
            console.error("[cache] invalidateFeedCache failed:", err instanceof Error ? err.message : String(err));
        });
        return reply.send(serializeCrossing(updated));
    });
    app.delete("/api/crossings/:id", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const crossingId = request.params.id;
        const [crossing] = await db_1.db
            .select()
            .from(db_1.crossings)
            .where((0, drizzle_orm_1.eq)(db_1.crossings.id, crossingId))
            .limit(1);
        if (!crossing)
            return reply.status(404).send();
        const isParticipant = crossing.participantA === userId || crossing.participantB === userId;
        if (!isParticipant) {
            return reply.status(403).send({ error: "only participants can delete this crossing" });
        }
        const otherId = crossing.participantA === userId ? crossing.participantB : crossing.participantA;
        // Look up the other participant's photo for the new thought
        const [otherUser] = await db_1.db
            .select({ photoUrl: db_1.users.photoUrl })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, otherId))
            .limit(1);
        await db_1.db.transaction(async (tx) => {
            // Create a regular thought for the other participant
            await tx.insert(db_1.thoughts).values({
                userId: otherId,
                sentence: crossing.sentence,
                context: crossing.context,
                photoUrl: otherUser?.photoUrl ?? null,
            });
            // Remove the crossing
            await tx.delete(db_1.crossingReplies).where((0, drizzle_orm_1.eq)(db_1.crossingReplies.crossingId, crossingId));
            await tx.delete(db_1.crossings).where((0, drizzle_orm_1.eq)(db_1.crossings.id, crossingId));
        });
        (0, feed_1.invalidateFeedCache)(crossing.participantA).catch((err) => {
            console.error("[cache] invalidateFeedCache failed:", err instanceof Error ? err.message : String(err));
        });
        (0, feed_1.invalidateFeedCache)(crossing.participantB).catch((err) => {
            console.error("[cache] invalidateFeedCache failed:", err instanceof Error ? err.message : String(err));
        });
        return reply.status(200).send({ ok: true });
    });
    // ——— Crossing Detail + Reply ———
    app.get("/api/crossings/:id", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const crossingId = request.params.id;
        const [crossing] = await db_1.db.select().from(db_1.crossings).where((0, drizzle_orm_1.eq)(db_1.crossings.id, crossingId)).limit(1);
        if (!crossing)
            return reply.status(404).send();
        // Hydrate participants
        const participantIds = [crossing.participantA, crossing.participantB];
        const participantRows = await db_1.db.select().from(db_1.users).where((0, drizzle_orm_1.inArray)(db_1.users.id, participantIds));
        const pMap = new Map(participantRows.map((u) => [u.id, u]));
        const pA = pMap.get(crossing.participantA);
        const pB = pMap.get(crossing.participantB);
        // Accepted replies
        const acceptedReplies = await db_1.db
            .select()
            .from(db_1.crossingReplies)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingReplies.crossingId, crossingId), (0, drizzle_orm_1.eq)(db_1.crossingReplies.status, "accepted")));
        const replierIds = [...new Set(acceptedReplies.map((r) => r.replierId))];
        const replierRows = replierIds.length > 0
            ? await db_1.db.select().from(db_1.users).where((0, drizzle_orm_1.inArray)(db_1.users.id, replierIds))
            : [];
        const replierMap = new Map(replierRows.map((u) => [u.id, u]));
        // Can reply: not a participant AND no pending reply
        const isParticipant = userId === crossing.participantA || userId === crossing.participantB;
        const [pendingReply] = isParticipant
            ? [undefined]
            : await db_1.db.select().from(db_1.crossingReplies)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingReplies.crossingId, crossingId), (0, drizzle_orm_1.eq)(db_1.crossingReplies.replierId, userId), (0, drizzle_orm_1.eq)(db_1.crossingReplies.status, "pending"))).limit(1);
        const canReply = !isParticipant && !pendingReply;
        return reply.send({
            panel_1: {
                id: crossing.id,
                sentence: crossing.sentence,
                sentence_a: crossing.sentenceA ?? crossing.sentence,
                sentence_b: crossing.sentenceB ?? null,
                participant_a: { id: crossing.participantA, name: pA?.name ?? null, photo_url: pA?.photoUrl ?? null },
                participant_b: { id: crossing.participantB, name: pB?.name ?? null, photo_url: pB?.photoUrl ?? null },
                created_at: crossing.createdAt?.toISOString() ?? new Date().toISOString(),
            },
            panel_2: {
                sentence: crossing.sentence,
                sentence_a: crossing.sentenceA ?? crossing.sentence,
                sentence_b: crossing.sentenceB ?? null,
                context: crossing.context,
            },
            panel_3: {
                accepted_replies: acceptedReplies.map((r) => {
                    const u = replierMap.get(r.replierId);
                    return {
                        id: r.id,
                        user: { id: r.replierId, name: u?.name ?? null, photo_url: u?.photoUrl ?? null },
                        text: r.text,
                        target_participant_id: r.targetParticipantId,
                        created_at: r.createdAt?.toISOString() ?? new Date().toISOString(),
                    };
                }),
                can_reply: canReply,
            },
        });
    });
    app.post("/api/crossings/:id/reply", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const crossingId = request.params.id;
        const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
        const targetId = typeof request.body?.target_participant_id === "string"
            ? request.body.target_participant_id.trim()
            : "";
        if (text.length < REPLY_TEXT_MIN || text.length > REPLY_TEXT_MAX) {
            return reply
                .status(400)
                .send({ error: `text must be ${REPLY_TEXT_MIN}-${REPLY_TEXT_MAX} chars` });
        }
        if (!targetId)
            return reply.status(400).send({ error: "target_participant_id required" });
        const textFilter = (0, content_filter_1.filterContent)(text);
        if (textFilter.flagged) {
            return reply.status(400).send({
                error: "Your reply was flagged for potentially objectionable content. Please revise and try again.",
            });
        }
        const [crossing] = await db_1.db.select().from(db_1.crossings).where((0, drizzle_orm_1.eq)(db_1.crossings.id, crossingId)).limit(1);
        if (!crossing)
            return reply.status(404).send();
        // Validate target is a participant
        if (targetId !== crossing.participantA && targetId !== crossing.participantB) {
            return reply.status(400).send({ error: "target must be a participant" });
        }
        // Replier cannot be a participant
        if (userId === crossing.participantA || userId === crossing.participantB) {
            return reply.status(403).send({ error: "participants cannot reply to their own crossing" });
        }
        const [existingPending] = await db_1.db
            .select({ id: db_1.crossingReplies.id, status: db_1.crossingReplies.status, createdAt: db_1.crossingReplies.createdAt })
            .from(db_1.crossingReplies)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingReplies.crossingId, crossingId), (0, drizzle_orm_1.eq)(db_1.crossingReplies.replierId, userId), (0, drizzle_orm_1.eq)(db_1.crossingReplies.status, "pending")))
            .limit(1);
        if (existingPending) {
            return reply.status(409).send({
                id: existingPending.id,
                status: existingPending.status,
                created_at: existingPending.createdAt?.toISOString() ?? null,
            });
        }
        let created;
        try {
            [created] = await db_1.db
                .insert(db_1.crossingReplies)
                .values({
                crossingId,
                replierId: userId,
                targetParticipantId: targetId,
                text,
                status: "pending",
            })
                .returning({ id: db_1.crossingReplies.id, status: db_1.crossingReplies.status, createdAt: db_1.crossingReplies.createdAt });
        }
        catch (error) {
            if (!isUniqueViolation(error))
                throw error;
            [created] = await db_1.db
                .select({ id: db_1.crossingReplies.id, status: db_1.crossingReplies.status, createdAt: db_1.crossingReplies.createdAt })
                .from(db_1.crossingReplies)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingReplies.crossingId, crossingId), (0, drizzle_orm_1.eq)(db_1.crossingReplies.replierId, userId), (0, drizzle_orm_1.eq)(db_1.crossingReplies.status, "pending")))
                .limit(1);
            if (created) {
                return reply.status(409).send({
                    id: created.id,
                    status: created.status,
                    created_at: created.createdAt?.toISOString() ?? null,
                });
            }
        }
        if (!created)
            return reply.status(500).send();
        return reply.send({ id: created.id, status: created.status, created_at: created.createdAt?.toISOString() });
    });
}
