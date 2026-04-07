import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, isNull, inArray, asc, ne, desc, sql } from "drizzle-orm";
import { db, thoughts, users } from "../db";
import { getUserId, authenticate } from "../lib/auth";
import { processNewThought } from "../thought-processing";
import { invalidateFeedCache } from "../feed";
import { filterContent } from "../lib/content-filter";
import { invalidateViewerFeedProfile } from "../feed/viewer-profile";
import { notifyNewReply } from "../lib/push";

const SENTENCE_MAX = 200;
const CONTEXT_MAX = 600;

interface CreateBody {
  sentence?: string;
  context?: string;
  photo_url?: string;
  in_response_to_id?: string;
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

    const sentenceFilter = filterContent(sentence);
    if (sentenceFilter.flagged) {
      return reply.status(400).send({
        error: "Your thought was flagged for potentially objectionable content. Please revise and try again.",
      });
    }
    if (context) {
      const contextFilter = filterContent(context);
      if (contextFilter.flagged) {
        return reply.status(400).send({
          error: "Your context was flagged for potentially objectionable content. Please revise and try again.",
        });
      }
    }

    const inResponseToId =
      typeof body.in_response_to_id === "string" ? body.in_response_to_id.trim() || null : null;

    if (inResponseToId) {
      const [parent] = await db
        .select({ id: thoughts.id, userId: thoughts.userId })
        .from(thoughts)
        .where(and(eq(thoughts.id, inResponseToId), isNull(thoughts.deletedAt)))
        .limit(1);
      if (!parent) {
        return reply.status(400).send({ error: "Referenced thought not found" });
      }
    }

    const [row] = await db
      .insert(thoughts)
      .values({
        userId,
        sentence,
        context: context || null,
        photoUrl,
        imageUrl: null,
        imageMetadata: null,
        inResponseToId: inResponseToId,
      })
      .returning({
        id: thoughts.id,
        sentence: thoughts.sentence,
        context: thoughts.context,
        photoUrl: thoughts.photoUrl,
        imageUrl: thoughts.imageUrl,
        inResponseToId: thoughts.inResponseToId,
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
    void invalidateFeedCache(userId);
    void invalidateViewerFeedProfile(userId);

    // Notify original thought's author about the reply-card
    if (inResponseToId) {
      const [parent] = await db
        .select({ userId: thoughts.userId, sentence: thoughts.sentence })
        .from(thoughts)
        .where(eq(thoughts.id, inResponseToId))
        .limit(1);
      if (parent && parent.userId !== userId) {
        notifyNewReply(parent.userId, userId, parent.sentence, sentence, inResponseToId).catch(() => {});
      }
    }

    return reply.status(201).send({
      id: thoughtId,
      sentence: row.sentence,
      context: row.context ?? "",
      photo_url: row.photoUrl ?? null,
      image_url: row.imageUrl ?? null,
      in_response_to_id: row.inResponseToId ?? null,
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
    void invalidateFeedCache();
    void invalidateViewerFeedProfile(userId);
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
      void invalidateFeedCache();
      void invalidateViewerFeedProfile(userId);
      if (sentence !== undefined || context !== undefined) {
        processNewThought(id).catch((err: any) => {
          console.error("processNewThought after edit failed", {
            thoughtId: id,
            message: err?.message ?? String(err),
            code: err?.code,
          });
        });
      }
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

    // Load parent thought info if this is a reply-card
    let inResponseTo: { id: string; sentence: string; user: { id: string; name: string | null; photo_url: string | null } } | null = null;
    if (t.inResponseToId) {
      const [parent] = await db
        .select({ id: thoughts.id, sentence: thoughts.sentence, userId: thoughts.userId })
        .from(thoughts)
        .where(eq(thoughts.id, t.inResponseToId))
        .limit(1);
      if (parent) {
        const [parentAuthor] = await db
          .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
          .from(users)
          .where(eq(users.id, parent.userId))
          .limit(1);
        inResponseTo = {
          id: parent.id,
          sentence: parent.sentence,
          user: parentAuthor
            ? { id: parentAuthor.id, name: parentAuthor.name, photo_url: parentAuthor.photoUrl }
            : { id: parent.userId, name: null, photo_url: null },
        };
      }
    }

    // Fetch reply-cards (thoughts that reference this one)
    const replyThoughts = await db
      .select({
        id: thoughts.id,
        sentence: thoughts.sentence,
        photoUrl: thoughts.photoUrl,
        imageUrl: thoughts.imageUrl,
        context: thoughts.context,
        createdAt: thoughts.createdAt,
        userId: thoughts.userId,
      })
      .from(thoughts)
      .where(and(eq(thoughts.inResponseToId, id), isNull(thoughts.deletedAt)))
      .orderBy(desc(thoughts.createdAt))
      .limit(10);

    const replyAuthorIds = [...new Set(replyThoughts.map((rt) => rt.userId))];
    const replyAuthors = replyAuthorIds.length > 0
      ? await db.select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, replyAuthorIds))
      : [];
    const replyAuthorMap = new Map(replyAuthors.map((u) => [u.id, u]));

    const replies = replyThoughts.map((rt) => {
      const ra = replyAuthorMap.get(rt.userId);
      return {
        type: "thought" as const,
        thought: {
          id: rt.id,
          sentence: rt.sentence,
          photo_url: rt.photoUrl,
          image_url: rt.imageUrl,
          created_at: rt.createdAt?.toISOString() ?? new Date().toISOString(),
          has_context: (rt.context ?? "").trim().length > 0,
        },
        user: {
          id: rt.userId,
          name: ra?.name ?? null,
          photo_url: ra?.photoUrl ?? null,
        },
      };
    });

    return reply.send({
      panel_1: {
        sentence: t.sentence,
        photo_url: t.photoUrl,
        image_url: t.imageUrl,
        user: author
          ? { id: author.id, name: author.name, photo_url: author.photoUrl }
          : null,
        created_at: t.createdAt?.toISOString(),
      },
      panel_2: { sentence: t.sentence, context: t.context ?? "" },
      panel_3: {
        viewer_is_author: viewerIsAuthor,
        can_reply: !viewerIsAuthor,
        reply_count: replyThoughts.length,
        replies,
      },
      in_response_to: inResponseTo,
    });
  });

