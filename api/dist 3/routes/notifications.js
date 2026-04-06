"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRoutes = notificationRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const auth_1 = require("../lib/auth");
const blocked_users_1 = require("../lib/blocked-users");
async function notificationRoutes(app) {
    app.addHook("onRequest", auth_1.authenticate);
    app.get("/api/notifications", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const rawLimit = parseInt(request.query.limit ?? "50", 10);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
        const pendingReplies = await db_1.db
            .select({
            replyId: db_1.replies.id,
            text: db_1.replies.text,
            createdAt: db_1.replies.createdAt,
            thoughtId: db_1.replies.thoughtId,
            replierId: db_1.replies.replierId,
        })
            .from(db_1.replies)
            .innerJoin(db_1.thoughts, (0, drizzle_orm_1.eq)(db_1.replies.thoughtId, db_1.thoughts.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.thoughts.userId, userId), (0, drizzle_orm_1.eq)(db_1.replies.status, "pending"), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.replies.createdAt))
            .limit(limit);
        const thoughtIds = [...new Set(pendingReplies.map((r) => r.thoughtId))];
        const replierIds = [...new Set(pendingReplies.map((r) => r.replierId))];
        const thoughtRows = thoughtIds.length > 0
            ? await db_1.db
                .select({
                id: db_1.thoughts.id,
                sentence: db_1.thoughts.sentence,
            })
                .from(db_1.thoughts)
                .where((0, drizzle_orm_1.inArray)(db_1.thoughts.id, thoughtIds))
            : [];
        const replierRows = replierIds.length > 0
            ? await db_1.db
                .select({ id: db_1.users.id, name: db_1.users.name, photoUrl: db_1.users.photoUrl })
                .from(db_1.users)
                .where((0, drizzle_orm_1.inArray)(db_1.users.id, replierIds))
            : [];
        const thoughtMap = new Map(thoughtRows.map((t) => [t.id, t]));
        const replierMap = new Map(replierRows.map((u) => [u.id, u]));
        // Filter out replies from blocked users
        const blockedIds = await (0, blocked_users_1.getBlockedUserIds)(userId);
        const filteredReplies = blockedIds.size > 0
            ? pendingReplies.filter((r) => !blockedIds.has(r.replierId))
            : pendingReplies;
        const body = filteredReplies.map((r) => {
            const t = thoughtMap.get(r.thoughtId);
            const u = replierMap.get(r.replierId);
            return {
                reply_id: r.replyId,
                replier: u ? { id: u.id, name: u.name, photo_url: u.photoUrl } : null,
                reply_preview: r.text.slice(0, 100),
                thought: t ? { id: t.id, sentence: t.sentence } : null,
                created_at: r.createdAt?.toISOString(),
            };
        });
        return reply.send(body);
    });
}
