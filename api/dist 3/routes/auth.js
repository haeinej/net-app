"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const onboarding_1 = require("../lib/onboarding");
const auth_policy_1 = require("../lib/auth-policy");
const supabase_email_verification_1 = require("../lib/supabase-email-verification");
const password_1 = require("../lib/password");
const invite_1 = require("../lib/invite");
function readTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function readOptionalTrimmedString(value) {
    const normalized = readTrimmedString(value);
    return normalized || null;
}
function verificationRequiredResponse(email) {
    return {
        verification_required: true,
        verification_email: email,
    };
}
async function authRoutes(app) {
    app.post("/api/auth/register", {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: "1 minute",
                keyGenerator: (req) => `ip:${req.ip}`,
            },
        },
    }, async (request, reply) => {
        const body = request.body ?? {};
        const name = readTrimmedString(body.name);
        const photoUrl = readOptionalTrimmedString(body.photo_url);
        const emailRaw = readOptionalTrimmedString(body.email);
        const email = emailRaw ? (0, auth_policy_1.normalizeEmail)(emailRaw) : null;
        const password = typeof body.password === "string" ? body.password : "";
        const termsAccepted = body.terms_accepted === true;
        const inviteCode = readTrimmedString(body.invite_code).toUpperCase();
        // Validate invite code
        if (!inviteCode) {
            return reply.status(400).send({ error: "Invite code required" });
        }
        const isAdmin = (0, invite_1.isAdminInviteCode)(inviteCode);
        let inviteCodeRow = null;
        if (!isAdmin) {
            const [row] = await db_1.db
                .select({ id: db_1.inviteCodes.id, createdByUserId: db_1.inviteCodes.createdByUserId })
                .from(db_1.inviteCodes)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.inviteCodes.code, inviteCode), (0, drizzle_orm_1.isNull)(db_1.inviteCodes.redeemedByUserId)))
                .limit(1);
            if (!row) {
                return reply.status(400).send({ error: "Invalid or already used invite code" });
            }
            inviteCodeRow = row;
        }
        if (!name)
            return reply.status(400).send({ error: "name required" });
        if (!photoUrl) {
            return reply.status(400).send({ error: "profile photo required" });
        }
        if (!termsAccepted)
            return reply.status(400).send({ error: "You must accept the Terms of Use" });
        if (!email)
            return reply.status(400).send({ error: "email required" });
        const passwordError = (0, auth_policy_1.validateStrongPassword)(password);
        if (passwordError) {
            return reply.status(400).send({ error: passwordError });
        }
        const existing = await db_1.db.select().from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.email, email)).limit(1);
        const passwordHash = await (0, password_1.hashPassword)(password);
        let userId;
        if (existing.length > 0) {
            const user = existing[0];
            if (user?.emailVerifiedAt) {
                return reply.status(202).send(verificationRequiredResponse(email));
            }
            const [updated] = await db_1.db
                .update(db_1.users)
                .set({
                name,
                photoUrl,
                passwordHash,
                termsAcceptedAt: new Date(),
                invitedByUserId: inviteCodeRow?.createdByUserId ?? null,
            })
                .where((0, drizzle_orm_1.eq)(db_1.users.id, user.id))
                .returning({ id: db_1.users.id });
            if (!updated) {
                return reply.status(500).send({ error: "Could not update registration" });
            }
            userId = updated.id;
        }
        else {
            const [user] = await db_1.db
                .insert(db_1.users)
                .values({
                name,
                photoUrl,
                email,
                passwordHash,
                termsAcceptedAt: new Date(),
                invitedByUserId: inviteCodeRow?.createdByUserId ?? null,
            })
                .returning({ id: db_1.users.id });
            if (!user)
                return reply.status(500).send();
            userId = user.id;
        }
        // Redeem the invite code (non-admin only)
        if (inviteCodeRow) {
            await db_1.db
                .update(db_1.inviteCodes)
                .set({ redeemedByUserId: userId, redeemedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.inviteCodes.id, inviteCodeRow.id));
        }
        // Seed invite codes for the new user
        for (let i = 0; i < invite_1.MAX_INVITES_PER_USER; i++) {
            let attempts = 0;
            while (true) {
                const code = (0, invite_1.generateInviteCode)();
                try {
                    await db_1.db.insert(db_1.inviteCodes).values({ code, createdByUserId: userId });
                    break;
                }
                catch (err) {
                    attempts++;
                    const isUniqueViolation = err &&
                        typeof err === "object" &&
                        "code" in err &&
                        err.code === "23505";
                    if (!isUniqueViolation || attempts >= 5)
                        break;
                }
            }
        }
        try {
            await (0, supabase_email_verification_1.sendSupabaseVerificationEmail)({
                userId,
                email,
                name,
            });
        }
        catch (error) {
            return reply.status(503).send({
                error: error instanceof Error ? error.message : "Could not send verification email",
            });
        }
        return reply.status(202).send(verificationRequiredResponse(email));
    });
    app.post("/api/auth/verify-email", {
        config: {
            rateLimit: {
                max: 20,
                timeWindow: "1 minute",
                keyGenerator: (req) => `ip:${req.ip}`,
            },
        },
    }, async (request, reply) => {
        const body = request.body ?? {};
        const emailRaw = readOptionalTrimmedString(body.email);
        const email = emailRaw ? (0, auth_policy_1.normalizeEmail)(emailRaw) : "";
        const code = readTrimmedString(body.code);
        const tokenHash = readOptionalTrimmedString(body.token_hash);
        const verifyType = readOptionalTrimmedString(body.type);
        if (!tokenHash && (!email || !/^\d{6,8}$/.test(code))) {
            return reply.status(400).send({
                error: "Tap the email link or enter your email and verification code",
            });
        }
        try {
            const verified = tokenHash
                ? await (0, supabase_email_verification_1.verifySupabaseEmail)({
                    tokenHash,
                    type: verifyType,
                })
                : await (0, supabase_email_verification_1.verifySupabaseEmail)({
                    email,
                    code,
                });
            const [user] = await db_1.db
                .select({
                id: db_1.users.id,
                emailVerifiedAt: db_1.users.emailVerifiedAt,
            })
                .from(db_1.users)
                .where((0, drizzle_orm_1.eq)(db_1.users.email, verified.email))
                .limit(1);
            if (!user) {
                return reply.status(400).send({ error: "Could not verify email" });
            }
            if (!user.emailVerifiedAt) {
                await db_1.db
                    .update(db_1.users)
                    .set({ emailVerifiedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(db_1.users.id, user.id));
            }
            const token = app.jwt.sign({ sub: user.id });
            const onboardingState = await (0, onboarding_1.getOnboardingStateForUser)(user.id);
            return reply.send({
                token,
                user_id: user.id,
                ...onboardingState,
            });
        }
        catch (error) {
            return reply.status(400).send({
                error: error instanceof Error ? error.message : "Could not verify email",
            });
        }
    });
    app.post("/api/auth/resend-verification", {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: "1 minute",
                keyGenerator: (req) => `ip:${req.ip}`,
            },
        },
    }, async (request, reply) => {
        const body = request.body ?? {};
        const emailRaw = readOptionalTrimmedString(body.email);
        const email = emailRaw ? (0, auth_policy_1.normalizeEmail)(emailRaw) : "";
        if (!email) {
            return reply.status(400).send({ error: "email required" });
        }
        const [user] = await db_1.db
            .select({
            id: db_1.users.id,
            name: db_1.users.name,
            email: db_1.users.email,
            emailVerifiedAt: db_1.users.emailVerifiedAt,
        })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.email, email))
            .limit(1);
        if (!user || user.emailVerifiedAt || !user.email) {
            return reply.status(202).send({ ok: true });
        }
        try {
            await (0, supabase_email_verification_1.sendSupabaseVerificationEmail)({
                userId: user.id,
                email: user.email,
                name: user.name ?? null,
            });
        }
        catch (error) {
            return reply.status(503).send({
                error: error instanceof Error ? error.message : "Could not send verification email",
            });
        }
        return reply.status(202).send({ ok: true });
    });
    app.post("/api/auth/request-password-reset", {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: "1 minute",
                keyGenerator: (req) => `ip:${req.ip}`,
            },
        },
    }, async (request, reply) => {
        const body = request.body ?? {};
        const emailRaw = readOptionalTrimmedString(body.email);
        const email = emailRaw ? (0, auth_policy_1.normalizeEmail)(emailRaw) : "";
        if (!email) {
            return reply.status(400).send({ error: "email required" });
        }
        const [user] = await db_1.db
            .select({
            email: db_1.users.email,
            emailVerifiedAt: db_1.users.emailVerifiedAt,
        })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.email, email))
            .limit(1);
        if (!user?.email || !user.emailVerifiedAt) {
            return reply.status(202).send({ ok: true });
        }
        try {
            await (0, supabase_email_verification_1.sendSupabasePasswordRecoveryEmail)({
                email: user.email,
            });
        }
        catch (error) {
            return reply.status(503).send({
                error: error instanceof Error ? error.message : "Could not send password reset email",
            });
        }
        return reply.status(202).send({ ok: true });
    });
    app.post("/api/auth/reset-password", {
        config: {
            rateLimit: {
                max: 20,
                timeWindow: "1 minute",
                keyGenerator: (req) => `ip:${req.ip}`,
            },
        },
    }, async (request, reply) => {
        const body = request.body ?? {};
        const emailRaw = readOptionalTrimmedString(body.email);
        const email = emailRaw ? (0, auth_policy_1.normalizeEmail)(emailRaw) : "";
        const code = readTrimmedString(body.code);
        const tokenHash = readOptionalTrimmedString(body.token_hash);
        const accessToken = readOptionalTrimmedString(body.access_token);
        const password = typeof body.password === "string" ? body.password : "";
        const passwordError = (0, auth_policy_1.validateStrongPassword)(password);
        if (passwordError) {
            return reply.status(400).send({ error: passwordError });
        }
        if (!tokenHash && !accessToken && (!email || !/^\d{6,8}$/.test(code))) {
            return reply.status(400).send({
                error: "Open the reset link or enter your email and reset code",
            });
        }
        try {
            const verified = tokenHash
                ? await (0, supabase_email_verification_1.verifySupabaseRecovery)({
                    tokenHash,
                    type: body.type,
                })
                : accessToken
                    ? await (0, supabase_email_verification_1.verifySupabaseRecovery)({
                        accessToken,
                        type: body.type,
                    })
                    : await (0, supabase_email_verification_1.verifySupabaseRecovery)({
                        email,
                        code,
                    });
            const [user] = await db_1.db
                .select({
                id: db_1.users.id,
            })
                .from(db_1.users)
                .where((0, drizzle_orm_1.eq)(db_1.users.email, verified.email))
                .limit(1);
            if (!user) {
                return reply.status(400).send({ error: "Could not reset password" });
            }
            const passwordHash = await (0, password_1.hashPassword)(password);
            await db_1.db
                .update(db_1.users)
                .set({ passwordHash })
                .where((0, drizzle_orm_1.eq)(db_1.users.id, user.id));
            return reply.status(200).send({ ok: true });
        }
        catch (error) {
            return reply.status(400).send({
                error: error instanceof Error ? error.message : "Could not reset password",
            });
        }
    });
    app.post("/api/auth/login", {
        config: {
            rateLimit: {
                max: 20,
                timeWindow: "1 minute",
                keyGenerator: (req) => `ip:${req.ip}`,
            },
        },
    }, async (request, reply) => {
        const body = request.body ?? {};
        const email = (0, auth_policy_1.normalizeEmail)(readTrimmedString(body.email));
        const password = typeof body.password === "string" ? body.password : "";
        if (!email || !password)
            return reply.status(400).send({ error: "email and password required" });
        const [user] = await db_1.db
            .select({
            id: db_1.users.id,
            passwordHash: db_1.users.passwordHash,
            emailVerifiedAt: db_1.users.emailVerifiedAt,
        })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.email, email))
            .limit(1);
        if (!user ||
            !user.passwordHash ||
            !(await (0, password_1.verifyPassword)(password, user.passwordHash)))
            return reply.status(401).send({ error: "Incorrect email or password" });
        if (!user.emailVerifiedAt) {
            return reply.status(403).send({ error: "Verify your email before logging in" });
        }
        const token = app.jwt.sign({ sub: user.id });
        const onboardingState = await (0, onboarding_1.getOnboardingStateForUser)(user.id);
        return reply.send({
            token,
            user_id: user.id,
            ...onboardingState,
        });
    });
}