  // Reply-cards: thoughts created in response to this thought
  app.get<{ Params: ThoughtParams; Querystring: { limit?: string } }>(
    "/api/thoughts/:id/replies",
    async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();
      const { id } = request.params;
      const limit = Math.min(50, Math.max(1, parseInt(request.query.limit ?? "20", 10) || 20));

      const replyThoughts = await db
        .select({
          id: thoughts.id,
          sentence: thoughts.sentence,
          photoUrl: thoughts.photoUrl,
          imageUrl: thoughts.imageUrl,
          context: thoughts.context,
          createdAt: thoughts.createdAt,
          userId: thoughts.userId,
        })
        .from(thoughts)
        .where(and(eq(thoughts.inResponseToId, id), isNull(thoughts.deletedAt)))
        .orderBy(desc(thoughts.createdAt))
        .limit(limit);

      const authorIds = [...new Set(replyThoughts.map((t) => t.userId))];
      const authors = authorIds.length > 0
        ? await db.select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, authorIds))
        : [];
      const authorMap = new Map(authors.map((u) => [u.id, u]));

      const items = replyThoughts.map((t) => {
        const a = authorMap.get(t.userId);
        return {
          type: "thought" as const,
          thought: {
            id: t.id,
            sentence: t.sentence,
            photo_url: t.photoUrl,
            image_url: t.imageUrl,
            created_at: t.createdAt?.toISOString() ?? new Date().toISOString(),
            has_context: (t.context ?? "").trim().length > 0,
          },
          user: {
            id: t.userId,
            name: a?.name ?? null,
            photo_url: a?.photoUrl ?? null,
          },
        };
      });

      return reply.send({ items });
    }
  );
}
