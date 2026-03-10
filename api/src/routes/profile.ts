import type { FastifyInstance } from "fastify";
import { eq, and, inArray, desc, sql, isNull, or } from "drizzle-orm";
import { db, users, thoughts, replies, crossings } from "../db";
import { getUserId, authenticate } from "../lib/auth";
const INTERESTS_MAX = 3;

interface UserIdParam {
  id: string;
}

interface UpdateProfileBody {
  name?: string;
  photo_url?: string;
  interests?: string[];
}

function getWarmthLevel(acceptedCount: number): "none" | "low" | "medium" | "full" {
  if (acceptedCount === 0) return "none";
  if (acceptedCount === 1) return "low";
  return "medium";
}

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  app.get<{ Params: UserIdParam }>("/api/users/:id/profile", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const targetId = request.params.id;
    const [user] = await db.select().from(users).where(eq(users.id, targetId));
    if (!user) return reply.status(404).send();
    const userThoughts = await db
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.userId, targetId), isNull(thoughts.deletedAt)))
      .orderBy(desc(thoughts.createdAt));
    const thoughtIds = userThoughts.map((t) => t.id);
    let replyCounts = new Map<string, number>();
    if (thoughtIds.length > 0) {
      const rows = await db
        .select({
          thoughtId: replies.thoughtId,
          count: sql<number>`count(*)::int`,
        })
        .from(replies)
        .where(and(inArray(replies.thoughtId, thoughtIds), eq(replies.status, "accepted")))
        .groupBy(replies.thoughtId);
      replyCounts = new Map(rows.map((r) => [r.thoughtId, r.count]));
    }
    const thoughtsForProfile = userThoughts.map((t) => ({
      id: t.id,
      sentence: t.sentence,
      image_url: t.imageUrl,
      warmth_level: getWarmthLevel(replyCounts.get(t.id) ?? 0),
      created_at: t.createdAt?.toISOString(),
    }));
    const userCrossings = await db
      .select()
      .from(crossings)
      .where(or(eq(crossings.participantA, targetId), eq(crossings.participantB, targetId)))
      .orderBy(desc(crossings.createdAt));
    const allCrossingIds = [...new Set(userCrossings.flatMap((c) => [c.participantA, c.participantB]))];
    const crossingUsers = allCrossingIds.length > 0
      ? await db.select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, allCrossingIds))
      : [];
    const userInfoMap = new Map(crossingUsers.map((p) => [p.id, { id: p.id, name: p.name, photo_url: p.photoUrl }]));
    const crossingsForProfile = userCrossings.map((c) => ({
      id: c.id,
      sentence: c.sentence,
      context: c.context,
      image_url: c.imageUrl,
      created_at: c.createdAt?.toISOString(),
      participant_a: userInfoMap.get(c.participantA) ?? null,
      participant_b: userInfoMap.get(c.participantB) ?? null,
    }));
    return reply.send({
      id: user.id,
      name: user.name,
      photo_url: user.photoUrl,
      thoughts: thoughtsForProfile,
      crossings: crossingsForProfile,
    });
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
}
