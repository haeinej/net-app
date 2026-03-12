import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq, and, isNull } from "drizzle-orm";
import { db, thoughts, replies, conversations, messages } from "../db";
import { getUserId, authenticate } from "../lib/auth";
import { trackEngagementEvents } from "../engagement/track";

const REPLY_TEXT_MIN = 50;
const REPLY_TEXT_MAX = 300;

interface ReplyBody {
  text?: string;
}

interface ThoughtIdParam {
  id: string;
}

interface ReplyIdParam {
  id: string;
}

export async function replyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  app.post<{ Params: ThoughtIdParam; Body: ReplyBody }>(
    "/api/thoughts/:id/reply",
    async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();
      const thoughtId = request.params.id;
      const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
      if (!text) return reply.status(400).send({ error: "text required" });
      if (text.length < REPLY_TEXT_MIN) {
        return reply
          .status(400)
          .send({ error: `text min ${REPLY_TEXT_MIN} chars` });
      }
      if (text.length > REPLY_TEXT_MAX)
        return reply.status(400).send({ error: `text max ${REPLY_TEXT_MAX} chars` });

      const [t] = await db.select().from(thoughts).where(and(eq(thoughts.id, thoughtId), isNull(thoughts.deletedAt)));
      if (!t) return reply.status(404).send();
      if (t.userId === userId) return reply.status(403).send();
      const existing = await db
        .select()
        .from(replies)
        .where(
          and(
            eq(replies.thoughtId, thoughtId),
            eq(replies.replierId, userId),
            eq(replies.status, "pending")
          )
        )
        .limit(1);
      if (existing.length > 0) return reply.status(409).send();

      const [row] = await db
        .insert(replies)
        .values({ thoughtId, replierId: userId, text, status: "pending" })
        .returning({ id: replies.id, status: replies.status, createdAt: replies.createdAt });
      if (!row) return reply.status(500).send();

      trackEngagementEvents(userId, [
        {
          event_type: "reply_sent",
          thought_id: thoughtId,
          session_id: "",
          metadata: { reply_length_chars: text.length },
          timestamp: new Date().toISOString(),
        },
      ]).catch(() => {});

      return reply.status(201).send({
        id: row.id,
        status: "pending",
        created_at: row.createdAt?.toISOString(),
      });
    }
  );

  app.post<{ Params: ReplyIdParam }>("/api/replies/:id/accept", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const replyId = request.params.id;
    const [r] = await db.select().from(replies).where(eq(replies.id, replyId));
    if (!r || r.status !== "pending") return reply.status(404).send();
    const [t] = await db.select().from(thoughts).where(eq(thoughts.id, r.thoughtId));
    if (!t || t.userId !== userId) return reply.status(403).send();
    const replierId = r.replierId;
    const authorId = t.userId;
    const participantA = authorId;
    const participantB = replierId;

    await db.update(replies).set({ status: "accepted" }).where(eq(replies.id, replyId));
    trackEngagementEvents(userId, [{
      event_type: "reply_accepted",
      thought_id: t.id,
      session_id: "",
      metadata: { reply_id: replyId, replier_id: replierId },
      timestamp: new Date().toISOString(),
    }]).catch(() => {});
    const [conv] = await db
      .insert(conversations)
      .values({
        thoughtId: t.id,
        replyId: r.id,
        participantA,
        participantB,
        messageCount: 1,
        lastMessageAt: new Date(),
        participantASeenAt: new Date(),
        participantBSeenAt: new Date(),
      })
      .returning({ id: conversations.id });
    if (!conv) return reply.status(500).send();
    await db.insert(messages).values({
      conversationId: conv.id,
      senderId: replierId,
      text: r.text,
    });
    return reply.send({ conversation_id: conv.id });
  });

  const ignoreReply = async (request: FastifyRequest<{ Params: ReplyIdParam }>, reply: FastifyReply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const replyId = request.params.id;
    const [r] = await db.select().from(replies).where(eq(replies.id, replyId));
    if (!r) return reply.status(404).send();
    const [t] = await db.select().from(thoughts).where(eq(thoughts.id, r.thoughtId));
    if (!t || t.userId !== userId) return reply.status(403).send();
    await db.update(replies).set({ status: "deleted" }).where(eq(replies.id, replyId));
    return reply.status(200).send();
  };

  app.post<{ Params: ReplyIdParam }>("/api/replies/:id/ignore", ignoreReply);
  app.post<{ Params: ReplyIdParam }>("/api/replies/:id/delete", ignoreReply);
}
