import type { FastifyInstance } from "fastify";
import { eq, and, inArray, desc, isNull, or } from "drizzle-orm";
import {
  db,
  users,
  thoughts,
  replies,
  emailVerificationCodes,
  crossings,
  conversations,
  messages,
  crossingDrafts,
  crossingReplies,
  engagementEvents,
  failedProcessingJobs,
  imageGenerations,
  reports,
  blocks,
  userRecommendationWeights,
} from "../db";
import { getUserId, authenticate } from "../lib/auth";
import { verifyPassword } from "../lib/password";
const INTERESTS_MAX = 3;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface UserIdParam {
  id: string;
}

interface ProfileQuery {
  thoughts_limit?: string;
  crossings_limit?: string;
}

interface UpdateProfileBody {
  name?: string;
  photo_url?: string;
  interests?: string[];
}

interface DeleteAccountBody {
  password?: string;
}

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  app.get<{ Params: UserIdParam; Querystring: ProfileQuery }>(
    "/api/users/:id/profile",
    async (request, reply) => {
    try {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();
      const targetId = request.params.id;
      if (!UUID_PATTERN.test(targetId)) {
        return reply.status(404).send({ error: "Profile not found" });
      }

      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          photoUrl: users.photoUrl,
        })
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);

      if (!user) return reply.status(404).send({ error: "Profile not found" });

      const rawThoughtsLimit = parseInt(request.query.thoughts_limit ?? "100", 10);
      const thoughtsLimit =
        Number.isFinite(rawThoughtsLimit) && rawThoughtsLimit > 0
          ? Math.min(rawThoughtsLimit, 200)
          : 100;

      let thoughtsForProfile: Array<{
        id: string;
        sentence: string;
        photo_url: string | null;
        image_url: string | null;
        created_at: string | null;
      }> = [];

      try {
        const userThoughts = await db
          .select({
            id: thoughts.id,
            sentence: thoughts.sentence,
            photoUrl: thoughts.photoUrl,
            imageUrl: thoughts.imageUrl,
            createdAt: thoughts.createdAt,
          })
          .from(thoughts)
          .where(and(eq(thoughts.userId, targetId), isNull(thoughts.deletedAt)))
          .orderBy(desc(thoughts.createdAt))
          .limit(thoughtsLimit);

        thoughtsForProfile = userThoughts.map((t) => ({
          id: t.id,
          sentence: t.sentence,
          photo_url: t.photoUrl,
          image_url: t.imageUrl,
          created_at: t.createdAt?.toISOString() ?? null,
        }));
      } catch (error) {
        request.log.error(
          { error, targetId },
          "profile thought hydration failed; returning profile without thoughts"
        );
      }

      const rawCrossingsLimit = parseInt(request.query.crossings_limit ?? "100", 10);
      const crossingsLimit =
        Number.isFinite(rawCrossingsLimit) && rawCrossingsLimit > 0
          ? Math.min(rawCrossingsLimit, 200)
          : 100;

      let crossingsForProfile: Array<{
        id: string;
        sentence: string;
        context: string | null;
        image_url: string | null;
        created_at: string | null;
        participant_a: { id: string; name: string | null; photo_url: string | null } | null;
        participant_b: { id: string; name: string | null; photo_url: string | null } | null;
      }> = [];

      try {
        const userCrossings = await db
          .select({
            id: crossings.id,
            sentence: crossings.sentence,
            context: crossings.context,
            imageUrl: crossings.imageUrl,
            createdAt: crossings.createdAt,
            participantA: crossings.participantA,
            participantB: crossings.participantB,
          })
          .from(crossings)
          .where(or(eq(crossings.participantA, targetId), eq(crossings.participantB, targetId)))
          .orderBy(desc(crossings.createdAt))
          .limit(crossingsLimit);

        const participantIds = [
          ...new Set(userCrossings.flatMap((c) => [c.participantA, c.participantB])),
        ];

        const participantUsers =
          participantIds.length > 0
            ? await db
                .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
                .from(users)
                .where(inArray(users.id, participantIds))
            : [];

        const userInfoMap = new Map(
          participantUsers.map((p) => [
            p.id,
            { id: p.id, name: p.name, photo_url: p.photoUrl },
          ])
        );

        crossingsForProfile = userCrossings.map((c) => ({
          id: c.id,
          sentence: c.sentence,
          context: c.context,
          image_url: c.imageUrl,
          created_at: c.createdAt?.toISOString() ?? null,
          participant_a:
            userInfoMap.get(c.participantA) ?? {
              id: c.participantA,
              name: null,
              photo_url: null,
            },
          participant_b:
            userInfoMap.get(c.participantB) ?? {
              id: c.participantB,
              name: null,
              photo_url: null,
            },
        }));
      } catch (error) {
        request.log.error(
          { error, targetId },
          "profile crossing hydration failed; returning profile without crossings"
        );
      }

      return reply.send({
        id: user.id,
        name: user.name,
        photo_url: user.photoUrl,
        thoughts: thoughtsForProfile,
        crossings: crossingsForProfile,
      });
    } catch (error) {
      request.log.error({ error, targetId: request.params.id }, "profile load failed");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  app.put<{ Body: UpdateProfileBody }>("/api/me/profile", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const body = request.body ?? {};
    const updates: { name?: string; photoUrl?: string | null; interests?: string[] | null } = {};
    if (typeof body.name === "string") updates.name = body.name.trim();
    if (typeof body.photo_url === "string") updates.photoUrl = body.photo_url.trim() || null;
    if (Array.isArray(body.interests)) {
      const arr = (body.interests as string[])
        .slice(0, INTERESTS_MAX)
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean);
      updates.interests = arr;
      // Re-embed for fallback: feed service embeds interests at query time from user row.
      // No persisted interest embedding column; next getFeed will use new interests.
    }
    if (Object.keys(updates).length === 0)
      return reply.status(400).send({ error: "no valid fields to update" });
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    if (!updated) return reply.status(500).send();
    return reply.send({
      id: updated.id,
      name: updated.name,
      photo_url: updated.photoUrl,
      interests: (updated.interests ?? []) as string[],
    });
  });

  app.delete<{ Body: DeleteAccountBody }>(
    "/api/me/account",
    async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();

      const password =
        typeof request.body?.password === "string" ? request.body.password : "";

      const [user] = await db
        .select({
          id: users.id,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) return reply.status(404).send({ error: "account not found" });

      if (user.passwordHash && !(await verifyPassword(password, user.passwordHash))) {
        return reply.status(400).send({ error: "incorrect password" });
      }

      try {
        await db.transaction(async (tx) => {
          const [userThoughtRows, conversationRows, userCrossingRows] = await Promise.all([
            tx
              .select({ id: thoughts.id })
              .from(thoughts)
              .where(eq(thoughts.userId, userId)),
            tx
              .select({ id: conversations.id })
              .from(conversations)
              .where(
                or(
                  eq(conversations.participantA, userId),
                  eq(conversations.participantB, userId)
                )
              ),
            tx
              .select({ id: crossings.id })
              .from(crossings)
              .where(
                or(eq(crossings.participantA, userId), eq(crossings.participantB, userId))
              ),
          ]);
          const userThoughtIds = userThoughtRows.map((row) => row.id);
          const conversationIds = conversationRows.map((row) => row.id);
          const userCrossingIds = userCrossingRows.map((row) => row.id);

          await tx
            .delete(emailVerificationCodes)
            .where(eq(emailVerificationCodes.userId, userId));
          await tx
            .delete(reports)
            .where(or(eq(reports.reporterId, userId), eq(reports.targetUserId, userId)));
          await tx
            .delete(blocks)
            .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));

          if (userCrossingIds.length > 0) {
            await tx
              .delete(crossingReplies)
              .where(inArray(crossingReplies.crossingId, userCrossingIds));
          }

          if (conversationIds.length > 0) {
            await tx
              .delete(messages)
              .where(inArray(messages.conversationId, conversationIds));
            await tx
              .delete(crossings)
              .where(inArray(crossings.conversationId, conversationIds));
            await tx
              .delete(crossingDrafts)
              .where(inArray(crossingDrafts.conversationId, conversationIds));
            await tx
              .delete(conversations)
              .where(inArray(conversations.id, conversationIds));
          }

          if (userCrossingIds.length > 0) {
            await tx.delete(crossings).where(inArray(crossings.id, userCrossingIds));
          }

          await tx
            .delete(crossingDrafts)
            .where(eq(crossingDrafts.initiatorId, userId));
          await tx.delete(crossingReplies).where(eq(crossingReplies.replierId, userId));
          await tx
            .delete(crossingReplies)
            .where(eq(crossingReplies.targetParticipantId, userId));

          await tx
            .delete(userRecommendationWeights)
            .where(eq(userRecommendationWeights.userId, userId));
          await tx.delete(imageGenerations).where(eq(imageGenerations.userId, userId));
          await tx.delete(engagementEvents).where(eq(engagementEvents.userId, userId));

          if (userThoughtIds.length > 0) {
            await tx
              .delete(engagementEvents)
              .where(inArray(engagementEvents.thoughtId, userThoughtIds));
            await tx
              .delete(failedProcessingJobs)
              .where(inArray(failedProcessingJobs.thoughtId, userThoughtIds));
            await tx
              .delete(imageGenerations)
              .where(inArray(imageGenerations.thoughtId, userThoughtIds));
            await tx
              .delete(replies)
              .where(inArray(replies.thoughtId, userThoughtIds));
            await tx.delete(thoughts).where(inArray(thoughts.id, userThoughtIds));
          }

          await tx.delete(replies).where(eq(replies.replierId, userId));
          await tx.delete(users).where(eq(users.id, userId));
        });

        return reply.status(204).send();
      } catch (error) {
        request.log.error({ error, userId }, "account deletion failed");
        return reply.status(500).send({ error: "Internal server error" });
      }
    }
  );
}
