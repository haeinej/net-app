import type { FastifyInstance } from "fastify";
import { eq, and, isNull, count } from "drizzle-orm";
import { db, inviteCodes } from "../db";
import {
  generateInviteCode,
  isAdminInviteCode,
  MAX_INVITES_PER_USER,
} from "../lib/invite";

export async function inviteRoutes(app: FastifyInstance): Promise<void> {
  // Public: validate an invite code
  app.get<{ Querystring: { code?: string } }>(
    "/api/invites/validate",
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
      const code = (typeof request.query.code === "string" ? request.query.code : "")
        .trim()
        .toUpperCase();

      if (!code) {
        return reply.status(400).send({ valid: false });
      }

      if (isAdminInviteCode(code)) {
        return reply.send({ valid: true });
      }

      const [row] = await db
        .select({ id: inviteCodes.id })
        .from(inviteCodes)
        .where(and(eq(inviteCodes.code, code), isNull(inviteCodes.redeemedByUserId)))
        .limit(1);

      return reply.send({ valid: Boolean(row) });
    }
  );

  // Auth: get remaining invite count
  app.get("/api/me/invites", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const userId = (request.user as { sub: string }).sub;

    const [result] = await db
      .select({ total: count() })
      .from(inviteCodes)
      .where(eq(inviteCodes.createdByUserId, userId));

    const used = result?.total ?? 0;
    const remaining = Math.max(0, MAX_INVITES_PER_USER - used);

    return reply.send({ remaining });
  });

  // Auth: generate a new invite code
  app.post(
    "/api/me/invites/generate",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      const userId = (request.user as { sub: string }).sub;

      const [result] = await db
        .select({ total: count() })
        .from(inviteCodes)
        .where(eq(inviteCodes.createdByUserId, userId));

      const used = result?.total ?? 0;
      if (used >= MAX_INVITES_PER_USER) {
        return reply.status(400).send({ error: "No invites remaining" });
      }

      // Generate with collision retry
      let code: string;
      let attempts = 0;
      while (true) {
        code = generateInviteCode();
        try {
          await db.insert(inviteCodes).values({
            code,
            createdByUserId: userId,
          });
          break;
        } catch (err: unknown) {
          attempts++;
          const isUniqueViolation =
            err &&
            typeof err === "object" &&
            "code" in err &&
            (err as { code: string }).code === "23505";
          if (!isUniqueViolation || attempts >= 5) throw err;
        }
      }

      const remaining = Math.max(0, MAX_INVITES_PER_USER - used - 1);
      return reply.send({ code, remaining });
    }
  );
}
