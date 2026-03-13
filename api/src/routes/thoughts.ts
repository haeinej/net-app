import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, isNull, inArray, asc, ne } from "drizzle-orm";
import { db, thoughts, users, replies } from "../db";
import { getUserId, authenticate } from "../lib/auth";
import { processNewThought } from "../thought-processing";
import { invalidateFeedCache } from "../feed";

const SENTENCE_MAX = 200;
const CONTEXT_MAX = 600;

interface CreateBody {
  sentence?: string;
  context?: string;
  photo_url?: string;
  preview_image_url?: string; // deprecated
  preview_image_metadata?: Record<string, unknown>; // deprecated
}

interface ThoughtParams {
  id: string;
}

export async function thoughtRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  app.post<{ Body: CreateBody }>("/api/thoughts", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const body = request.body ?? {};
    const sentence = typeof body.sentence === "string" ? body.sentence.trim() : "";
    const context = typeof body.context === "string" ? body.context.trim() : "";
    const photoUrl =
      typeof body.photo_url === "string" ? body.photo_url.trim() || null : null;
    if (!sentence) return reply.status(400).send({ error: "sentence required" });
    if (sentence.length > SENTENCE_MAX)
      return reply.status(400).send({ error: `sentence max ${SENTENCE_MAX} chars` });
    if (context.length > CONTEXT_MAX)
      return reply.status(400).send({ error: `context max ${CONTEXT_MAX} chars` });

    const [row] = await db
      .insert(thoughts)
      .values({
        userId,
        sentence,
        context: context || null,
        photoUrl,
        imageUrl: null,
        imageMetadata: null,
      })
      .returning({
        id: thoughts.id,
        sentence: thoughts.sentence,
        context: thoughts.context,
        photoUrl: thoughts.photoUrl,
        imageUrl: thoughts.imageUrl,
        createdAt: thoughts.createdAt,
      });
    if (!row) return reply.status(500).send();

    const thoughtId = row.id;
    processNewThought(thoughtId).catch((err: any) => {
      console.error("processNewThought failed", {
        thoughtId,
        message: err?.message ?? String(err),
        code: err?.code,
      });
    });
    invalidateFeedCache(userId);

    return reply.status(201).send({
      id: thoughtId,
      sentence: row.sentence,
      context: row.context ?? "",
      photo_url: row.photoUrl ?? null,
      image_url: row.imageUrl ?? null,
      created_at: row.createdAt?.toISOString(),
    });
  });

  app.delete<{ Params: ThoughtParams }>("/api/thoughts/:id", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const { id } = request.params;
    const [t] = await db.select().from(thoughts).where(eq(thoughts.id, id));
    if (!t) return reply.status(404).send();
    if (t.userId !== userId) return reply.status(403).send();
    await db.update(thoughts).set({ deletedAt: new Date() }).where(eq(thoughts.id, id));
    invalidateFeedCache(userId);
    return reply.status(200).send();
  });

  app.put<{ Params: ThoughtParams; Body: CreateBody }>("/api/thoughts/:id", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const { id } = request.params;
    const [t] = await db.select().from(thoughts).where(and(eq(thoughts.id, id), isNull(thoughts.deletedAt)));
    if (!t) return reply.status(404).send();
    if (t.userId !== userId) return reply.status(403).send();
    const body = request.body ?? {};
    const sentence = typeof body.sentence === "string" ? body.sentence.trim() : undefined;
    const context = typeof body.context === "string" ? body.context.trim() : undefined;
    const photoUrl = typeof body.photo_url === "string" ? body.photo_url.trim() || null : undefined;
    if (sentence !== undefined && !sentence) return reply.status(400).send({ error: "sentence required" });
    if (sentence && sentence.length > SENTENCE_MAX)
      return reply.status(400).send({ error: `sentence max ${SENTENCE_MAX} chars` });
    if (context !== undefined && context.length > CONTEXT_MAX)
      return reply.status(400).send({ error: `context max ${CONTEXT_MAX} chars` });

    const updates: Record<string, unknown> = {};
    if (sentence !== undefined) updates.sentence = sentence;
    if (context !== undefined) updates.context = context || null;
    if (photoUrl !== undefined) updates.photoUrl = photoUrl;

    if (Object.keys(updates).length > 0) {
      await db.update(thoughts).set(updates).where(eq(thoughts.id, id));
      invalidateFeedCache(userId);
    }

    const [updated] = await db.select().from(thoughts).where(eq(thoughts.id, id));
    return reply.send({
      id: updated.id,
      sentence: updated.sentence,
      context: updated.context ?? "",
      photo_url: updated.photoUrl ?? null,
      image_url: updated.imageUrl ?? null,
      created_at: updated.createdAt?.toISOString(),
    });
  });

  app.get<{ Params: ThoughtParams }>("/api/thoughts/:id", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();
    const { id } = request.params;
    const [t] = await db.select().from(thoughts).where(and(eq(thoughts.id, id), isNull(thoughts.deletedAt)));
    if (!t) return reply.status(404).send();
    const [author] = await db.select().from(users).where(eq(users.id, t.userId));
    const viewerIsAuthor = t.userId === userId;
    const visibleReplies = await db
      .select({
        id: replies.id,
        replierId: replies.replierId,
        text: replies.text,
        status: replies.status,
        createdAt: replies.createdAt,
      })
      .from(replies)
      .where(
        viewerIsAuthor
          ? and(eq(replies.thoughtId, id), ne(replies.status, "deleted"))
          : and(eq(replies.thoughtId, id), eq(replies.status, "accepted"))
      )
      .orderBy(asc(replies.createdAt));
    const replierIds = [...new Set(visibleReplies.map((r) => r.replierId))];
    const repliers = replierIds.length
      ? await db.select().from(users).where(inArray(users.id, replierIds))
      : [];
    const replierMap = new Map(repliers.map((u) => [u.id, u]));
    const warmth =
      visibleReplies.length === 0 ? "none" : visibleReplies.length <= 2 ? "low" : "medium";
    const pending = await db
      .select()
      .from(replies)
      .where(and(eq(replies.thoughtId, id), eq(replies.status, "pending"), eq(replies.replierId, userId)))
      .limit(1);
    const canReply =
      !viewerIsAuthor && pending.length === 0;

    return reply.send({
      panel_1: {
        sentence: t.sentence,
        photo_url: t.photoUrl,
        image_url: t.imageUrl,
        user: author
          ? { id: author.id, name: author.name, photo_url: author.photoUrl }
          : null,
        warmth_level: warmth,
        created_at: t.createdAt?.toISOString(),
      },
      panel_2: { sentence: t.sentence, context: t.context ?? "" },
      panel_3: {
        viewer_is_author: viewerIsAuthor,
        replies: visibleReplies.map((r) => {
          const u = replierMap.get(r.replierId);
          return {
            id: r.id,
            user: u ? { id: u.id, name: u.name, photo_url: u.photoUrl } : null,
            text: r.text,
            status: r.status,
            can_delete: viewerIsAuthor && r.status === "pending",
            created_at: r.createdAt?.toISOString(),
          };
        }),
        can_reply: canReply,
      },
    });
  });
}
