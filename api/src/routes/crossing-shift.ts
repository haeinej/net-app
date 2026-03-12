/**
 * Crossing and Shift (Screen 7). Draft and complete flows; no notifications.
 */
import type { FastifyInstance } from "fastify";
import { eq, and, inArray } from "drizzle-orm";
import { db, conversations, messages, users, crossingDrafts, crossings, crossingReplies, shiftDrafts, shifts } from "../db";
import { getUserId, authenticate } from "../lib/auth";
import { invalidateFeedCache } from "../feed";
import { getWarmthLevel } from "../lib/warmth";

const CROSSING_CONTEXT_MAX = 600;

async function getConvAndParticipant(
  request: Parameters<typeof getUserId>[0] & { params: { id: string } },
  reply: { status: (code: number) => { send: (body?: unknown) => void } }
): Promise<{ convId: string; userId: string; participantA: string; participantB: string } | null> {
  const userId = getUserId(request);
  if (!userId) {
    reply.status(401).send();
    return null;
  }
  const convId = request.params.id;
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId)).limit(1);
  if (!conv) {
    reply.status(404).send();
    return null;
  }
  if (conv.participantA !== userId && conv.participantB !== userId) {
    reply.status(403).send();
    return null;
  }
  const messageCount = conv.messageCount ?? 0;
  if (messageCount < 10) {
    reply.status(403).send({ error: "conversation needs 10+ messages" });
    return null;
  }
  return {
    convId,
    userId,
    participantA: conv.participantA,
    participantB: conv.participantB,
  };
}

function getShiftReadySet(
  userId: string,
  participantA: string
): { participantAReadyAt?: Date; participantBReadyAt?: Date } {
  const now = new Date();
  return userId === participantA
    ? { participantAReadyAt: now }
    : { participantBReadyAt: now };
}

function serializeShiftDraft(
  draft: typeof shiftDrafts.$inferSelect,
  initiatorName: string | null
) {
  return {
    id: draft.id,
    initiator_id: draft.initiatorId,
    initiator_name: initiatorName,
    participant_a_ready_at: draft.participantAReadyAt?.toISOString() ?? null,
    participant_b_ready_at: draft.participantBReadyAt?.toISOString() ?? null,
    a_before: draft.aBefore,
    a_after: draft.aAfter,
    b_before: draft.bBefore,
    b_after: draft.bAfter,
  };
}

