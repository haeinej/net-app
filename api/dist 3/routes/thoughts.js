"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.thoughtRoutes = thoughtRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const auth_1 = require("../lib/auth");
const thought_processing_1 = require("../thought-processing");
const feed_1 = require("../feed");
const content_filter_1 = require("../lib/content-filter");
const viewer_profile_1 = require("../feed/viewer-profile");
const SENTENCE_MAX = 200;
const CONTEXT_MAX = 600;
async function thoughtRoutes(app) {
    app.addHook("onRequest", auth_1.authenticate);
    app.post("/api/thoughts", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const body = request.body ?? {};
        const sentence = typeof body.sentence === "string" ? body.sentence.trim() : "";
        const context = typeof body.context === "string" ? body.context.trim() : "";
        const photoUrl = typeof body.photo_url === "string" ? body.photo_url.trim() || null : null;
        if (!sentence)
            return reply.status(400).send({ error: "sentence required" });
        if (sentence.length > SENTENCE_MAX)
            return reply.status(400).send({ error: `sentence max ${SENTENCE_MAX} chars` });
        if (context.length > CONTEXT_MAX)
            return reply.status(400).send({ error: `context max ${CONTEXT_MAX} chars` });
        const sentenceFilter = (0, content_filter_1.filterContent)(sentence);
        if (sentenceFilter.flagged) {
            return reply.status(400).send({
                error: "Your thought was flagged for potentially objectionable content. Please revise and try again.",
            });
        }
        if (context) {
            const contextFilter = (0, content_filter_1.filterContent)(context);
            if (contextFilter.flagged) {
                return reply.status(400).send({
                    error: "Your context was flagged for potentially objectionable content. Please revise and try again.",
                });
            }
        }
        const [row] = await db_1.db
            .insert(db_1.thoughts)
            .values({
            userId,
            sentence,
            context: context || null,
            photoUrl,
            imageUrl: null,
            imageMetadata: null,
        })
            .returning({
            id: db_1.thoughts.id,
            sentence: db_1.thoughts.sentence,
            context: db_1.thoughts.context,
            photoUrl: db_1.thoughts.photoUrl,
            imageUrl: db_1.thoughts.imageUrl,
            createdAt: db_1.thoughts.createdAt,
        });
        if (!row)
            return reply.status(500).send();
        const thoughtId = row.id;
        (0, thought_processing_1.processNewThought)(thoughtId).catch((err) => {
            console.error("processNewThought failed", {
                thoughtId,
                message: err?.message ?? String(err),
                code: err?.code,
            });
        });
        void (0, feed_1.invalidateFeedCache)();
        void (0, viewer_profile_1.invalidateViewerFeedProfile)(userId);
        return reply.status(201).send({
            id: thoughtId,
            sentence: row.sentence,
            context: row.context ?? "",
            photo_url: row.photoUrl ?? null,
            image_url: row.imageUrl ?? null,
            created_at: row.createdAt?.toISOString(),
        });
    });
    app.delete("/api/thoughts/:id", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const { id } = request.params;
        const [t] = await db_1.db.select().from(db_1.thoughts).where((0, drizzle_orm_1.eq)(db_1.thoughts.id, id));
        if (!t)
            return reply.status(404).send();
        if (t.userId !== userId)
            return reply.status(403).send();
        await db_1.db.update(db_1.thoughts).set({ deletedAt: new Date() }).where((0, drizzle_orm_1.eq)(db_1.thoughts.id, id));
        void (0, feed_1.invalidateFeedCache)();
        void (0, viewer_profile_1.invalidateViewerFeedProfile)(userId);
        return reply.status(200).send();
    });
    app.put("/api/thoughts/:id", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const { id } = request.params;
        const [t] = await db_1.db.select().from(db_1.thoughts).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.thoughts.id, id), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt)));
        if (!t)
            return reply.status(404).send();
        if (t.userId !== userId)
            return reply.status(403).send();
        const body = request.body ?? {};
        const sentence = typeof body.sentence === "string" ? body.sentence.trim() : undefined;
        const context = typeof body.context === "string" ? body.context.trim() : undefined;
        const photoUrl = typeof body.photo_url === "string" ? body.photo_url.trim() || null : undefined;
        if (sentence !== undefined && !sentence)
            return reply.status(400).send({ error: "sentence required" });
        if (sentence && sentence.length > SENTENCE_MAX)
            return reply.status(400).send({ error: `sentence max ${SENTENCE_MAX} chars` });
        if (context !== undefined && context.length > CONTEXT_MAX)
            return reply.status(400).send({ error: `context max ${CONTEXT_MAX} chars` });
        const updates = {};
        if (sentence !== undefined)
            updates.sentence = sentence;
        if (context !== undefined)
            updates.context = context || null;
        if (photoUrl !== undefined)
            updates.photoUrl = photoUrl;
        if (Object.keys(updates).length > 0) {
            await db_1.db.update(db_1.thoughts).set(updates).where((0, drizzle_orm_1.eq)(db_1.thoughts.id, id));
            void (0, feed_1.invalidateFeedCache)();
            void (0, viewer_profile_1.invalidateViewerFeedProfile)(userId);
            if (sentence !== undefined || context !== undefined) {
                (0, thought_processing_1.processNewThought)(id).catch((err) => {
                    console.error("processNewThought after edit failed", {
                        thoughtId: id,
                        message: err?.message ?? String(err),
                        code: err?.code,
                    });
                });
            }
        }
        const [updated] = await db_1.db.select().from(db_1.thoughts).where((0, drizzle_orm_1.eq)(db_1.thoughts.id, id));
        return reply.send({
            id: updated.id,
            sentence: updated.sentence,
            context: updated.context ?? "",
            photo_url: updated.photoUrl ?? null,
            image_url: updated.imageUrl ?? null,
            created_at: updated.createdAt?.toISOString(),
        });
    });
    app.get("/api/thoughts/:id", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const { id } = request.params;
        const [t] = await db_1.db.select().from(db_1.thoughts).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.thoughts.id, id), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt)));
        if (!t)
            return reply.status(404).send();
        const [author] = await db_1.db.select().from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.id, t.userId));
        const viewerIsAuthor = t.userId === userId;
        const visibleReplies = await db_1.db
            .select({
            id: db_1.replies.id,
            replierId: db_1.replies.replierId,
            text: db_1.replies.text,
            status: db_1.replies.status,
            createdAt: db_1.replies.createdAt,
        })
            .from(db_1.replies)
            .where(viewerIsAuthor
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.replies.thoughtId, id), (0, drizzle_orm_1.ne)(db_1.replies.status, "deleted"))
            : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.replies.thoughtId, id), (0, drizzle_orm_1.eq)(db_1.replies.status, "accepted")))
            .orderBy((0, drizzle_orm_1.asc)(db_1.replies.createdAt));
        const replierIds = [...new Set(visibleReplies.map((r) => r.replierId))];
        const repliers = replierIds.length
            ? await db_1.db.select().from(db_1.users).where((0, drizzle_orm_1.inArray)(db_1.users.id, replierIds))
            : [];
        const replierMap = new Map(repliers.map((u) => [u.id, u]));
        const pending = await db_1.db
            .select()
            .from(db_1.replies)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.replies.thoughtId, id), (0, drizzle_orm_1.eq)(db_1.replies.status, "pending"), (0, drizzle_orm_1.eq)(db_1.replies.replierId, userId)))
            .limit(1);
        const canReply = !viewerIsAuthor && pending.length === 0;
        return reply.send({
            panel_1: {
                sentence: t.sentence,
                photo_url: t.photoUrl,
                image_url: t.imageUrl,
                user: author
                    ? { id: author.id, name: author.name, photo_url: author.photoUrl }
                    : null,
                created_at: t.createdAt?.toISOString(),
            },
            panel_2: { sentence: t.sentence, context: t.context ?? "" },
            panel_3: {
                viewer_is_author: viewerIsAuthor,
                replies: visibleReplies.map((r) => {
                    const u = replierMap.get(r.replierId);
                    return {
                        id: r.id,
                        user: u ? { id: u.id, name: u.name, photo_url: u.photoUrl } : null,
                        text: r.text,
                        status: r.status,
                        can_delete: viewerIsAuthor && r.status === "pending",
                        created_at: r.createdAt?.toISOString(),
                    };
                }),
                can_reply: canReply,
            },
        });
    });
}
