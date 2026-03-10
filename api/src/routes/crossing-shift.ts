/**
 * Crossing and Shift (Screen 7). Draft and complete flows; no notifications.
 */
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, conversations, users, crossingDrafts, crossings, shiftDrafts, shifts } from "../db";
import { getUserId, authenticate } from "../lib/auth";
import { generateCrossingImage } from "../image/service";

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
    const [userA] = await db.select({ photoUrl: users.photoUrl }).from(users).where(eq(users.id, ctx.participantA)).limit(1);
    const [userB] = await db.select({ photoUrl: users.photoUrl }).from(users).where(eq(users.id, ctx.participantB)).limit(1);
    const photoA = userA?.photoUrl ?? "";
    const photoB = userB?.photoUrl ?? "";
    let imageUrl: string | null = null;
    if (photoA && photoB) {
      try {
        imageUrl = await generateCrossingImage(sentence, photoA, photoB);
      } catch {
        // continue without image
      }
    }
    const [crossing] = await db
      .insert(crossings)
      .values({
        conversationId: ctx.convId,
        participantA: ctx.participantA,
        participantB: ctx.participantB,
        sentence,
        context: context ?? null,
        imageUrl,
      })
      .returning();
    if (!crossing) return reply.status(500).send();
    await db
      .update(crossingDrafts)
      .set({ status: "complete", updatedAt: new Date() })
      .where(eq(crossingDrafts.id, draft.id));
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

  // ——— Shift ———
  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/shift/start",
    async (request, reply) => {
      const ctx = await getConvAndParticipant(request, reply);
      if (!ctx) return;
      const [existing] = await db
        .select()
        .from(shiftDrafts)
        .where(and(eq(shiftDrafts.conversationId, ctx.convId), eq(shiftDrafts.status, "draft")))
        .limit(1);
      if (existing) {
        const [initiator] = await db.select({ name: users.name }).from(users).where(eq(users.id, existing.initiatorId)).limit(1);
        return reply.send({
          id: existing.id,
          initiator_id: existing.initiatorId,
          initiator_name: initiator?.name ?? null,
          a_before: existing.aBefore,
          a_after: existing.aAfter,
          b_before: existing.bBefore,
          b_after: existing.bAfter,
        });
      }
      const [draft] = await db
        .insert(shiftDrafts)
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
        initiator_name: null,
        a_before: draft.aBefore,
        a_after: draft.aAfter,
        b_before: draft.bBefore,
        b_after: draft.bAfter,
      });
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
      return reply.send({
        id: draft.id,
        initiator_id: draft.initiatorId,
        initiator_name: initiator?.name ?? null,
        a_before: draft.aBefore,
        a_after: draft.aAfter,
        b_before: draft.bBefore,
        b_after: draft.bAfter,
      });
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
}
