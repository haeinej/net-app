import type { FastifyInstance } from "fastify";
import { eq, and, desc, inArray, isNull, isNotNull } from "drizzle-orm";
import { db, thoughts, users } from "../db";
import { getUserId, authenticate } from "../lib/auth";
import { getBlockedUserIds } from "../lib/blocked-users";

interface NotificationsQuery {
  limit?: string;
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  app.get<{ Querystring: NotificationsQuery }>("/api/notifications", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const rawLimit = parseInt(request.query.limit ?? "50", 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;

    // Find the viewer's own thought IDs
    const ownThoughtRows = await db
      .select({ id: thoughts.id })
      .from(thoughts)
      .where(and(eq(thoughts.userId, userId), isNull(thoughts.deletedAt)));
    const ownThoughtIds = ownThoughtRows.map((t) => t.id);

    if (ownThoughtIds.length === 0) {
      return reply.send([]);
    }

    // Find reply-cards: thoughts where inResponseToId points to one of the viewer's thoughts
    const replyCards = await db
      .select({
        id: thoughts.id,
        sentence: thoughts.sentence,
        userId: thoughts.userId,
        inResponseToId: thoughts.inResponseToId,
        createdAt: thoughts.createdAt,
      })
      .from(thoughts)
      .where(
        and(
          inArray(thoughts.inResponseToId, ownThoughtIds),
          isNull(thoughts.deletedAt),
          isNotNull(thoughts.inResponseToId)
        )
      )
      .orderBy(desc(thoughts.createdAt))
      .limit(limit);

    if (replyCards.length === 0) {
      return reply.send([]);
    }

    // Fetch author info for reply-card authors
    const authorIds = [...new Set(replyCards.map((r) => r.userId))];
    const authorRows = await db
      .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
      .from(users)
      .where(inArray(users.id, authorIds));
    const authorMap = new Map(authorRows.map((u) => [u.id, u]));

    // Fetch original thought sentences
    const originalThoughtIds = [...new Set(replyCards.map((r) => r.inResponseToId!))];
    const originalThoughtRows = await db
      .select({ id: thoughts.id, sentence: thoughts.sentence })
      .from(thoughts)
      .where(inArray(thoughts.id, originalThoughtIds));
    const originalMap = new Map(originalThoughtRows.map((t) => [t.id, t]));

    // Filter out replies from blocked users
    const blockedIds = await getBlockedUserIds(userId);
    const filteredCards = blockedIds.size > 0
      ? replyCards.filter((r) => !blockedIds.has(r.userId))
      : replyCards;

    const body = filteredCards.map((r) => {
      const author = authorMap.get(r.userId);
      const original = r.inResponseToId ? originalMap.get(r.inResponseToId) : null;
      return {
        id: r.id,
        sentence: r.sentence,
        author: author ? { id: author.id, name: author.name, photo_url: author.photoUrl } : null,
        original_thought: original ? { id: original.id, sentence: original.sentence } : null,
        created_at: r.createdAt?.toISOString(),
      };
    });
    return reply.send(body);
  });
}
