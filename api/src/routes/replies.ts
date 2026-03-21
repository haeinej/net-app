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

    const result = await db.transaction(async (tx) => {
      const [existingReply] = await tx.select().from(replies).where(eq(replies.id, replyId)).limit(1);
      if (!existingReply) return { status: 404 as const };

      const [thought] = await tx.select().from(thoughts).where(eq(thoughts.id, existingReply.thoughtId)).limit(1);
      if (!thought || thought.userId !== userId) return { status: 403 as const };

      // Atomically update only pending replies
      const [acceptedReply] = await tx
        .update(replies)
        .set({ status: "accepted" })
        .where(and(eq(replies.id, replyId), eq(replies.status, "pending")))
        .returning();

      if (!acceptedReply) {
        // Already accepted — return existing conversation if any (idempotent)
        const [existingConv] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.replyId, replyId))
          .limit(1);
        return existingConv
          ? { status: 200 as const, conversationId: existingConv.id, replierId: existingReply.replierId, thoughtId: thought.id }
          : { status: 409 as const };
      }

      const now = new Date();
      let conversationId: string | null = null;

      try {
        const [created] = await tx
          .insert(conversations)
          .values({
            thoughtId: thought.id,
            replyId: acceptedReply.id,
            participantA: thought.userId,
            participantB: acceptedReply.replierId,
            messageCount: 1,
            lastMessageAt: now,
            participantASeenAt: now,
            participantBSeenAt: now,
          })
          .returning({ id: conversations.id });
        conversationId = created?.id ?? null;
      } catch (error: unknown) {
        // Handle unique constraint violation (concurrent accept)
        if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505") {
          const [existingConv] = await tx
            .select({ id: conversations.id })
            .from(conversations)
            .where(eq(conversations.replyId, acceptedReply.id))
            .limit(1);
          conversationId = existingConv?.id ?? null;
        } else {
          throw error;
        }
      }

      if (!conversationId) {
        throw new Error("Failed to create or load conversation for accepted reply");
      }

      await tx.insert(messages).values({
        conversationId,
        senderId: acceptedReply.replierId,
        text: acceptedReply.text,
      }).catch(() => {
        // Message may already exist from a previous partial attempt
      });

      return {
        status: 200 as const,
        conversationId,
        replierId: acceptedReply.replierId,
        thoughtId: thought.id,
      };
    });

    if (result.status !== 200) {
      return reply.status(result.status).send();
    }

    trackEngagementEvents(userId, [{
      event_type: "reply_accepted",
      thought_id: result.thoughtId,
      session_id: "",
      metadata: { reply_id: replyId, replier_id: result.replierId },
      timestamp: new Date().toISOString(),
    }]).catch(() => {});

    return reply.send({ conversation_id: result.conversationId });
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
