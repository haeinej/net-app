"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushRoutes = pushRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const auth_1 = require("../lib/auth");
async function pushRoutes(app) {
    app.addHook("onRequest", auth_1.authenticate);
    /** Register or refresh an Expo push token. */
    app.post("/api/push/register", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const token = typeof request.body?.token === "string" ? request.body.token.trim() : "";
        const platform = typeof request.body?.platform === "string" ? request.body.platform.trim() : "";
        if (!token || !platform) {
            return reply.status(400).send({ error: "token and platform required" });
        }
        if (!["ios", "android"].includes(platform)) {
            return reply.status(400).send({ error: "platform must be ios or android" });
        }
        // Upsert: if this token exists, update the user + timestamp
        const existing = await db_1.db
            .select({ id: db_1.pushTokens.id, userId: db_1.pushTokens.userId })
            .from(db_1.pushTokens)
            .where((0, drizzle_orm_1.eq)(db_1.pushTokens.token, token))
            .limit(1);
        if (existing.length > 0) {
            await db_1.db
                .update(db_1.pushTokens)
                .set({ userId, platform, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.pushTokens.token, token));
        }
        else {
            await db_1.db.insert(db_1.pushTokens).values({ userId, token, platform });
        }
        return reply.send({ ok: true });
    });
    /** Unregister a push token (logout / disable notifications). */
    app.delete("/api/push/register", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const token = typeof request.body?.token === "string" ? request.body.token.trim() : "";
        if (!token)
            return reply.status(400).send({ error: "token required" });
        await db_1.db
            .delete(db_1.pushTokens)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.pushTokens.token, token), (0, drizzle_orm_1.eq)(db_1.pushTokens.userId, userId)));
        return reply.send({ ok: true });
    });
}
