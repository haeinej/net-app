import type { FastifyInstance } from "fastify";
import { getFeed, getFeedWithDebug } from "../feed";
import { getUserId, authenticate } from "../lib/auth";

export async function feedRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>("/api/feed", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "20", 10) || 20));
    const offset = Math.max(0, parseInt(request.query.offset ?? "0", 10) || 0);
    const items = await getFeed(userId, limit, offset);
    return reply.send(items);
  });

  if (process.env.ENABLE_DEBUG_ENDPOINTS === "true") {
    app.get<{
      Querystring: { limit?: string; offset?: string };
    }>("/api/feed/debug", async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "20", 10) || 20));
      const offset = Math.max(0, parseInt(request.query.offset ?? "0", 10) || 0);
      const items = await getFeedWithDebug(userId, limit, offset);
      const body = items.map((item) => ({
        id: item.thought.id,
        sentence: item.thought.sentence,
        image_url: item.thought.image_url,
        created_at: item.thought.created_at,
        user: item.user,
        warmth_level: item.warmth_level,
        has_context: item.thought.has_context,
        _debug: item._debug,
      }));
      return reply.send(body);
    });
  }
}
