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

type AcceptReplyPhase =
  | "accept_reply"
  | "conversation_create"
  | "conversation_load"
  | "message_insert"
  | "stats_read_users"
  | "stats_write";

type AcceptReplyResult =
  | {
      status: 200;
      conversationId: string;
      thoughtId: string;
      replierId: string;
      authorId: string;
      trackAcceptance: boolean;
    }
  | { status: 403 | 404 | 409 };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function getPgErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? ((error as { code?: unknown }).code as string | undefined) ?? null
    : null;
}

function isMissingRelationOrColumn(error: unknown): boolean {
  const code = getPgErrorCode(error);
  return code === "42P01" || code === "42703";
}

class AcceptReplyCriticalPathError extends Error {
  phase: AcceptReplyPhase;

  constructor(phase: AcceptReplyPhase, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(message);
    this.name = "AcceptReplyCriticalPathError";
    this.phase = phase;
  }
}

function wrapAcceptReplyPhase(phase: AcceptReplyPhase, error: unknown): AcceptReplyCriticalPathError {
  return new AcceptReplyCriticalPathError(phase, error);
}

async function updateThoughtFeedStatsBestEffort(
  request: FastifyRequest,
  {
    thoughtId,
    authorId,
    replierId,
    replyId,
    userId,
  }: {
    thoughtId: string;
    authorId: string;
    replierId: string;
    replyId: string;
    userId: string;
  }
): Promise<number | null> {
  try {
    const [[author], [replier]] = await Promise.all([
      db
        .select({ concentration: users.concentration })
        .from(users)
        .where(eq(users.id, authorId))
        .limit(1),
      db
        .select({ concentration: users.concentration })
        .from(users)
        .where(eq(users.id, replierId))
        .limit(1),
    ]);

    const authorConc = (author?.concentration ?? "").trim().toLowerCase();
    const replierConc = (replier?.concentration ?? "").trim().toLowerCase();
    const isCrossDomain =
      authorConc.length > 0 && replierConc.length > 0 && authorConc !== replierConc;

    const [stats] = await db
      .insert(thoughtFeedStats)
      .values({
        thoughtId,
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
      })
      .returning({ acceptedReplyCount: thoughtFeedStats.acceptedReplyCount });

    return stats?.acceptedReplyCount ?? null;
  } catch (err) {
    const phase: AcceptReplyPhase = isMissingRelationOrColumn(err)
      ? "stats_write"
      : getPgErrorCode(err) === null
        ? "stats_read_users"
        : "stats_write";
    if (isMissingRelationOrColumn(err)) {
      request.log.warn(
        { err, phase, replyId, userId, thoughtId, authorId, replierId },
        "accept reply stats update failed"
      );
    } else {
      request.log.error(
        { err, phase, replyId, userId, thoughtId, authorId, replierId },
        "accept reply stats update failed"
      );
    }
    return null;
  }
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
      notifyNewReply(t.userId, userId, t.sentence, text, thoughtId).catch((err) => {
        console.error("[push] notifyNewReply failed:", {
          thoughtAuthorId: t.userId,
          replierId: userId,
          thoughtId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return reply.status(201).send({
        id: row.id,
        status: "pending",
        created_at: row.createdAt?.toISOString(),
      });
    }
  );

  app.post<{ Params: ReplyIdParam }>("/api/replies/:id/accept", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({
        error: "Authentication required.",
        code: "AUTH_REQUIRED",
      });
    }
    const replyId = request.params.id;
    let accepted: AcceptReplyResult;
    try {
      accepted = await db.transaction(async (tx) => {
        const [existingReply] = await tx
          .select()
          .from(replies)
          .where(eq(replies.id, replyId))
          .limit(1);
        if (!existingReply) return { status: 404 as const };

        const [thought] = await tx
          .select()
          .from(thoughts)
          .where(eq(thoughts.id, existingReply.thoughtId))
          .limit(1);
        if (!thought || thought.userId !== userId) return { status: 403 as const };

        let replyRecord = existingReply;
        let trackAcceptance = false;

        if (existingReply.status === "pending") {
          let acceptedReply: typeof replies.$inferSelect | undefined;
          try {
            [acceptedReply] = await tx
              .update(replies)
              .set({ status: "accepted" })
              .where(and(eq(replies.id, replyId), eq(replies.status, "pending")))
              .returning();
          } catch (err) {
            throw wrapAcceptReplyPhase("accept_reply", err);
          }

          if (acceptedReply) {
            replyRecord = acceptedReply;
            trackAcceptance = true;
          } else {
            const [refreshedReply] = await tx
              .select()
              .from(replies)
              .where(eq(replies.id, replyId))
              .limit(1);
            if (!refreshedReply) return { status: 404 as const };
            replyRecord = refreshedReply;
          }
        }

        if (replyRecord.status !== "accepted") {
          return { status: 409 as const };
        }

        const now = new Date();
        let conversationId: string | null = null;
        let createdConversation = false;

        try {
          const [created] = await tx
            .insert(conversations)
            .values({
              thoughtId: thought.id,
              replyId: replyRecord.id,
              participantA: thought.userId,
              participantB: replyRecord.replierId,
              messageCount: 1,
              lastMessageAt: now,
              participantASeenAt: now,
              participantBSeenAt: now,
            })
            .returning({ id: conversations.id });
          conversationId = created?.id ?? null;
          createdConversation = Boolean(created);
        } catch (err) {
          if (!isUniqueViolation(err)) {
            throw wrapAcceptReplyPhase("conversation_create", err);
          }
        }

        if (!conversationId) {
          let existingConversation: { id: string } | undefined;
          try {
            [existingConversation] = await tx
              .select({ id: conversations.id })
              .from(conversations)
              .where(eq(conversations.replyId, replyRecord.id))
              .limit(1);
          } catch (err) {
            throw wrapAcceptReplyPhase("conversation_load", err);
          }
          conversationId = existingConversation?.id ?? null;
        }

        if (!conversationId) {
          throw new AcceptReplyCriticalPathError(
            "conversation_load",
            new Error("Failed to create or load conversation for accepted reply")
          );
        }

        if (createdConversation) {
          try {
            await tx.insert(messages).values({
              conversationId,
              senderId: replyRecord.replierId,
              text: replyRecord.text,
            });
          } catch (err) {
            throw wrapAcceptReplyPhase("message_insert", err);
          }
        }

        return {
          status: 200 as const,
          conversationId,
          thoughtId: thought.id,
          replierId: replyRecord.replierId,
          authorId: thought.userId,
          trackAcceptance,
        };
      });
    } catch (err) {
      request.log.error(
        {
          err,
          phase: err instanceof AcceptReplyCriticalPathError ? err.phase : "accept_reply",
          replyId,
          userId,
        },
        "accept reply transaction failed"
      );
      return reply.status(500).send({
        error: "Couldn't open chat right now. Please try again.",
        code: "ACCEPT_REPLY_FAILED",
      });
    }

    if (accepted.status === 404) {
      return reply.status(404).send({
        error: "This reply is no longer available.",
        code: "REPLY_NOT_FOUND",
      });
    }
    if (accepted.status === 403) {
      return reply.status(403).send({
        error: "You can only accept replies to your own thoughts.",
        code: "REPLY_FORBIDDEN",
      });
    }
    if (accepted.status === 409) {
      return reply.status(409).send({
        error: "This reply has already been handled.",
        code: "REPLY_ALREADY_HANDLED",
      });
    }
    if (accepted.status !== 200) {
      return reply.status(500).send({
        error: "Couldn't open chat right now. Please try again.",
        code: "ACCEPT_REPLY_FAILED",
      });
    }

    const acceptedReplyCount = accepted.trackAcceptance
      ? await updateThoughtFeedStatsBestEffort(request, {
          thoughtId: accepted.thoughtId,
          authorId: accepted.authorId,
          replierId: accepted.replierId,
          replyId,
          userId,
        })
      : null;

    void invalidateFeedCache(accepted.authorId);
    void invalidateFeedCache(accepted.replierId);

    // Check if this thought hit the 10 accepted-reply milestone
    if (accepted.trackAcceptance && acceptedReplyCount !== null) {
      (async () => {
        try {
          const count = acceptedReplyCount;
          if (count >= 10 && count <= 12) {
            const [t] = await db
              .select({ sentence: thoughts.sentence })
              .from(thoughts)
              .where(eq(thoughts.id, accepted.thoughtId))
              .limit(1);
            if (t) {
              notifyResonanceMilestone(
                accepted.authorId,
                t.sentence,
                count,
                accepted.thoughtId
              ).catch((err) => {
                console.error("[push] notifyResonanceMilestone failed:", {
                  authorId: accepted.authorId,
                  thoughtId: accepted.thoughtId,
                  count,
                  error: err instanceof Error ? err.message : String(err),
                });
              });
            }
          }
        } catch (err) {
          console.error("[push] Resonance milestone check failed:", {
            thoughtId: accepted.thoughtId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
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
