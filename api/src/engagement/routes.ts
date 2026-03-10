/**
 * Engagement tracking routes (Phase 6). POST /api/engagement/track — auth required.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
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
    { onRequest: [authenticate] },
    async (request, reply) => {
      const userId = (request.user as { sub?: string } | undefined)?.sub;
      if (!userId) {
        return reply.status(401).send();
      }
      const body = request.body;
      if (!body || !Array.isArray(body.events)) {
        return reply.status(400).send({ error: "Body must contain events array" });
      }
      await trackEngagementEvents(userId, body.events);
      return reply.status(200).send();
    }
  );
}
