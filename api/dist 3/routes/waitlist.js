"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitlistRoutes = waitlistRoutes;
const db_1 = require("../db");
const auth_policy_1 = require("../lib/auth-policy");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function readTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}
async function waitlistRoutes(app) {
    app.post("/api/waitlist", {
        config: {
            rateLimit: {
                max: 8,
                timeWindow: "1 minute",
                keyGenerator: (req) => `ip:${req.ip}`,
            },
        },
    }, async (request, reply) => {
        const body = request.body ?? {};
        const emailInput = readTrimmedString(body.email);
        const email = emailInput ? (0, auth_policy_1.normalizeEmail)(emailInput) : "";
        const source = readTrimmedString(body.source) || "website";
        if (!email || !EMAIL_PATTERN.test(email)) {
            return reply.status(400).send({ error: "valid email required" });
        }
        const inserted = await db_1.db
            .insert(db_1.waitlistSignups)
            .values({ email, source })
            .onConflictDoNothing({ target: db_1.waitlistSignups.email })
            .returning({ id: db_1.waitlistSignups.id });
        return reply.status(inserted[0] ? 201 : 200).send({
            ok: true,
            already_subscribed: inserted.length === 0,
        });
    });
}