export async function crossingShiftRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  // ——— Crossing ———
  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/crossing/start",
    async (request, reply) => {
      const ctx = await getConvAndParticipant(request, reply);
      if (!ctx) return;
      const [existing] = await db
        .select()
        .from(crossingDrafts)
        .where(and(eq(crossingDrafts.conversationId, ctx.convId), eq(crossingDrafts.status, "draft")))
        .limit(1);
      if (existing) {
        return reply.send({
          id: existing.id,
          initiator_id: existing.initiatorId,
          sentence_a: existing.sentenceA,
          sentence_b: existing.sentenceB,
          context: existing.context,
        });
      }
      const [draft] = await db
        .insert(crossingDrafts)
        .values({
          conversationId: ctx.convId,
          initiatorId: ctx.userId,
          status: "draft",
        })
        .returning();
      if (!draft) return reply.status(500).send();
      return reply.send({
        id: draft.id,
        initiator_id: draft.initiatorId,
        sentence_a: draft.sentenceA,
        sentence_b: draft.sentenceB,
        context: draft.context,
      });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/conversations/:id/crossing",
    async (request, reply) => {
      const ctx = await getConvAndParticipant(request, reply);
      if (!ctx) return;
      const [draft] = await db
        .select()
        .from(crossingDrafts)
        .where(and(eq(crossingDrafts.conversationId, ctx.convId), eq(crossingDrafts.status, "draft")))
        .limit(1);
      if (!draft) return reply.status(404).send();
      const [initiator] = await db.select({ name: users.name }).from(users).where(eq(users.id, draft.initiatorId)).limit(1);
      return reply.send({
        id: draft.id,
        initiator_id: draft.initiatorId,
        initiator_name: initiator?.name ?? null,
        sentence_a: draft.sentenceA,
        sentence_b: draft.sentenceB,
        context: draft.context,
      });
    }
  );

  app.put<{
    Params: { id: string };
    Body: { sentence_a?: string; sentence_b?: string; context?: string };
  }>("/api/conversations/:id/crossing", async (request, reply) => {
    const ctx = await getConvAndParticipant(request, reply);
    if (!ctx) return;
    const body = request.body ?? {};
    const [draft] = await db
      .select()
      .from(crossingDrafts)
      .where(and(eq(crossingDrafts.conversationId, ctx.convId), eq(crossingDrafts.status, "draft")))
      .limit(1);
    if (!draft) return reply.status(404).send();
    const sentenceA = typeof body.sentence_a === "string" ? body.sentence_a.trim() || null : draft.sentenceA;
    const sentenceB = typeof body.sentence_b === "string" ? body.sentence_b.trim() || null : draft.sentenceB;
    const context = typeof body.context === "string" ? body.context.slice(0, CROSSING_CONTEXT_MAX).trim() || null : draft.context;
    await db
      .update(crossingDrafts)
      .set({
        sentenceA: sentenceA ?? draft.sentenceA,
        sentenceB: sentenceB !== undefined ? sentenceB : draft.sentenceB,
        context: context !== undefined ? context : draft.context,
        updatedAt: new Date(),
      })
      .where(eq(crossingDrafts.id, draft.id));
    return reply.send({ ok: true });
  });

  app.post<{
    Params: { id: string };
    Body: { sentence: string; context?: string };
  }>("/api/conversations/:id/crossing/complete", async (request, reply) => {
    const ctx = await getConvAndParticipant(request, reply);
    if (!ctx) return;
    const sentence = typeof request.body?.sentence === "string" ? request.body.sentence.trim() : "";
    if (!sentence) return reply.status(400).send({ error: "sentence required" });
    const context = typeof request.body?.context === "string" ? request.body.context.slice(0, CROSSING_CONTEXT_MAX).trim() || undefined : undefined;
    const [draft] = await db
      .select()
      .from(crossingDrafts)
      .where(and(eq(crossingDrafts.conversationId, ctx.convId), eq(crossingDrafts.status, "draft")))
      .limit(1);
    if (!draft) return reply.status(404).send();
    const [crossing] = await db
      .insert(crossings)
      .values({
        conversationId: ctx.convId,
        participantA: ctx.participantA,
        participantB: ctx.participantB,
        sentence,
        context: context ?? null,
        imageUrl: null,
      })
      .returning();
    if (!crossing) return reply.status(500).send();
    await db
      .update(crossingDrafts)
      .set({ status: "complete", updatedAt: new Date() })
      .where(eq(crossingDrafts.id, draft.id));
    invalidateFeedCache(ctx.participantA);
    invalidateFeedCache(ctx.participantB);
    return reply.send({
      id: crossing.id,
      sentence: crossing.sentence,
      context: crossing.context,
      image_url: crossing.imageUrl,
    });
  });

  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/crossing/abandon",
    async (request, reply) => {
      const ctx = await getConvAndParticipant(request, reply);
      if (!ctx) return;
      const [draft] = await db
        .select()
        .from(crossingDrafts)
        .where(and(eq(crossingDrafts.conversationId, ctx.convId), eq(crossingDrafts.status, "draft")))
        .limit(1);
      if (!draft) return reply.status(404).send();
      await db
        .update(crossingDrafts)
        .set({ status: "abandoned", updatedAt: new Date() })
        .where(eq(crossingDrafts.id, draft.id));
      return reply.send({ ok: true });
    }
  );

  // ——— Crossing Detail + Reply ———

  app.get<{ Params: { id: string } }>(
    "/api/crossings/:id",
    async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();
      const crossingId = request.params.id;
      const [crossing] = await db.select().from(crossings).where(eq(crossings.id, crossingId)).limit(1);
      if (!crossing) return reply.status(404).send();

      // Hydrate participants
      const participantIds = [crossing.participantA, crossing.participantB];
      const participantRows = await db.select().from(users).where(inArray(users.id, participantIds));
      const pMap = new Map(participantRows.map((u) => [u.id, u]));
      const pA = pMap.get(crossing.participantA);
      const pB = pMap.get(crossing.participantB);

      // Accepted replies
      const acceptedReplies = await db
        .select()
        .from(crossingReplies)
        .where(and(eq(crossingReplies.crossingId, crossingId), eq(crossingReplies.status, "accepted")));
      const replierIds = [...new Set(acceptedReplies.map((r) => r.replierId))];
      const replierRows = replierIds.length > 0
        ? await db.select().from(users).where(inArray(users.id, replierIds))
        : [];
      const replierMap = new Map(replierRows.map((u) => [u.id, u]));

      // Can reply: not a participant AND no pending reply
      const isParticipant = userId === crossing.participantA || userId === crossing.participantB;
      const [pendingReply] = isParticipant
        ? [undefined]
        : await db.select().from(crossingReplies)
            .where(and(
              eq(crossingReplies.crossingId, crossingId),
              eq(crossingReplies.replierId, userId),
              eq(crossingReplies.status, "pending")
            )).limit(1);
      const canReply = !isParticipant && !pendingReply;

      return reply.send({
        panel_1: {
          id: crossing.id,
          sentence: crossing.sentence,
          participant_a: { id: crossing.participantA, name: pA?.name ?? null, photo_url: pA?.photoUrl ?? null },
          participant_b: { id: crossing.participantB, name: pB?.name ?? null, photo_url: pB?.photoUrl ?? null },
          warmth_level: getWarmthLevel(acceptedReplies.length),
          created_at: crossing.createdAt?.toISOString() ?? new Date().toISOString(),
        },
        panel_2: {
          sentence: crossing.sentence,
          context: crossing.context,
        },
        panel_3: {
          accepted_replies: acceptedReplies.map((r) => {
            const u = replierMap.get(r.replierId);
            return {
              id: r.id,
              user: { id: r.replierId, name: u?.name ?? null, photo_url: u?.photoUrl ?? null },
              text: r.text,
              target_participant_id: r.targetParticipantId,
              created_at: r.createdAt?.toISOString() ?? new Date().toISOString(),
            };
          }),
          can_reply: canReply,
        },
      });
    }
  );

  app.post<{
    Params: { id: string };
    Body: { text: string; target_participant_id: string };
  }>("/api/crossings/:id/reply", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const crossingId = request.params.id;
    const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
    const targetId = request.body?.target_participant_id;
    if (text.length < 50 || text.length > 300) return reply.status(400).send({ error: "text must be 50-300 chars" });
    if (!targetId) return reply.status(400).send({ error: "target_participant_id required" });

    const [crossing] = await db.select().from(crossings).where(eq(crossings.id, crossingId)).limit(1);
    if (!crossing) return reply.status(404).send();

    // Validate target is a participant
    if (targetId !== crossing.participantA && targetId !== crossing.participantB) {
      return reply.status(400).send({ error: "target must be a participant" });
    }
    // Replier cannot be a participant
    if (userId === crossing.participantA || userId === crossing.participantB) {
      return reply.status(403).send({ error: "participants cannot reply to their own crossing" });
    }

    const [created] = await db
      .insert(crossingReplies)
      .values({
        crossingId,
        replierId: userId,
        targetParticipantId: targetId,
        text,
        status: "pending",
      })
      .returning();
    if (!created) return reply.status(500).send();
    return reply.send({ id: created.id, status: created.status, created_at: created.createdAt?.toISOString() });
  });

  // ——— Shift ———
  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/shift/start",
    async (request, reply) => {
      const ctx = await getConvAndParticipant(request, reply);
      if (!ctx) return;
      let [existing] = await db
        .select()
        .from(shiftDrafts)
        .where(and(eq(shiftDrafts.conversationId, ctx.convId), eq(shiftDrafts.status, "draft")))
        .limit(1);
      if (existing) {
        const isParticipantA = ctx.userId === ctx.participantA;
        const alreadyReady = isParticipantA
          ? Boolean(existing.participantAReadyAt)
          : Boolean(existing.participantBReadyAt);
        if (!alreadyReady) {
          await db
            .update(shiftDrafts)
            .set({
              ...getShiftReadySet(ctx.userId, ctx.participantA),
              updatedAt: new Date(),
            })
            .where(eq(shiftDrafts.id, existing.id));
          [existing] = await db
            .select()
            .from(shiftDrafts)
            .where(eq(shiftDrafts.id, existing.id))
            .limit(1);
        }
        const [initiator] = await db.select({ name: users.name }).from(users).where(eq(users.id, existing.initiatorId)).limit(1);
        return reply.send(serializeShiftDraft(existing, initiator?.name ?? null));
      }
      const [draft] = await db
        .insert(shiftDrafts)
        .values({
          conversationId: ctx.convId,
          initiatorId: ctx.userId,
          ...getShiftReadySet(ctx.userId, ctx.participantA),
          status: "draft",
        })
        .returning();
      if (!draft) return reply.status(500).send();
      return reply.send(serializeShiftDraft(draft, null));
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/conversations/:id/shift",
    async (request, reply) => {
      const ctx = await getConvAndParticipant(request, reply);
      if (!ctx) return;
      const [draft] = await db
        .select()
        .from(shiftDrafts)
        .where(and(eq(shiftDrafts.conversationId, ctx.convId), eq(shiftDrafts.status, "draft")))
        .limit(1);
      if (!draft) return reply.status(404).send();
      const [initiator] = await db.select({ name: users.name }).from(users).where(eq(users.id, draft.initiatorId)).limit(1);
      return reply.send(serializeShiftDraft(draft, initiator?.name ?? null));
    }
  );

  app.put<{
    Params: { id: string };
    Body: { a_before?: string; a_after?: string; b_before?: string; b_after?: string };
  }>("/api/conversations/:id/shift", async (request, reply) => {
    const ctx = await getConvAndParticipant(request, reply);
    if (!ctx) return;
    const body = request.body ?? {};
    const [draft] = await db
      .select()
      .from(shiftDrafts)
      .where(and(eq(shiftDrafts.conversationId, ctx.convId), eq(shiftDrafts.status, "draft")))
      .limit(1);
    if (!draft) return reply.status(404).send();
    const isA = ctx.userId === ctx.participantA;
    const updates: { aBefore?: string; aAfter?: string; bBefore?: string; bAfter?: string } = {};
    if (typeof body.a_before === "string") updates.aBefore = body.a_before.trim().slice(0, 500) || undefined;
    if (typeof body.a_after === "string") updates.aAfter = body.a_after.trim().slice(0, 500) || undefined;
    if (typeof body.b_before === "string") updates.bBefore = body.b_before.trim().slice(0, 500) || undefined;
    if (typeof body.b_after === "string") updates.bAfter = body.b_after.trim().slice(0, 500) || undefined;
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (isA) {
      if (updates.aBefore !== undefined) set.aBefore = updates.aBefore ?? draft.aBefore;
      if (updates.aAfter !== undefined) set.aAfter = updates.aAfter ?? draft.aAfter;
    } else {
      if (updates.bBefore !== undefined) set.bBefore = updates.bBefore ?? draft.bBefore;
      if (updates.bAfter !== undefined) set.bAfter = updates.bAfter ?? draft.bAfter;
    }
    await db.update(shiftDrafts).set(set).where(eq(shiftDrafts.id, draft.id));
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/shift/complete",
    async (request, reply) => {
      const ctx = await getConvAndParticipant(request, reply);
      if (!ctx) return;
      const [draft] = await db
        .select()
        .from(shiftDrafts)
        .where(and(eq(shiftDrafts.conversationId, ctx.convId), eq(shiftDrafts.status, "draft")))
        .limit(1);
      if (!draft) return reply.status(404).send();
      const aBefore = (draft.aBefore ?? "").trim();
      const aAfter = (draft.aAfter ?? "").trim();
      const bBefore = (draft.bBefore ?? "").trim();
      const bAfter = (draft.bAfter ?? "").trim();
      if (!draft.participantAReadyAt || !draft.participantBReadyAt) {
        return reply.status(400).send({ error: "both people need to opt in first" });
      }
      if (!aBefore || !aAfter || !bBefore || !bAfter) {
        return reply.status(400).send({ error: "both people must fill before and after" });
      }
      const [shift] = await db
        .insert(shifts)
        .values({
          conversationId: ctx.convId,
          participantA: ctx.participantA,
          participantB: ctx.participantB,
          aBefore,
          aAfter,
          bBefore,
          bAfter,
        })
        .returning();
      if (!shift) return reply.status(500).send();
      await db
        .update(shiftDrafts)
        .set({ status: "complete", updatedAt: new Date() })
        .where(eq(shiftDrafts.id, draft.id));
      invalidateFeedCache(ctx.participantA);
      invalidateFeedCache(ctx.participantB);
      return reply.send({ id: shift.id });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/shift/abandon",
    async (request, reply) => {
      const ctx = await getConvAndParticipant(request, reply);
      if (!ctx) return;
      const [draft] = await db
        .select()
        .from(shiftDrafts)
        .where(and(eq(shiftDrafts.conversationId, ctx.convId), eq(shiftDrafts.status, "draft")))
        .limit(1);
      if (!draft) return reply.status(404).send();
      await db
        .update(shiftDrafts)
        .set({ status: "abandoned", updatedAt: new Date() })
        .where(eq(shiftDrafts.id, draft.id));
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/shift/ignore",
    async (request, reply) => {
      const ctx = await getConvAndParticipant(request, reply);
      if (!ctx) return;
      const [draft] = await db
        .select()
        .from(shiftDrafts)
        .where(and(eq(shiftDrafts.conversationId, ctx.convId), eq(shiftDrafts.status, "draft")))
        .limit(1);
      if (!draft) return reply.status(404).send({ error: "no collaborative card invite" });

      const crossingRows = await db
        .select({ id: crossings.id })
        .from(crossings)
        .where(eq(crossings.conversationId, ctx.convId));
      const crossingIds = crossingRows.map((row) => row.id);

      if (crossingIds.length > 0) {
        await db.delete(crossingReplies).where(inArray(crossingReplies.crossingId, crossingIds));
        await db.delete(crossings).where(inArray(crossings.id, crossingIds));
      }

      await db.delete(crossingDrafts).where(eq(crossingDrafts.conversationId, ctx.convId));
      await db.delete(shiftDrafts).where(eq(shiftDrafts.conversationId, ctx.convId));
      await db.delete(messages).where(eq(messages.conversationId, ctx.convId));
      await db.delete(conversations).where(eq(conversations.id, ctx.convId));

      return reply.send({ deleted: true });
    }
  );
}
