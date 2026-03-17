import type { FastifyInstance } from "fastify";
import { eq, and, desc, inArray, isNull } from "drizzle-orm";
import { db, thoughts, replies, users } from "../db";
import { getUserId, authenticate } from "../lib/auth";
import { getBlockedUserIds } from "../lib/blocked-users";

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  app.get("/api/notifications", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const pendingReplies = await db
      .select({
        replyId: replies.id,
        text: replies.text,
        createdAt: replies.createdAt,
        thoughtId: replies.thoughtId,
        replierId: replies.replierId,
      })
      .from(replies)
      .innerJoin(thoughts, eq(replies.thoughtId, thoughts.id))
      .where(and(eq(thoughts.userId, userId), eq(replies.status, "pending"), isNull(thoughts.deletedAt)))
      .orderBy(desc(replies.createdAt));
    const thoughtIds = [...new Set(pendingReplies.map((r) => r.thoughtId))];
    const replierIds = [...new Set(pendingReplies.map((r) => r.replierId))];
    const thoughtRows =
      thoughtIds.length > 0
        ? await db
            .select({
              id: thoughts.id,
              sentence: thoughts.sentence,
            })
            .from(thoughts)
            .where(inArray(thoughts.id, thoughtIds))
        : [];
    const replierRows =
      replierIds.length > 0
        ? await db
            .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
            .from(users)
            .where(inArray(users.id, replierIds))
        : [];
    const thoughtMap = new Map(thoughtRows.map((t) => [t.id, t]));
    const replierMap = new Map(replierRows.map((u) => [u.id, u]));
    // Filter out replies from blocked users
    const blockedIds = await getBlockedUserIds(userId);
    const filteredReplies = blockedIds.size > 0
      ? pendingReplies.filter((r) => !blockedIds.has(r.replierId))
      : pendingReplies;
    const body = filteredReplies.map((r) => {
      const t = thoughtMap.get(r.thoughtId);
      const u = replierMap.get(r.replierId);
      return {
        reply_id: r.replyId,
        replier: u ? { id: u.id, name: u.name, photo_url: u.photoUrl } : null,
        reply_preview: r.text.slice(0, 100),
        thought: t ? { id: t.id, sentence: t.sentence } : null,
        created_at: r.createdAt?.toISOString(),
      };
    });
    return reply.send(body);
  });
}
