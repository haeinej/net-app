import type { FastifyInstance } from "fastify";
import { eq, and, or } from "drizzle-orm";
import { db, reports, blocks, users, thoughts, replies, crossings, crossingReplies, messages } from "../db";
import { getUserId, authenticate } from "../lib/auth";
import { invalidateFeedCache } from "../feed";

const VALID_REASONS = [
  "harassment",
  "hate_speech",
  "spam",
  "sexual_content",
  "violence",
  "self_harm",
  "other",
] as const;

const VALID_TARGET_TYPES = [
  "thought",
  "reply",
  "crossing",
  "crossing_reply",
  "message",
  "user",
] as const;

const DESCRIPTION_MAX = 500;

type ReportReason = (typeof VALID_REASONS)[number];
type ReportTargetType = (typeof VALID_TARGET_TYPES)[number];

interface ReportBody {
  target_type?: string;
  target_id?: string;
  reason?: string;
  description?: string;
}

interface BlockBody {
  user_id?: string;
}

interface UserIdParam {
  userId: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve the owner of a reported content item. */
async function resolveTargetUserId(
  targetType: ReportTargetType,
  targetId: string
): Promise<string | null> {
  switch (targetType) {
    case "thought": {
      const [row] = await db
        .select({ userId: thoughts.userId })
        .from(thoughts)
        .where(eq(thoughts.id, targetId))
        .limit(1);
      return row?.userId ?? null;
    }
    case "reply": {
      const [row] = await db
        .select({ replierId: replies.replierId })
        .from(replies)
        .where(eq(replies.id, targetId))
        .limit(1);
      return row?.replierId ?? null;
    }
    case "crossing": {
      // attribute to participant_a (initiator) for moderation
      const [row] = await db
        .select({ participantA: crossings.participantA })
        .from(crossings)
        .where(eq(crossings.id, targetId))
        .limit(1);
      return row?.participantA ?? null;
    }
    case "crossing_reply": {
      const [row] = await db
        .select({ replierId: crossingReplies.replierId })
        .from(crossingReplies)
        .where(eq(crossingReplies.id, targetId))
        .limit(1);
      return row?.replierId ?? null;
    }
    case "message": {
      const [row] = await db
        .select({ senderId: messages.senderId })
        .from(messages)
        .where(eq(messages.id, targetId))
        .limit(1);
      return row?.senderId ?? null;
    }
    case "user":
      return targetId;
    default:
      return null;
  }
}

export async function moderationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authenticate);

  // --- Report content ---
  app.post<{ Body: ReportBody }>("/api/reports", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();

    const body = request.body ?? {};
    const targetType = body.target_type as ReportTargetType | undefined;
    const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
    const reason = body.reason as ReportReason | undefined;
    const description =
      typeof body.description === "string" ? body.description.trim().slice(0, DESCRIPTION_MAX) : null;

    if (!targetType || !VALID_TARGET_TYPES.includes(targetType)) {
      return reply.status(400).send({ error: "invalid target_type" });
    }
    if (!targetId || !UUID_PATTERN.test(targetId)) {
      return reply.status(400).send({ error: "target_id required" });
    }
    if (!reason || !VALID_REASONS.includes(reason)) {
      return reply.status(400).send({ error: "invalid reason" });
    }
    if (targetType === "user" && targetId === userId) {
      return reply.status(400).send({ error: "cannot report yourself" });
    }

    const targetUserId = await resolveTargetUserId(targetType, targetId);

    const [row] = await db
      .insert(reports)
      .values({
        reporterId: userId,
        targetType,
        targetId,
        targetUserId: targetUserId,
        reason,
        description: description || null,
      })
      .returning({ id: reports.id, createdAt: reports.createdAt });

    if (!row) return reply.status(500).send();

    // Log for developer notification (visible in server logs / monitoring)
    request.log.warn(
      {
        report_id: row.id,
        reporter_id: userId,
        target_type: targetType,
        target_id: targetId,
        target_user_id: targetUserId,
        reason,
      },
      "CONTENT_REPORT: new report filed"
    );

    return reply.status(201).send({
      id: row.id,
      created_at: row.createdAt?.toISOString(),
    });
  });

  // --- Block user ---
  app.post<{ Body: BlockBody }>("/api/blocks", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();

    const blockedId =
      typeof request.body?.user_id === "string" ? request.body.user_id.trim() : "";
    if (!blockedId || !UUID_PATTERN.test(blockedId)) {
      return reply.status(400).send({ error: "user_id required" });
    }
    if (blockedId === userId) {
      return reply.status(400).send({ error: "cannot block yourself" });
    }

    // Verify target user exists
    const [targetUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, blockedId))
      .limit(1);
    if (!targetUser) return reply.status(404).send({ error: "user not found" });

    try {
      await db.insert(blocks).values({ blockerId: userId, blockedId });
    } catch (error: unknown) {
      // unique violation = already blocked, treat as success
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        return reply.status(200).send({ blocked: true });
      }
      throw error;
    }

    // Invalidate feed cache so blocked user content is immediately removed
    void invalidateFeedCache(userId);

    // Log for developer notification
    request.log.warn(
      { blocker_id: userId, blocked_id: blockedId },
      "USER_BLOCK: user blocked"
    );

    // Auto-create a report so the developer is notified of the abusive user
    await db
      .insert(reports)
      .values({
        reporterId: userId,
        targetType: "user",
        targetId: blockedId,
        targetUserId: blockedId,
        reason: "harassment",
        description: "Auto-generated report from user block action",
      })
      .catch((err) => {
        request.log.error({ err }, "failed to auto-create report on block");
      });

    return reply.status(201).send({ blocked: true });
  });

  // --- Unblock user ---
  app.delete<{ Params: UserIdParam }>(
    "/api/blocks/:userId",
    async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();

      const blockedId = request.params.userId;
      if (!blockedId || !UUID_PATTERN.test(blockedId)) {
        return reply.status(400).send({ error: "invalid user id" });
      }

      await db
        .delete(blocks)
        .where(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, blockedId)));

      void invalidateFeedCache(userId);
      return reply.status(200).send({ blocked: false });
    }
  );

  // --- Get blocked users list ---
  app.get("/api/blocks", async (request, reply) => {
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send();

    const rows = await db
      .select({
        blockedId: blocks.blockedId,
        blockedName: users.name,
        blockedPhoto: users.photoUrl,
        createdAt: blocks.createdAt,
      })
      .from(blocks)
      .innerJoin(users, eq(blocks.blockedId, users.id))
      .where(eq(blocks.blockerId, userId));

    return reply.send(
      rows.map((r) => ({
        user_id: r.blockedId,
        name: r.blockedName,
        photo_url: r.blockedPhoto,
        blocked_at: r.createdAt?.toISOString(),
      }))
    );
  });

  // --- Check if a specific user is blocked ---
  app.get<{ Params: UserIdParam }>(
    "/api/blocks/:userId/status",
    async (request, reply) => {
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send();

      const targetId = request.params.userId;
      const [row] = await db
        .select({ id: blocks.id })
        .from(blocks)
        .where(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, targetId)))
        .limit(1);

      return reply.send({ blocked: Boolean(row) });
    }
  );
}
