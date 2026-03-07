import type { FastifyInstance } from "fastify";
import { eq, and, or, desc, asc, lt, inArray } from "drizzle-orm";
import { db, conversations, messages, users, thoughts, crossingDrafts, crossings, shiftDrafts, shifts } from "../db";
import { getUserId, authenticate } from "../lib/auth";

const DORMANT_DAYS = 30;
const MESSAGE_PREVIEW_LEN = 100;

interface ConvIdParam {
  id: string;
}

interface MessagesQuery {
  limit?: string;
  before_id?: string;
}

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  app.get("/api/conversations", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const list = await db
      .select()
      .from(conversations)
      .where(or(eq(conversations.participantA, userId), eq(conversations.participantB, userId)))
      .orderBy(desc(conversations.lastMessageAt));
    const convIds = list.map((c) => c.id);
    if (convIds.length === 0) return reply.send([]);
    const lastMessages = await db
      .select({
        conversationId: messages.conversationId,
        text: messages.text,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(inArray(messages.conversationId, convIds))
      .orderBy(desc(messages.createdAt));
    const lastByConv = new Map<string | null, { text: string; createdAt: Date | null }>();
    for (const m of lastMessages) {
      if (m.conversationId && !lastByConv.has(m.conversationId))
        lastByConv.set(m.conversationId, { text: m.text, createdAt: m.createdAt });
    }
    const otherIds = list.map((c) =>
      c.participantA === userId ? c.participantB : c.participantA
    );
    const otherUsers = await db.select().from(users).where(inArray(users.id, otherIds));
    const userMap = new Map(otherUsers.map((u) => [u.id, u]));
    const cutoff = new Date(Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000);
    const body = list.map((c) => {
      const otherId = c.participantA === userId ? c.participantB : c.participantA;
      const other = userMap.get(otherId);
      const last = lastByConv.get(c.id);
      return {
        id: c.id,
        other_user: other
          ? { id: other.id, name: other.name, photo_url: other.photoUrl }
          : null,
        last_message_preview: last ? last.text.slice(0, MESSAGE_PREVIEW_LEN) : "",
        last_message_at: c.lastMessageAt?.toISOString() ?? null,
        is_dormant: (c.lastMessageAt ? c.lastMessageAt < cutoff : true),
        unread: false,
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
    const messageCount = conv.messageCount ?? 0;
    const [crossDraft] = await db
      .select()
      .from(crossingDrafts)
      .where(and(eq(crossingDrafts.conversationId, convId), eq(crossingDrafts.status, "draft")))
      .limit(1);
    const [shiftDraft] = await db
      .select()
      .from(shiftDrafts)
      .where(and(eq(shiftDrafts.conversationId, convId), eq(shiftDrafts.status, "draft")))
      .limit(1);
    const hasCrossing = await db
      .select({ id: crossings.id })
      .from(crossings)
      .where(eq(crossings.conversationId, convId))
      .limit(1);
    const hasShift = await db
      .select({ id: shifts.id })
      .from(shifts)
      .where(eq(shifts.conversationId, convId))
      .limit(1);
    let initiatorName: string | null = null;
    let shiftInitiatorName: string | null = null;
    if (crossDraft) {
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, crossDraft.initiatorId)).limit(1);
      initiatorName = u?.name ?? null;
    }
    if (shiftDraft) {
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, shiftDraft.initiatorId)).limit(1);
      shiftInitiatorName = u?.name ?? null;
    }
    return reply.send({
      id: conv.id,
      message_count: messageCount,
      participant_a_id: conv.participantA,
      participant_b_id: conv.participantB,
      crossing_draft: crossDraft
        ? {
            id: crossDraft.id,
            initiator_id: crossDraft.initiatorId,
            initiator_name: initiatorName,
            sentence_a: crossDraft.sentenceA,
            sentence_b: crossDraft.sentenceB,
            context: crossDraft.context,
          }
        : null,
      shift_draft: shiftDraft
        ? {
            id: shiftDraft.id,
            initiator_id: shiftDraft.initiatorId,
            initiator_name: shiftInitiatorName,
            a_before: shiftDraft.aBefore,
            a_after: shiftDraft.aAfter,
            b_before: shiftDraft.bBefore,
            b_after: shiftDraft.bAfter,
          }
        : null,
      crossing_complete: hasCrossing.length > 0,
      shift_complete: hasShift.length > 0,
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
      const limit = Math.min(50, Math.max(1, parseInt(request.query.limit ?? "50", 10) || 50));
      const beforeId = request.query.before_id;
      if (beforeId) {
        const [before] = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(and(eq(messages.conversationId, convId), eq(messages.id, beforeId)));
        if (before) {
          const rows = await db
            .select()
            .from(messages)
            .where(and(eq(messages.conversationId, convId), lt(messages.createdAt, before.createdAt!)))
            .orderBy(desc(messages.createdAt))
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
        .orderBy(asc(messages.createdAt))
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
    async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();
      const convId = request.params.id;
      const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
      if (!text) return reply.status(400).send({ error: "text required" });
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
      const [msg] = await db
        .insert(messages)
        .values({ conversationId: convId, senderId: userId, text })
        .returning({ id: messages.id, text: messages.text, createdAt: messages.createdAt });
      if (!msg) return reply.status(500).send();
      await db
        .update(conversations)
        .set({
          lastMessageAt: now,
          messageCount: (conv.messageCount ?? 0) + 1,
          ...(wasDormant ? { isDormant: false } : {}),
        })
        .where(eq(conversations.id, convId));
      return reply.send({
        id: msg.id,
        text: msg.text,
        created_at: msg.createdAt?.toISOString(),
      });
    }
  );
}
