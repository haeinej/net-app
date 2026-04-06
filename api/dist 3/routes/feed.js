"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedRoutes = feedRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const feed_1 = require("../feed");
const db_1 = require("../db");
const auth_1 = require("../lib/auth");
function getOffsetFromCursor(cursor) {
    if (!cursor)
        return 0;
    try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        return typeof parsed.offset === "number" && Number.isFinite(parsed.offset) && parsed.offset >= 0
            ? Math.floor(parsed.offset)
            : 0;
    }
    catch {
        return 0;
    }
}
async function getFallbackFeed(userId, limit, offset) {
    const rows = await db_1.db
        .select({
        thought: db_1.thoughts,
        authorId: db_1.users.id,
        authorName: db_1.users.name,
        authorPhotoUrl: db_1.users.photoUrl,
    })
        .from(db_1.thoughts)
        .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.thoughts.userId, db_1.users.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.ne)(db_1.thoughts.userId, userId), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt)))
        .orderBy((0, drizzle_orm_1.desc)(db_1.thoughts.createdAt))
        .limit(limit)
        .offset(offset);
    return rows.map((row) => ({
        type: "thought",
        thought: {
            id: row.thought.id,
            sentence: row.thought.sentence,
            photo_url: row.thought.photoUrl,
            image_url: row.thought.imageUrl,
            created_at: row.thought.createdAt?.toISOString() ?? new Date().toISOString(),
            has_context: (row.thought.context ?? "").trim().length > 0,
        },
        user: {
            id: row.authorId,
            name: row.authorName,
            photo_url: row.authorPhotoUrl,
        },
    }));
}
async function feedRoutes(app) {
    app.addHook("onRequest", auth_1.authenticate);
    app.get("/api/feed", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "20", 10) || 20));
        const cursor = typeof request.query.cursor === "string" ? request.query.cursor.trim() : "";
        const offset = cursor
            ? getOffsetFromCursor(cursor)
            : Math.max(0, parseInt(request.query.offset ?? "0", 10) || 0);
        try {
            const page = await (0, feed_1.getFeed)(userId, limit, cursor || null);
            return reply.send({
                items: page.items,
                next_cursor: page.nextCursor,
            });
        }
        catch (error) {
            request.log.error({ error, userId, limit, offset, hasCursor: Boolean(cursor) }, "feed load failed; serving fallback feed");
            try {
                const fallbackItems = await getFallbackFeed(userId, limit, offset);
                return reply.send({
                    items: fallbackItems,
                    next_cursor: null,
                });
            }
            catch (fallbackError) {
                request.log.error({ error: fallbackError, userId, limit, offset }, "fallback feed failed; returning empty feed");
                return reply.send({ items: [], next_cursor: null });
            }
        }
    });
    if (process.env.ENABLE_DEBUG_ENDPOINTS === "true" && process.env.NODE_ENV !== "production") {
        app.get("/api/feed/debug", async (request, reply) => {
            const userId = (0, auth_1.getUserId)(request);
            if (!userId)
                return reply.status(401).send();
            const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "20", 10) || 20));
            const offset = Math.max(0, parseInt(request.query.offset ?? "0", 10) || 0);
            const items = await (0, feed_1.getFeedWithDebug)(userId, limit, offset);
            const body = items.map((t) => ({
                id: t.thought?.id,
                sentence: t.thought?.sentence,
                photo_url: t.thought?.photo_url,
                image_url: t.thought?.image_url,
                created_at: t.thought?.created_at,
                user: t.user,
                has_context: t.thought?.has_context,
                _debug: t._debug,
            }));
            return reply.send(body);
        });
    }
}
