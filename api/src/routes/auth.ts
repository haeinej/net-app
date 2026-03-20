/**
 * Auth: register (onboarding step 1) and login.
 * JWT payload: { sub: user.id }
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db, users } from "../db";
import { getOnboardingStateForUser } from "../lib/onboarding";
import { normalizeEmail, validateStrongPassword } from "../lib/auth-policy";
import {
  sendSupabaseVerificationEmail,
  sendSupabasePasswordRecoveryEmail,
  verifySupabaseEmail,
  verifySupabaseRecovery,
} from "../lib/supabase-email-verification";
import { hashPassword, verifyPassword } from "../lib/password";

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalTrimmedString(value: unknown): string | null {
  const normalized = readTrimmedString(value);
  return normalized || null;
}

function verificationRequiredResponse(email: string) {
  return {
    verification_required: true as const,
    verification_email: email,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      name?: string;
      photo_url?: string;
      email?: string;
      password?: string;
      terms_accepted?: boolean;
    };
  }>(
    "/api/auth/register",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (req) => `ip:${req.ip}`,
        },
      },
    },
    async (request, reply) => {
    const body = request.body ?? {};
    const name = readTrimmedString(body.name);
    const photoUrl = readOptionalTrimmedString(body.photo_url);
    const emailRaw = readOptionalTrimmedString(body.email);
    const email = emailRaw ? normalizeEmail(emailRaw) : null;
    const password = typeof body.password === "string" ? body.password : "";
    const termsAccepted = body.terms_accepted === true;

    if (!name) return reply.status(400).send({ error: "name required" });
    if (!photoUrl) {
      return reply.status(400).send({ error: "profile photo required" });
    }
    if (!termsAccepted) return reply.status(400).send({ error: "You must accept the Terms of Use" });
    if (!email) return reply.status(400).send({ error: "email required" });
    const passwordError = validateStrongPassword(password);
    if (passwordError) {
      return reply.status(400).send({ error: passwordError });
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const passwordHash = await hashPassword(password);

    let userId: string;
    if (existing.length > 0) {
      const user = existing[0];
      if (user?.emailVerifiedAt) {
        return reply.status(202).send(verificationRequiredResponse(email));
      }

      const [updated] = await db
        .update(users)
        .set({
          name,
          photoUrl,
          passwordHash,
          termsAcceptedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning({ id: users.id });

      if (!updated) {
        return reply.status(500).send({ error: "Could not update registration" });
      }

      userId = updated.id;
    } else {
      const [user] = await db
        .insert(users)
        .values({
          name,
          photoUrl,
          email,
          passwordHash,
          termsAcceptedAt: new Date(),
        })
        .returning({ id: users.id });

      if (!user) return reply.status(500).send();
      userId = user.id;
    }

      try {
        await sendSupabaseVerificationEmail({
          userId,
          email,
          name,
        });
    } catch (error) {
      return reply.status(503).send({
        error:
          error instanceof Error ? error.message : "Could not send verification email",
      });
    }

    return reply.status(202).send(verificationRequiredResponse(email));
  });

  app.post<{
    Body: { email?: string; code?: string; token_hash?: string; type?: string };
  }>(
    "/api/auth/verify-email",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
          keyGenerator: (req) => `ip:${req.ip}`,
        },
      },
    },
    async (request, reply) => {
      const body = request.body ?? {};
      const emailRaw = readOptionalTrimmedString(body.email);
      const email = emailRaw ? normalizeEmail(emailRaw) : "";
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
          ? await verifySupabaseEmail({
              tokenHash,
              type: verifyType,
            })
          : await verifySupabaseEmail({
              email,
              code,
            });

        const [user] = await db
          .select({
            id: users.id,
            emailVerifiedAt: users.emailVerifiedAt,
          })
          .from(users)
          .where(eq(users.email, verified.email))
          .limit(1);

        if (!user) {
          return reply.status(400).send({ error: "Could not verify email" });
        }

        if (!user.emailVerifiedAt) {
          await db
            .update(users)
            .set({ emailVerifiedAt: new Date() })
            .where(eq(users.id, user.id));
        }

        const token = app.jwt.sign({ sub: user.id });
        const onboardingState = await getOnboardingStateForUser(user.id);
        return reply.send({
          token,
          user_id: user.id,
          ...onboardingState,
        });
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "Could not verify email",
        });
      }
    }
  );

  app.post<{
    Body: { email?: string };
  }>(
    "/api/auth/resend-verification",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (req) => `ip:${req.ip}`,
        },
      },
    },
    async (request, reply) => {
      const body = request.body ?? {};
      const emailRaw = readOptionalTrimmedString(body.email);
      const email = emailRaw ? normalizeEmail(emailRaw) : "";
      if (!email) {
        return reply.status(400).send({ error: "email required" });
      }

      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          emailVerifiedAt: users.emailVerifiedAt,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user || user.emailVerifiedAt || !user.email) {
        return reply.status(202).send({ ok: true });
      }

      try {
        await sendSupabaseVerificationEmail({
          userId: user.id,
          email: user.email,
          name: user.name ?? null,
        });
      } catch (error) {
        return reply.status(503).send({
          error:
            error instanceof Error ? error.message : "Could not send verification email",
        });
      }

      return reply.status(202).send({ ok: true });
    }
  );

  app.post<{
    Body: { email?: string };
  }>(
    "/api/auth/request-password-reset",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (req) => `ip:${req.ip}`,
        },
      },
    },
    async (request, reply) => {
      const body = request.body ?? {};
      const emailRaw = readOptionalTrimmedString(body.email);
      const email = emailRaw ? normalizeEmail(emailRaw) : "";
      if (!email) {
        return reply.status(400).send({ error: "email required" });
      }

      const [user] = await db
        .select({
          email: users.email,
          emailVerifiedAt: users.emailVerifiedAt,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user?.email || !user.emailVerifiedAt) {
        return reply.status(202).send({ ok: true });
      }

      try {
        await sendSupabasePasswordRecoveryEmail({
          email: user.email,
        });
      } catch (error) {
        return reply.status(503).send({
          error:
            error instanceof Error ? error.message : "Could not send password reset email",
        });
      }

      return reply.status(202).send({ ok: true });
    }
  );

  app.post<{
    Body: { email?: string; code?: string; token_hash?: string; type?: string; password?: string };
  }>(
    "/api/auth/reset-password",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
          keyGenerator: (req) => `ip:${req.ip}`,
        },
      },
    },
    async (request, reply) => {
      const body = request.body ?? {};
      const emailRaw = readOptionalTrimmedString(body.email);
      const email = emailRaw ? normalizeEmail(emailRaw) : "";
      const code = readTrimmedString(body.code);
      const tokenHash = readOptionalTrimmedString(body.token_hash);
      const password = typeof body.password === "string" ? body.password : "";

      const passwordError = validateStrongPassword(password);
      if (passwordError) {
        return reply.status(400).send({ error: passwordError });
      }

      if (!tokenHash && (!email || !/^\d{6,8}$/.test(code))) {
        return reply.status(400).send({
          error: "Open the reset link or enter your email and reset code",
        });
      }

      try {
        const verified = tokenHash
          ? await verifySupabaseRecovery({
              tokenHash,
              type: body.type,
            })
          : await verifySupabaseRecovery({
              email,
              code,
            });

        const [user] = await db
          .select({
            id: users.id,
          })
          .from(users)
          .where(eq(users.email, verified.email))
          .limit(1);

        if (!user) {
          return reply.status(400).send({ error: "Could not reset password" });
        }

        const passwordHash = await hashPassword(password);
        await db
          .update(users)
          .set({ passwordHash })
          .where(eq(users.id, user.id));

        return reply.status(200).send({ ok: true });
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "Could not reset password",
        });
      }
    }
  );

  app.post<{
    Body: { email?: string; password?: string };
  }>(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
          keyGenerator: (req) => `ip:${req.ip}`,
        },
      },
    },
    async (request, reply) => {
    const body = request.body ?? {};
    const email = normalizeEmail(readTrimmedString(body.email));
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password)
      return reply.status(400).send({ error: "email and password required" });

    const [user] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (
      !user ||
      !user.passwordHash ||
      !(await verifyPassword(password, user.passwordHash))
    )
      return reply.status(401).send({ error: "Incorrect email or password" });

    if (!user.emailVerifiedAt) {
      return reply.status(403).send({ error: "Verify your email before logging in" });
    }

    const token = app.jwt.sign({ sub: user.id });
    const onboardingState = await getOnboardingStateForUser(user.id);
    return reply.send({
      token,
      user_id: user.id,
      ...onboardingState,
    });
  });
}
