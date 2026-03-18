import type { FastifyInstance } from "fastify";
import { eq, and, or, desc, asc, lt, inArray, sql } from "drizzle-orm";
import { db, conversations, messages, users, thoughts, crossingDrafts, crossings, thoughtFeedStats } from "../db";
import { getUserId, authenticate } from "../lib/auth";
import { trackEngagementEvents } from "../engagement/track";
import { getBlockedUserIds } from "../lib/blocked-users";
import { filterContent } from "../lib/content-filter";
import { notifyNewMessage } from "../lib/push";

const DORMANT_DAYS = 14;
const MESSAGE_PREVIEW_LEN = 100;
const MESSAGE_TEXT_MAX = 2000;
const CROSSING_MESSAGE_STEP = 10;
type CrossingDraftStatus = typeof crossingDrafts.$inferSelect.status;
const AUTO_POSTED_CROSSING_DRAFT_STATUSES: CrossingDraftStatus[] = ["auto_posted"];

function getNextCrossingMessageCount(resolvedCrossingCount: number): number {
  return (resolvedCrossingCount + 1) * CROSSING_MESSAGE_STEP;
}

interface ConvIdParam {
  id: string;
}

interface MessagesQuery {
  limit?: string;
  before_id?: string;
}

interface ConversationListQuery {
  limit?: string;
  before_id?: string;
}

