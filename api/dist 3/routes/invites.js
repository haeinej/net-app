"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inviteRoutes = inviteRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const invite_1 = require("../lib/invite");
async function inviteRoutes(app) {
    // Public: validate an invite code
    app.get("/api/invites/validate", {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: "1 minute",
                keyGenerator: (req) => `ip:${req.ip}`,
            },
        },
    }, async (request, reply) => {
        const code = (typeof request.query.code === "string" ? request.query.code : "")
            .trim()
            .toUpperCase();
        if (!code) {
            return reply.status(400).send({ valid: false });
        }
        if ((0, invite_1.isAdminInviteCode)(code)) {
            return reply.send({ valid: true });
        }
        const [row] = await db_1.db
            .select({ id: db_1.inviteCodes.id })
            .from(db_1.inviteCodes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.inviteCodes.code, code), (0, drizzle_orm_1.isNull)(db_1.inviteCodes.redeemedByUserId)))
            .limit(1);
        return reply.send({ valid: Boolean(row) });
    });
    // Auth: get remaining invite count
    app.get("/api/me/invites", async (request, reply) => {
        try {
            await request.jwtVerify();
        }
        catch {
            return reply.status(401).send({ error: "Unauthorized" });
        }
        const userId = request.user.sub;
        const [result] = await db_1.db
            .select({ total: (0, drizzle_orm_1.count)() })
            .from(db_1.inviteCodes)
            .where((0, drizzle_orm_1.eq)(db_1.inviteCodes.createdByUserId, userId));
        const used = result?.total ?? 0;
        const remaining = Math.max(0, invite_1.MAX_INVITES_PER_USER - used);
        return reply.send({ remaining });
    });
    // Auth: generate a new invite code
    app.post("/api/me/invites/generate", {
        config: {
            rateLimit: {
                max: 5,
                timeWindow: "1 minute",
            },
        },
    }, async (request, reply) => {
        try {
            await request.jwtVerify();
        }
        catch {
            return reply.status(401).send({ error: "Unauthorized" });
        }
        const userId = request.user.sub;
        const [result] = await db_1.db
            .select({ total: (0, drizzle_orm_1.count)() })
            .from(db_1.inviteCodes)
            .where((0, drizzle_orm_1.eq)(db_1.inviteCodes.createdByUserId, userId));
        const used = result?.total ?? 0;
        if (used >= invite_1.MAX_INVITES_PER_USER) {
            return reply.status(400).send({ error: "No invites remaining" });
        }
        // Generate with collision retry
        let code;
        let attempts = 0;
        while (true) {
            code = (0, invite_1.generateInviteCode)();
            try {
                await db_1.db.insert(db_1.inviteCodes).values({
                    code,
                    createdByUserId: userId,
                });
                break;
            }
            catch (err) {
                attempts++;
                const isUniqueViolation = err &&
                    typeof err === "object" &&
                    "code" in err &&
                    err.code === "23505";
                if (!isUniqueViolation || attempts >= 5)
                    throw err;
            }
        }
        const remaining = Math.max(0, invite_1.MAX_INVITES_PER_USER - used - 1);
        return reply.send({ code, remaining });
    });
}
