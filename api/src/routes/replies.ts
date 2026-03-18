import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db, thoughts, replies, conversations, messages, thoughtFeedStats, users } from "../db";
import { invalidateFeedCache } from "../feed";
import { getUserId, authenticate } from "../lib/auth";
import { trackEngagementEvents } from "../engagement/track";
import { filterContent } from "../lib/content-filter";
import { notifyNewReply, notifyResonanceMilestone } from "../lib/push";

const REPLY_TEXT_MIN = 30;
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
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

      const textFilter = filterContent(text);
      if (textFilter.flagged) {
        return reply.status(400).send({
          error: "Your reply was flagged for potentially objectionable content. Please revise and try again.",
        });
      }

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

      // Push notification to thought author
      notifyNewReply(t.userId, userId, t.sentence, text).catch(() => {});

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
    const accepted = await db.transaction(async (tx) => {
      const [existingReply] = await tx.select().from(replies).where(eq(replies.id, replyId)).limit(1);
      if (!existingReply) return { status: 404 as const };

      const [thought] = await tx.select().from(thoughts).where(eq(thoughts.id, existingReply.thoughtId)).limit(1);
      if (!thought || thought.userId !== userId) return { status: 403 as const };

      const [acceptedReply] = await tx
        .update(replies)
        .set({ status: "accepted" })
        .where(and(eq(replies.id, replyId), eq(replies.status, "pending")))
        .returning();

      if (!acceptedReply) {
        const [existingConversation] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.replyId, replyId))
          .limit(1);
        return existingConversation
          ? {
              status: 200 as const,
              conversationId: existingConversation.id,
              thoughtId: thought.id,
              replierId: existingReply.replierId,
              authorId: thought.userId,
              trackAcceptance: false,
            }
          : { status: 409 as const };
      }

      const now = new Date();
      let conversationId: string | null = null;
      let createdConversation = false;

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
        createdConversation = Boolean(created);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }

      if (!conversationId) {
        const [existingConversation] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.replyId, acceptedReply.id))
          .limit(1);
        conversationId = existingConversation?.id ?? null;
      }

      if (!conversationId) {
        throw new Error("Failed to create or load conversation for accepted reply");
      }

      if (createdConversation) {
        await tx.insert(messages).values({
          conversationId,
          senderId: acceptedReply.replierId,
          text: acceptedReply.text,
        });
      }

      // Update materialized reply stats for this thought
      const [author, replier] = await Promise.all([
        tx
          .select({ concentration: users.concentration })
          .from(users)
          .where(eq(users.id, thought.userId))
          .limit(1),
        tx
          .select({ concentration: users.concentration })
          .from(users)
          .where(eq(users.id, acceptedReply.replierId))
          .limit(1),
      ]);
      const authorConc = (author?.concentration ?? "").trim().toLowerCase();
      const replierConc = (replier?.concentration ?? "").trim().toLowerCase();
      const isCrossDomain =
        authorConc.length > 0 && replierConc.length > 0 && authorConc !== replierConc;

      await tx
        .insert(thoughtFeedStats)
        .values({
          thoughtId: thought.id,
          acceptedReplyCount: 1,
          crossDomainAcceptedReplyCount: isCrossDomain ? 1 : 0,
          sustainedConversationCount: 0,
          maxConversationDepth: 1,
        })
        .onConflictDoUpdate({
          target: thoughtFeedStats.thoughtId,
          set: {
            acceptedReplyCount: sql`thought_feed_stats.accepted_reply_count + 1`,
            crossDomainAcceptedReplyCount: isCrossDomain
              ? sql`thought_feed_stats.cross_domain_accepted_reply_count + 1`
              : thoughtFeedStats.crossDomainAcceptedReplyCount,
            updatedAt: sql`now()`,
          },
        });

      return {
        status: 200 as const,
        conversationId,
        thoughtId: thought.id,
        replierId: acceptedReply.replierId,
        authorId: thought.userId,
        trackAcceptance: true,
      };
    });

    if (accepted.status !== 200) {
      return reply.status(accepted.status).send();
    }

    void invalidateFeedCache(accepted.authorId);
    void invalidateFeedCache(accepted.replierId);

    // Check if this thought hit the 10+ accepted-reply milestone
    if (accepted.trackAcceptance) {
      (async () => {
        try {
          const [stats] = await db
            .select({ count: thoughtFeedStats.acceptedReplyCount })
            .from(thoughtFeedStats)
            .where(eq(thoughtFeedStats.thoughtId, accepted.thoughtId))
            .limit(1);
          const count = stats?.count ?? 0;
          if (count === 10) {
            const [t] = await db.select({ sentence: thoughts.sentence }).from(thoughts).where(eq(thoughts.id, accepted.thoughtId)).limit(1);
            if (t) notifyResonanceMilestone(accepted.authorId, t.sentence, count).catch(() => {});
          }
        } catch {}
      })();
    }

    if (accepted.trackAcceptance) {
      trackEngagementEvents(userId, [{
        event_type: "reply_accepted",
        thought_id: accepted.thoughtId,
        session_id: "",
        metadata: { reply_id: replyId, replier_id: accepted.replierId },
        timestamp: new Date().toISOString(),
      }]).catch(() => {});
    }

    return reply.send({ conversation_id: accepted.conversationId });
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
