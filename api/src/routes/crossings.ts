/**
 * Crossing is the only shared artifact left in the active product.
 * Legacy shift tables may still exist in the database, but they are not part
 * of the live API anymore.
 */
import type { FastifyInstance } from "fastify";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { db, conversations, users, crossingDrafts, crossings, crossingReplies } from "../db";
import { getUserId, authenticate } from "../lib/auth";
import { invalidateFeedCache } from "../feed";
import { filterContent } from "../lib/content-filter";

const CROSSING_CONTEXT_MAX = 600;
const CROSSING_MESSAGE_STEP = 10;
const CROSSING_AUTO_POST_DAYS = 3;
type CrossingDraftStatus = typeof crossingDrafts.$inferSelect.status;
const ACTIVE_CROSSING_DRAFT_STATUSES: CrossingDraftStatus[] = ["draft", "awaiting_other"];
const AUTO_POSTED_CROSSING_DRAFT_STATUSES: CrossingDraftStatus[] = ["auto_posted"];
const REPLY_TEXT_MIN = 30;
const REPLY_TEXT_MAX = 300;

function getNextCrossingMessageCount(resolvedCrossingCount: number): number {
  return (resolvedCrossingCount + 1) * CROSSING_MESSAGE_STEP;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

async function getConvAndParticipant(
  request: Parameters<typeof getUserId>[0] & { params: { id: string } },
  reply: { status: (code: number) => { send: (body?: unknown) => void } }
): Promise<{
  convId: string;
  userId: string;
  participantA: string;
  participantB: string;
  messageCount: number;
} | null> {
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
  return {
    convId,
    userId,
    participantA: conv.participantA,
    participantB: conv.participantB,
    messageCount: conv.messageCount ?? 0,
  };
}

function serializeCrossingDraft(
  draft: typeof crossingDrafts.$inferSelect,
  initiatorName: string | null
) {
  return {
    id: draft.id,
    initiator_id: draft.initiatorId,
    initiator_name: initiatorName,
    sentence: draft.sentence,
    context: draft.context,
    status: draft.status,
    submitted_at: draft.submittedAt?.toISOString() ?? null,
    auto_post_at: draft.autoPostAt?.toISOString() ?? null,
    auto_posted_thought_id: draft.autoPostedThoughtId ?? null,
  };
}

export async function crossingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  // ——— Crossing ———
  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/crossing/start",
    async (request, reply) => {
      const ctx = await getConvAndParticipant(request, reply);
      if (!ctx) return;
      const result = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(crossingDrafts)
          .where(
            and(
              eq(crossingDrafts.conversationId, ctx.convId),
              inArray(crossingDrafts.status, ACTIVE_CROSSING_DRAFT_STATUSES)
            )
          )
          .orderBy(desc(crossingDrafts.updatedAt), desc(crossingDrafts.createdAt))
          .limit(1);
        if (existing) {
          const [initiator] = await tx
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, existing.initiatorId))
            .limit(1);
          return {
            status: 200 as const,
            body: serializeCrossingDraft(existing, initiator?.name ?? null),
          };
        }

        const [completedCrossingCountRow] = await tx
          .select({
            count: sql<number>`cast(count(*) as int)`,
          })
          .from(crossings)
          .where(eq(crossings.conversationId, ctx.convId));
        const [autoPostedCrossingCountRow] = await tx
          .select({
            count: sql<number>`cast(count(*) as int)`,
          })
          .from(crossingDrafts)
          .where(
            and(
              eq(crossingDrafts.conversationId, ctx.convId),
              inArray(crossingDrafts.status, AUTO_POSTED_CROSSING_DRAFT_STATUSES)
            )
          );
        const resolvedCrossingCount =
          Number(completedCrossingCountRow?.count ?? 0) +
          Number(autoPostedCrossingCountRow?.count ?? 0);
        const nextCrossingMessageCount = getNextCrossingMessageCount(resolvedCrossingCount);

        if (ctx.messageCount < nextCrossingMessageCount) {
          return {
            status: 403 as const,
            body: { error: `conversation needs ${nextCrossingMessageCount}+ messages` },
          };
        }

        try {
          const [draft] = await tx
            .insert(crossingDrafts)
            .values({
              conversationId: ctx.convId,
              initiatorId: ctx.userId,
              status: "draft",
            })
            .returning();
          if (!draft) return { status: 500 as const, body: undefined };
          return {
            status: 200 as const,
            body: serializeCrossingDraft(draft, null),
          };
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          const [draft] = await tx
            .select()
            .from(crossingDrafts)
            .where(
              and(
                eq(crossingDrafts.conversationId, ctx.convId),
                inArray(crossingDrafts.status, ACTIVE_CROSSING_DRAFT_STATUSES)
              )
            )
            .orderBy(desc(crossingDrafts.updatedAt), desc(crossingDrafts.createdAt))
            .limit(1);
          if (!draft) {
            return { status: 409 as const, body: { error: "crossing already started" } };
          }
          const [initiator] = await tx
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, draft.initiatorId))
            .limit(1);
          return {
            status: 200 as const,
            body: serializeCrossingDraft(draft, initiator?.name ?? null),
          };
        }
      });

      return reply.status(result.status).send(result.body);
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
        .where(
          and(
            eq(crossingDrafts.conversationId, ctx.convId),
            inArray(crossingDrafts.status, ACTIVE_CROSSING_DRAFT_STATUSES)
          )
        )
        .orderBy(desc(crossingDrafts.updatedAt), desc(crossingDrafts.createdAt))
        .limit(1);
      if (!draft) return reply.status(404).send();
      const [initiator] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, draft.initiatorId))
        .limit(1);
      return reply.send(serializeCrossingDraft(draft, initiator?.name ?? null));
    }
  );

  app.put<{
    Params: { id: string };
    Body: { sentence?: string; context?: string };
  }>("/api/conversations/:id/crossing", async (request, reply) => {
    const ctx = await getConvAndParticipant(request, reply);
    if (!ctx) return;
    const body = request.body ?? {};
    const [draft] = await db
      .select()
      .from(crossingDrafts)
      .where(
        and(
          eq(crossingDrafts.conversationId, ctx.convId),
          inArray(crossingDrafts.status, ACTIVE_CROSSING_DRAFT_STATUSES)
        )
      )
      .orderBy(desc(crossingDrafts.updatedAt), desc(crossingDrafts.createdAt))
      .limit(1);
    if (!draft) return reply.status(404).send();
    if (draft.initiatorId !== ctx.userId) {
      return reply.status(403).send({ error: "only the person who started it can edit it" });
    }
    const sentence =
      typeof body.sentence === "string" ? body.sentence.trim() || null : draft.sentence;
    const context =
      typeof body.context === "string"
        ? body.context.slice(0, CROSSING_CONTEXT_MAX).trim() || null
        : draft.context;
    await db
      .update(crossingDrafts)
      .set({
        sentence: sentence ?? draft.sentence,
        context: context !== undefined ? context : draft.context,
        updatedAt: new Date(),
      })
      .where(eq(crossingDrafts.id, draft.id));
    return reply.send({ ok: true });
  });

  app.post<{
    Params: { id: string };
    Body: { sentence?: string; context?: string };
  }>("/api/conversations/:id/crossing/complete", async (request, reply) => {
    const ctx = await getConvAndParticipant(request, reply);
    if (!ctx) return;
    const inputSentence =
      typeof request.body?.sentence === "string" ? request.body.sentence.trim() : "";
    const inputContext =
      typeof request.body?.context === "string"
        ? request.body.context.slice(0, CROSSING_CONTEXT_MAX).trim() || undefined
        : undefined;
    const result = await db.transaction(async (tx) => {
      const [draft] = await tx
        .select()
        .from(crossingDrafts)
        .where(eq(crossingDrafts.conversationId, ctx.convId))
        .orderBy(desc(crossingDrafts.updatedAt), desc(crossingDrafts.createdAt))
        .limit(1);
      if (!draft) return { status: 404 as const, body: undefined };

      if (ctx.userId === draft.initiatorId) {
        if (!ACTIVE_CROSSING_DRAFT_STATUSES.includes(draft.status)) {
          return {
            status: 409 as const,
            body: { error: "crossing can no longer be edited" },
          };
        }
        const sentence = inputSentence || draft.sentence?.trim() || "";
        if (!sentence) return { status: 400 as const, body: { error: "sentence required" } };
        const now = new Date();
        const autoPostAt = new Date(now.getTime() + CROSSING_AUTO_POST_DAYS * 24 * 60 * 60 * 1000);
        await tx
          .update(crossingDrafts)
          .set({
            sentence,
            context: inputContext !== undefined ? inputContext : draft.context,
            submittedAt: now,
            autoPostAt,
            status: "awaiting_other",
            updatedAt: now,
          })
          .where(eq(crossingDrafts.id, draft.id));
        return {
          status: 200 as const,
          body: {
            status: "awaiting_other" as const,
            auto_post_at: autoPostAt.toISOString(),
          },
        };
      }

      if (draft.status === "complete") {
        const [existingCrossing] = await tx
          .select()
          .from(crossings)
          .where(eq(crossings.sourceDraftId, draft.id))
          .limit(1);
        if (existingCrossing) {
          return {
            status: 200 as const,
            body: {
              status: "complete" as const,
              id: existingCrossing.id,
              sentence: existingCrossing.sentence,
              context: existingCrossing.context,
              image_url: existingCrossing.imageUrl,
            },
          };
        }
      }

      if (draft.status !== "awaiting_other" || !draft.submittedAt || !draft.sentence?.trim()) {
        return {
          status: 409 as const,
          body: { error: "crossing is not ready for approval yet" },
        };
      }

      const [claimedDraft] = await tx
        .update(crossingDrafts)
        .set({
          status: "complete",
          autoPostAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(crossingDrafts.id, draft.id), eq(crossingDrafts.status, "awaiting_other")))
        .returning({
          id: crossingDrafts.id,
          sentence: crossingDrafts.sentence,
          context: crossingDrafts.context,
        });

      if (!claimedDraft) {
        const [existingCrossing] = await tx
          .select()
          .from(crossings)
          .where(eq(crossings.sourceDraftId, draft.id))
          .limit(1);
        if (existingCrossing) {
          return {
            status: 200 as const,
            body: {
              status: "complete" as const,
              id: existingCrossing.id,
              sentence: existingCrossing.sentence,
              context: existingCrossing.context,
              image_url: existingCrossing.imageUrl,
            },
          };
        }
        return {
          status: 409 as const,
          body: { error: "crossing is not ready for approval yet" },
        };
      }

      const sentence = claimedDraft.sentence?.trim();
      if (!sentence) {
        throw new Error("Claimed crossing draft has no sentence");
      }

      let crossing: typeof crossings.$inferSelect | undefined;
      try {
        [crossing] = await tx
          .insert(crossings)
          .values({
            conversationId: ctx.convId,
            sourceDraftId: claimedDraft.id,
            participantA: ctx.participantA,
            participantB: ctx.participantB,
            sentence,
            context: claimedDraft.context ?? null,
            imageUrl: null,
          })
          .returning();
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        [crossing] = await tx
          .select()
          .from(crossings)
          .where(eq(crossings.sourceDraftId, claimedDraft.id))
          .limit(1);
      }
      if (!crossing) return { status: 500 as const, body: undefined };
      return {
        status: 200 as const,
        body: {
          status: "complete" as const,
          id: crossing.id,
          sentence: crossing.sentence,
          context: crossing.context,
          image_url: crossing.imageUrl,
        },
      };
    });

    if (result.status !== 200) {
      return reply.status(result.status).send(result.body);
    }
    void invalidateFeedCache(ctx.participantA);
    void invalidateFeedCache(ctx.participantB);
    return reply.send(result.body);
  });

  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/crossing/abandon",
    async (request, reply) => {
      const ctx = await getConvAndParticipant(request, reply);
      if (!ctx) return;
      const result = await db.transaction(async (tx) => {
        const [draft] = await tx
          .select()
          .from(crossingDrafts)
          .where(
            and(
              eq(crossingDrafts.conversationId, ctx.convId),
              inArray(crossingDrafts.status, ACTIVE_CROSSING_DRAFT_STATUSES)
            )
          )
          .orderBy(desc(crossingDrafts.updatedAt), desc(crossingDrafts.createdAt))
          .limit(1);
        if (!draft) return { status: 404 as const };
        if (draft.initiatorId !== ctx.userId) {
          return { status: 403 as const };
        }
        await tx
          .update(crossingDrafts)
          .set({
            status: "abandoned",
            submittedAt: null,
            autoPostAt: null,
            updatedAt: new Date(),
          })
          .where(eq(crossingDrafts.id, draft.id));
        return { status: 200 as const };
      });
      if (result.status !== 200) return reply.status(result.status).send();
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
    if (text.length < REPLY_TEXT_MIN || text.length > REPLY_TEXT_MAX) {
      return reply
        .status(400)
        .send({ error: `text must be ${REPLY_TEXT_MIN}-${REPLY_TEXT_MAX} chars` });
    }
    if (!targetId) return reply.status(400).send({ error: "target_participant_id required" });

    const textFilter = filterContent(text);
    if (textFilter.flagged) {
      return reply.status(400).send({
        error: "Your reply was flagged for potentially objectionable content. Please revise and try again.",
      });
    }

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

    const [existingPending] = await db
      .select({ id: crossingReplies.id, status: crossingReplies.status, createdAt: crossingReplies.createdAt })
      .from(crossingReplies)
      .where(
        and(
          eq(crossingReplies.crossingId, crossingId),
          eq(crossingReplies.replierId, userId),
          eq(crossingReplies.status, "pending")
        )
      )
      .limit(1);
    if (existingPending) {
      return reply.status(409).send({
        id: existingPending.id,
        status: existingPending.status,
        created_at: existingPending.createdAt?.toISOString() ?? null,
      });
    }

    let created: { id: string; status: string; createdAt: Date | null } | undefined;
    try {
      [created] = await db
        .insert(crossingReplies)
        .values({
          crossingId,
          replierId: userId,
          targetParticipantId: targetId,
          text,
          status: "pending",
        })
        .returning({ id: crossingReplies.id, status: crossingReplies.status, createdAt: crossingReplies.createdAt });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      [created] = await db
        .select({ id: crossingReplies.id, status: crossingReplies.status, createdAt: crossingReplies.createdAt })
        .from(crossingReplies)
        .where(
          and(
            eq(crossingReplies.crossingId, crossingId),
            eq(crossingReplies.replierId, userId),
            eq(crossingReplies.status, "pending")
          )
        )
        .limit(1);
      if (created) {
        return reply.status(409).send({
          id: created.id,
          status: created.status,
          created_at: created.createdAt?.toISOString() ?? null,
        });
      }
    }
    if (!created) return reply.status(500).send();
    return reply.send({ id: created.id, status: created.status, created_at: created.createdAt?.toISOString() });
  });

}
