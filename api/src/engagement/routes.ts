/**
 * Engagement tracking routes (Phase 6). POST /api/engagement/track — auth required.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { sql } from "drizzle-orm";
import { db, systemConfig } from "../db";
import { trackEngagementEvents } from "./track";
import type { TrackRequestBody } from "./types";

export async function engagementRoutes(app: FastifyInstance): Promise<void> {
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send();
    }
  };

  app.post<{ Body: TrackRequestBody }>(
    "/api/engagement/track",
    {
      onRequest: [authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 hour",
          keyGenerator: (req) => {
            const userId = (req.user as { sub?: string } | undefined)?.sub;
            return userId ? `user:${userId}` : `ip:${req.ip}`;
          },
        },
      },
    },
    async (request, reply) => {
      const userId = (request.user as { sub?: string } | undefined)?.sub;
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
      await trackEngagementEvents(userId, body.events);
      // Increment aggregated total engagement events counter in system_config
      const increment = body.events.length;
      await db
        .insert(systemConfig)
        .values({ key: "total_engagement_events", value: increment })
        .onConflictDoUpdate({
          target: systemConfig.key,
          set: {
            value: sql`to_jsonb(coalesce((system_config.value)::int, 0) + ${increment})`,
          },
        });
      return reply.status(200).send({ ingested: body.events.length });
    }
  );
}
