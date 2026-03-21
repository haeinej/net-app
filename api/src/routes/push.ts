import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, pushTokens } from "../db";
import { getUserId, authenticate } from "../lib/auth";

interface RegisterTokenBody {
  token?: string;
  platform?: string;
}

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  /** Register or refresh an Expo push token. */
  app.post<{ Body: RegisterTokenBody }>("/api/push/register", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();

    const token = typeof request.body?.token === "string" ? request.body.token.trim() : "";
    const platform = typeof request.body?.platform === "string" ? request.body.platform.trim() : "";

    if (!token || !platform) {
      return reply.status(400).send({ error: "token and platform required" });
    }
    if (!["ios", "android"].includes(platform)) {
      return reply.status(400).send({ error: "platform must be ios or android" });
    }

    // Upsert: if this token exists, update the user + timestamp
    const existing = await db
      .select({ id: pushTokens.id, userId: pushTokens.userId })
      .from(pushTokens)
      .where(eq(pushTokens.token, token))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(pushTokens)
        .set({ userId, platform, updatedAt: new Date() })
        .where(eq(pushTokens.token, token));
    } else {
      await db.insert(pushTokens).values({ userId, token, platform });
    }

    return reply.send({ ok: true });
  });

  /** Unregister a push token (logout / disable notifications). */
  app.delete<{ Body: { token?: string } }>("/api/push/register", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();

    const token = typeof request.body?.token === "string" ? request.body.token.trim() : "";
    if (!token) return reply.status(400).send({ error: "token required" });

    await db
      .delete(pushTokens)
      .where(and(eq(pushTokens.token, token), eq(pushTokens.userId, userId)));

    return reply.send({ ok: true });
  });
}
