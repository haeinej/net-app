import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { getFeed, getFeedWithDebug } from "../feed";
import { db, thoughts, users } from "../db";
import { getUserId, authenticate } from "../lib/auth";
import type { FeedItem } from "../feed";

async function getFallbackFeed(
  userId: string,
  limit: number,
  offset: number
): Promise<FeedItem[]> {
  const rows = await db
    .select({
      thought: thoughts,
      authorId: users.id,
      authorName: users.name,
      authorPhotoUrl: users.photoUrl,
    })
    .from(thoughts)
    .innerJoin(users, eq(thoughts.userId, users.id))
    .where(and(ne(thoughts.userId, userId), isNull(thoughts.deletedAt)))
    .orderBy(desc(thoughts.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    type: "thought",
    thought: {
      id: row.thought.id,
      sentence: row.thought.sentence,
      photo_url: row.thought.photoUrl,
      image_url: row.thought.imageUrl,
      created_at: row.thought.createdAt?.toISOString() ?? new Date().toISOString(),
      has_context: (row.thought.context ?? "").trim().length > 0,
    },
    user: {
      id: row.authorId,
      name: row.authorName,
      photo_url: row.authorPhotoUrl,
    },
  }));
}

export async function feedRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>("/api/feed", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "20", 10) || 20));
    const offset = Math.max(0, parseInt(request.query.offset ?? "0", 10) || 0);
    try {
      const items = await getFeed(userId, limit, offset);
      return reply.send(items);
    } catch (error) {
      request.log.error(
        { error, userId, limit, offset },
        "feed load failed; serving fallback feed"
      );
      try {
        const fallbackItems = await getFallbackFeed(userId, limit, offset);
        return reply.send(fallbackItems);
      } catch (fallbackError) {
        request.log.error(
          { error: fallbackError, userId, limit, offset },
          "fallback feed failed; returning empty feed"
        );
        return reply.send([]);
      }
    }
  });

  if (process.env.ENABLE_DEBUG_ENDPOINTS === "true" && process.env.NODE_ENV !== "production") {
    app.get<{
      Querystring: { limit?: string; offset?: string };
    }>("/api/feed/debug", async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "20", 10) || 20));
      const offset = Math.max(0, parseInt(request.query.offset ?? "0", 10) || 0);
      const items = await getFeedWithDebug(userId, limit, offset);
      const body = items.map((t: any) => ({
        id: t.thought?.id,
        sentence: t.thought?.sentence,
        photo_url: t.thought?.photo_url,
        image_url: t.thought?.image_url,
        created_at: t.thought?.created_at,
        user: t.user,
        has_context: t.thought?.has_context,
        _debug: t._debug,
      }));
      return reply.send(body);
    });
  }
}
