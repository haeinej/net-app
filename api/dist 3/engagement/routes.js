"use strict";
/**
 * Engagement tracking routes (Phase 6). POST /api/engagement/track — auth required.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.engagementRoutes = engagementRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const track_1 = require("./track");
async function engagementRoutes(app) {
    const authenticate = async (request, reply) => {
        try {
            await request.jwtVerify();
        }
        catch {
            reply.status(401).send();
        }
    };
    app.post("/api/engagement/track", {
        onRequest: [authenticate],
        config: {
            rateLimit: {
                max: 60,
                timeWindow: "1 hour",
                keyGenerator: (req) => {
                    const userId = req.user?.sub;
                    return userId ? `user:${userId}` : `ip:${req.ip}`;
                },
            },
        },
    }, async (request, reply) => {
        const userId = request.user?.sub;
        if (!userId) {
            return reply.status(401).send();
        }
        const body = request.body;
        if (!body || !Array.isArray(body.events)) {
            return reply.status(400).send({ error: "Body must contain events array" });
        }
        if (body.events.length === 0) {
            return reply.status(200).send({ ingested: 0 });
        }
        if (body.events.length > 100) {
            return reply.status(400).send({ error: "Too many events" });
        }
        const ingested = await (0, track_1.trackEngagementEvents)(userId, body.events);
        // Increment aggregated total engagement events counter in system_config
        if (ingested > 0) {
            await db_1.db
                .insert(db_1.systemConfig)
                .values({ key: "total_engagement_events", value: ingested })
                .onConflictDoUpdate({
                target: db_1.systemConfig.key,
                set: {
                    value: (0, drizzle_orm_1.sql) `to_jsonb(coalesce((system_config.value)::int, 0) + ${ingested})`,
                },
            });
        }
        return reply.status(200).send({ ingested });
    });
}
