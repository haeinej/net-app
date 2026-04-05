"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moderationRoutes = moderationRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const auth_1 = require("../lib/auth");
const feed_1 = require("../feed");
const VALID_REASONS = [
    "harassment",
    "hate_speech",
    "spam",
    "sexual_content",
    "violence",
    "self_harm",
    "other",
];
const VALID_TARGET_TYPES = [
    "thought",
    "reply",
    "crossing",
    "crossing_reply",
    "message",
    "user",
];
const DESCRIPTION_MAX = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Resolve the owner of a reported content item. */
async function resolveTargetUserId(targetType, targetId) {
    switch (targetType) {
        case "thought": {
            const [row] = await db_1.db
                .select({ userId: db_1.thoughts.userId })
                .from(db_1.thoughts)
                .where((0, drizzle_orm_1.eq)(db_1.thoughts.id, targetId))
                .limit(1);
            return row?.userId ?? null;
        }
        case "reply": {
            const [row] = await db_1.db
                .select({ replierId: db_1.replies.replierId })
                .from(db_1.replies)
                .where((0, drizzle_orm_1.eq)(db_1.replies.id, targetId))
                .limit(1);
            return row?.replierId ?? null;
        }
        case "crossing": {
            // attribute to participant_a (initiator) for moderation
            const [row] = await db_1.db
                .select({ participantA: db_1.crossings.participantA })
                .from(db_1.crossings)
                .where((0, drizzle_orm_1.eq)(db_1.crossings.id, targetId))
                .limit(1);
            return row?.participantA ?? null;
        }
        case "crossing_reply": {
            const [row] = await db_1.db
                .select({ replierId: db_1.crossingReplies.replierId })
                .from(db_1.crossingReplies)
                .where((0, drizzle_orm_1.eq)(db_1.crossingReplies.id, targetId))
                .limit(1);
            return row?.replierId ?? null;
        }
        case "message": {
            const [row] = await db_1.db
                .select({ senderId: db_1.messages.senderId })
                .from(db_1.messages)
                .where((0, drizzle_orm_1.eq)(db_1.messages.id, targetId))
                .limit(1);
            return row?.senderId ?? null;
        }
        case "user":
            return targetId;
        default:
            return null;
    }
}
async function moderationRoutes(app) {
    app.addHook("onRequest", auth_1.authenticate);
    // --- Report content ---
    app.post("/api/reports", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const body = request.body ?? {};
        const targetType = body.target_type;
        const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
        const reason = body.reason;
        const description = typeof body.description === "string" ? body.description.trim().slice(0, DESCRIPTION_MAX) : null;
        if (!targetType || !VALID_TARGET_TYPES.includes(targetType)) {
            return reply.status(400).send({ error: "invalid target_type" });
        }
        if (!targetId || !UUID_PATTERN.test(targetId)) {
            return reply.status(400).send({ error: "target_id required" });
        }
        if (!reason || !VALID_REASONS.includes(reason)) {
            return reply.status(400).send({ error: "invalid reason" });
        }
        if (targetType === "user" && targetId === userId) {
            return reply.status(400).send({ error: "cannot report yourself" });
        }
        const targetUserId = await resolveTargetUserId(targetType, targetId);
        const [row] = await db_1.db
            .insert(db_1.reports)
            .values({
            reporterId: userId,
            targetType,
            targetId,
            targetUserId: targetUserId,
            reason,
            description: description || null,
        })
            .returning({ id: db_1.reports.id, createdAt: db_1.reports.createdAt });
        if (!row)
            return reply.status(500).send();
        // Log for developer notification (visible in server logs / monitoring)
        request.log.warn({
            report_id: row.id,
            reporter_id: userId,
            target_type: targetType,
            target_id: targetId,
            target_user_id: targetUserId,
            reason,
        }, "CONTENT_REPORT: new report filed");
        return reply.status(201).send({
            id: row.id,
            created_at: row.createdAt?.toISOString(),
        });
    });
    // --- Block user ---
    app.post("/api/blocks", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const blockedId = typeof request.body?.user_id === "string" ? request.body.user_id.trim() : "";
        if (!blockedId || !UUID_PATTERN.test(blockedId)) {
            return reply.status(400).send({ error: "user_id required" });
        }
        if (blockedId === userId) {
            return reply.status(400).send({ error: "cannot block yourself" });
        }
        // Verify target user exists
        const [targetUser] = await db_1.db
            .select({ id: db_1.users.id })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, blockedId))
            .limit(1);
        if (!targetUser)
            return reply.status(404).send({ error: "user not found" });
        try {
            await db_1.db.insert(db_1.blocks).values({ blockerId: userId, blockedId });
        }
        catch (error) {
            // unique violation = already blocked, treat as success
            if (typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === "23505") {
                return reply.status(200).send({ blocked: true });
            }
            throw error;
        }
        // Invalidate feed cache so blocked user content is immediately removed
        void (0, feed_1.invalidateFeedCache)(userId);
        // Log for developer notification
        request.log.warn({ blocker_id: userId, blocked_id: blockedId }, "USER_BLOCK: user blocked");
        // Auto-create a report so the developer is notified of the abusive user
        await db_1.db
            .insert(db_1.reports)
            .values({
            reporterId: userId,
            targetType: "user",
            targetId: blockedId,
            targetUserId: blockedId,
            reason: "harassment",
            description: "Auto-generated report from user block action",
        })
            .catch((err) => {
            request.log.error({ err }, "failed to auto-create report on block");
        });
        return reply.status(201).send({ blocked: true });
    });
    // --- Unblock user ---
    app.delete("/api/blocks/:userId", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const blockedId = request.params.userId;
        if (!blockedId || !UUID_PATTERN.test(blockedId)) {
            return reply.status(400).send({ error: "invalid user id" });
        }
        await db_1.db
            .delete(db_1.blocks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.blocks.blockerId, userId), (0, drizzle_orm_1.eq)(db_1.blocks.blockedId, blockedId)));
        void (0, feed_1.invalidateFeedCache)(userId);
        return reply.status(200).send({ blocked: false });
    });
    // --- Get blocked users list ---
    app.get("/api/blocks", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const rows = await db_1.db
            .select({
            blockedId: db_1.blocks.blockedId,
            blockedName: db_1.users.name,
            blockedPhoto: db_1.users.photoUrl,
            createdAt: db_1.blocks.createdAt,
        })
            .from(db_1.blocks)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.blocks.blockedId, db_1.users.id))
            .where((0, drizzle_orm_1.eq)(db_1.blocks.blockerId, userId));
        return reply.send(rows.map((r) => ({
            user_id: r.blockedId,
            name: r.blockedName,
            photo_url: r.blockedPhoto,
            blocked_at: r.createdAt?.toISOString(),
        })));
    });
    // --- Check if a specific user is blocked ---
    app.get("/api/blocks/:userId/status", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const targetId = request.params.userId;
        const [row] = await db_1.db
            .select({ id: db_1.blocks.id })
            .from(db_1.blocks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.blocks.blockerId, userId), (0, drizzle_orm_1.eq)(db_1.blocks.blockedId, targetId)))
            .limit(1);
        return reply.send({ blocked: Boolean(row) });
    });
}