async function markConversationRead(
  conv: typeof conversations.$inferSelect,
  userId: string
): Promise<void> {
  const now = new Date();
  if (conv.participantA === userId) {
    const seenAt = conv.participantASeenAt;
    if (conv.lastMessageAt && seenAt && conv.lastMessageAt <= seenAt) return;
    await db
      .update(conversations)
      .set({ participantASeenAt: now })
      .where(eq(conversations.id, conv.id));
    return;
  }

  if (conv.participantB === userId) {
    const seenAt = conv.participantBSeenAt;
    if (conv.lastMessageAt && seenAt && conv.lastMessageAt <= seenAt) return;
    await db
      .update(conversations)
      .set({ participantBSeenAt: now })
      .where(eq(conversations.id, conv.id));
  }
}

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  app.get<{ Querystring: ConversationListQuery }>("/api/conversations", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const blockedIds = await getBlockedUserIds(userId);
    const rawLimit = parseInt(request.query.limit ?? "50", 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
    const beforeId = request.query.before_id;

    let allConvs;
    if (beforeId) {
      const [before] = await db
        .select({
          id: conversations.id,
          lastMessageAt: conversations.lastMessageAt,
        })
        .from(conversations)
        .where(eq(conversations.id, beforeId));
      if (!before?.lastMessageAt) {
        allConvs = [];
      } else {
        allConvs = await db
          .select()
          .from(conversations)
          .where(
            and(
              or(
                eq(conversations.participantA, userId),
                eq(conversations.participantB, userId)
              ),
              sql`(${conversations.lastMessageAt}, ${conversations.id}) < (${before.lastMessageAt}, ${before.id})`
            )
          )
          .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
          .limit(limit);
      }
    } else {
      allConvs = await db
        .select()
        .from(conversations)
        .where(
          or(
            eq(conversations.participantA, userId),
            eq(conversations.participantB, userId)
          )
        )
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
        .limit(limit);
    }
    // Filter out conversations with blocked users
    const list = blockedIds.size > 0
      ? allConvs.filter((c) => {
          const otherId = c.participantA === userId ? c.participantB : c.participantA;
          return !blockedIds.has(otherId);
        })
      : allConvs;
    const convIds = list.map((c) => c.id);
    if (convIds.length === 0) return reply.send([]);
    const lastMessages = await db.execute<{
      conversation_id: string;
      text: string;
      created_at: Date | null;
      sender_id: string | null;
    }>(sql`
      select distinct on (conversation_id)
        conversation_id,
        text,
        created_at,
        sender_id
      from messages
      where conversation_id in (${sql.join(convIds.map((value) => sql`${value}`), sql`, `)})
      order by conversation_id, created_at desc, id desc
    `);
    const lastByConv = new Map<
      string | null,
      { text: string; createdAt: Date | null; senderId: string | null }
    >();
    for (const m of lastMessages) {
      if (m.conversation_id && !lastByConv.has(m.conversation_id))
        lastByConv.set(m.conversation_id, {
          text: m.text,
          createdAt: m.created_at,
          senderId: m.sender_id,
        });
    }
    const otherIds = list.map((c) =>
      c.participantA === userId ? c.participantB : c.participantA
    );
    const otherUsers = otherIds.length
      ? await db
          .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
          .from(users)
          .where(inArray(users.id, otherIds))
      : [];
    const userMap = new Map(otherUsers.map((u) => [u.id, u]));
    const cutoff = new Date(Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000);
    const body = list.map((c) => {
      const otherId = c.participantA === userId ? c.participantB : c.participantA;
      const other = userMap.get(otherId);
      const last = lastByConv.get(c.id);
      const seenAt =
        c.participantA === userId ? c.participantASeenAt : c.participantBSeenAt;
      const unread = Boolean(
        last &&
          last.senderId &&
          last.senderId !== userId &&
          last.createdAt &&
          (!seenAt || last.createdAt > seenAt)
      );
      return {
        id: c.id,
        other_user: other
          ? { id: other.id, name: other.name, photo_url: other.photoUrl }
          : null,
        last_message_preview: last ? last.text.slice(0, MESSAGE_PREVIEW_LEN) : "",
        last_message_at: c.lastMessageAt?.toISOString() ?? null,
        is_dormant: (c.lastMessageAt ? c.lastMessageAt < cutoff : true),
        unread,
      };
    });
    return reply.send(body);
  });

  app.get<{ Params: ConvIdParam }>("/api/conversations/:id", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const convId = request.params.id;
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId));
    if (!conv) return reply.status(404).send();
    if (conv.participantA !== userId && conv.participantB !== userId)
      return reply.status(403).send();
    await markConversationRead(conv, userId);
    const messageCount = conv.messageCount ?? 0;
    const [crossDraft] = await db
      .select()
      .from(crossingDrafts)
      .where(
        and(
          eq(crossingDrafts.conversationId, convId),
          or(eq(crossingDrafts.status, "draft"), eq(crossingDrafts.status, "awaiting_other"))
        )
      )
      .orderBy(desc(crossingDrafts.updatedAt), desc(crossingDrafts.createdAt))
      .limit(1);
    const [completedCrossingCountRow] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(crossings)
      .where(eq(crossings.conversationId, convId));
    const [autoPostedCrossingCountRow] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(crossingDrafts)
      .where(
        and(
          eq(crossingDrafts.conversationId, convId),
          inArray(crossingDrafts.status, AUTO_POSTED_CROSSING_DRAFT_STATUSES)
        )
      );
    const resolvedCrossingCount =
      Number(completedCrossingCountRow?.count ?? 0) +
      Number(autoPostedCrossingCountRow?.count ?? 0);
    const nextCrossingMessageCount = getNextCrossingMessageCount(resolvedCrossingCount);
    const [thought] = await db
      .select({
        id: thoughts.id,
        sentence: thoughts.sentence,
        photoUrl: thoughts.photoUrl,
        imageUrl: thoughts.imageUrl,
      })
      .from(thoughts)
      .where(eq(thoughts.id, conv.thoughtId))
      .limit(1);
    let initiatorName: string | null = null;
    if (crossDraft) {
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, crossDraft.initiatorId)).limit(1);
      initiatorName = u?.name ?? null;
    }
    return reply.send({
      id: conv.id,
      message_count: messageCount,
      participant_a_id: conv.participantA,
      participant_b_id: conv.participantB,
      thought: thought
        ? {
            id: thought.id,
            sentence: thought.sentence,
            photo_url: thought.photoUrl,
            image_url: thought.imageUrl,
          }
        : null,
      crossing_draft: crossDraft
        ? {
            id: crossDraft.id,
            initiator_id: crossDraft.initiatorId,
            initiator_name: initiatorName,
            sentence: crossDraft.sentence,
            context: crossDraft.context,
            status: crossDraft.status,
            submitted_at: crossDraft.submittedAt?.toISOString() ?? null,
            auto_post_at: crossDraft.autoPostAt?.toISOString() ?? null,
            auto_posted_thought_id: crossDraft.autoPostedThoughtId ?? null,
          }
        : null,
      crossing_complete: resolvedCrossingCount > 0,
      crossing_available:
        Boolean(crossDraft) || messageCount >= nextCrossingMessageCount,
      next_crossing_message_count: nextCrossingMessageCount,
    });
  });

  app.get<{ Params: ConvIdParam; Querystring: MessagesQuery }>(
    "/api/conversations/:id/messages",
    async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();
      const convId = request.params.id;
      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, convId));
      if (!conv) return reply.status(404).send();
      if (conv.participantA !== userId && conv.participantB !== userId)
        return reply.status(403).send();
      await markConversationRead(conv, userId);
      const limit = Math.min(50, Math.max(1, parseInt(request.query.limit ?? "50", 10) || 50));
      const beforeId = request.query.before_id;
      if (beforeId) {
        const [before] = await db
          .select({ id: messages.id, createdAt: messages.createdAt })
          .from(messages)
          .where(and(eq(messages.conversationId, convId), eq(messages.id, beforeId)));
        if (before?.createdAt) {
          const rows = await db
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, convId),
                sql`(${messages.createdAt}, ${messages.id}) < (${before.createdAt}, ${before.id})`
              )
            )
            .orderBy(desc(messages.createdAt), desc(messages.id))
            .limit(limit);
          const out = rows.reverse().map((m) => ({
            id: m.id,
            sender_id: m.senderId,
            text: m.text,
            created_at: m.createdAt?.toISOString(),
          }));
          return reply.send(out);
        }
      }
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .orderBy(asc(messages.createdAt), asc(messages.id))
        .limit(limit);
      const out = rows.map((m) => ({
        id: m.id,
        sender_id: m.senderId,
        text: m.text,
        created_at: m.createdAt?.toISOString(),
      }));
      return reply.send(out);
    }
  );

  app.post<{ Params: ConvIdParam; Body: { text?: string } }>(
    "/api/conversations/:id/messages",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
          keyGenerator: (req) => {
            const userId = getUserId(req as any);
            return userId ? `user:${userId}` : `ip:${req.ip}`;
          },
        },
      },
    },
    async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();
      const convId = request.params.id;
      const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
      if (!text) return reply.status(400).send({ error: "text required" });
      if (text.length > MESSAGE_TEXT_MAX) {
        return reply.status(400).send({ error: `text max ${MESSAGE_TEXT_MAX} chars` });
      }
      const messageFilter = filterContent(text);
      if (messageFilter.flagged) {
        return reply.status(400).send({
          error: "Your message was flagged for potentially objectionable content. Please revise and try again.",
        });
      }
      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, convId));
      if (!conv) return reply.status(404).send();
      if (conv.participantA !== userId && conv.participantB !== userId)
        return reply.status(403).send();
      const now = new Date();
      const cutoff = new Date(Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000);
      const wasDormant = conv.isDormant === true || (conv.lastMessageAt && conv.lastMessageAt < cutoff);
      const result = await db.transaction(async (tx) => {
        const [msg] = await tx
          .insert(messages)
          .values({ conversationId: convId, senderId: userId, text })
          .returning({ id: messages.id, text: messages.text, createdAt: messages.createdAt });
        if (!msg) return null;
        const [updatedConversation] = await tx
          .update(conversations)
          .set({
            lastMessageAt: now,
            messageCount: sql`coalesce(${conversations.messageCount}, 0) + 1`,
            ...(conv.participantA === userId
              ? { participantASeenAt: now }
              : { participantBSeenAt: now }),
            ...(wasDormant ? { isDormant: false } : {}),
          })
          .where(eq(conversations.id, convId))
          .returning({ messageCount: conversations.messageCount });
        const newCount = updatedConversation?.messageCount ?? (conv.messageCount ?? 0) + 1;

        // Update materialized conversation stats for this thought
        await tx
          .insert(thoughtFeedStats)
          .values({
            thoughtId: conv.thoughtId,
            acceptedReplyCount: 0,
            crossDomainAcceptedReplyCount: 0,
            sustainedConversationCount: newCount >= 10 ? 1 : 0,
            maxConversationDepth: newCount,
          })
          .onConflictDoUpdate({
            target: thoughtFeedStats.thoughtId,
            set: {
              sustainedConversationCount:
                newCount >= 10
                  ? sql`greatest(thought_feed_stats.sustained_conversation_count, 1)`
                  : thoughtFeedStats.sustainedConversationCount,
              maxConversationDepth: sql`greatest(thought_feed_stats.max_conversation_depth, ${newCount})`,
              updatedAt: sql`now()`,
            },
          });

        return {
          msg,
          newCount,
        };
      });
      if (!result) return reply.status(500).send();
      const { msg, newCount } = result;

      // Push notification to the other participant
      const recipientId = conv.participantA === userId ? conv.participantB : conv.participantA;
      notifyNewMessage(recipientId, userId, text, convId).catch(() => {});
      if ([5, 10, 20].includes(newCount)) {
        trackEngagementEvents(userId, [{
          event_type: "reply_sent",
          thought_id: conv.thoughtId,
          session_id: "",
          metadata: { conversation_depth_milestone: newCount, conversation_id: convId },
          timestamp: new Date().toISOString(),
        }]).catch((err: any) => {
          console.error("trackEngagementEvents failed", {
            userId,
            convId,
            message: err?.message ?? String(err),
            code: err?.code,
          });
        });
      }
      return reply.send({
        id: msg.id,
        text: msg.text,
        created_at: msg.createdAt?.toISOString(),
      });
    }
  );
}
