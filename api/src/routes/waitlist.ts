import type { FastifyInstance } from "fastify";
import { db, waitlistSignups } from "../db";
import { normalizeEmail } from "../lib/auth-policy";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function waitlistRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { email?: string; source?: string };
  }>(
    "/api/waitlist",
    {
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "1 minute",
          keyGenerator: (req) => `ip:${req.ip}`,
        },
      },
    },
    async (request, reply) => {
      const body = request.body ?? {};
      const emailInput = readTrimmedString(body.email);
      const email = emailInput ? normalizeEmail(emailInput) : "";
      const source = readTrimmedString(body.source) || "website";

      if (!email || !EMAIL_PATTERN.test(email)) {
        return reply.status(400).send({ error: "valid email required" });
      }

      const inserted = await db
        .insert(waitlistSignups)
        .values({ email, source })
        .onConflictDoNothing({ target: waitlistSignups.email })
        .returning({ id: waitlistSignups.id });

      return reply.status(inserted[0] ? 201 : 200).send({
        ok: true,
        already_subscribed: inserted.length === 0,
      });
    }
  );
}
