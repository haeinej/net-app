import { and, eq, lte } from "drizzle-orm";
import { db, crossingDrafts, thoughts, users } from "../db";
import { invalidateFeedCache } from "../feed";
import { processNewThought } from "../thought-processing";
import { invalidateViewerFeedProfile } from "../feed/viewer-profile";

export async function autoPostExpiredCrossings(): Promise<{ posted: number }> {
  const now = new Date();
  const postedThoughtIds: string[] = [];
  const postedUserIds = new Set<string>();

  const dueDrafts = await db
    .select({
      id: crossingDrafts.id,
    })
    .from(crossingDrafts)
    .where(
      and(
        eq(crossingDrafts.status, "awaiting_other"),
        lte(crossingDrafts.autoPostAt, now)
      )
    );

  for (const draft of dueDrafts) {
    try {
      const result = await db.transaction(async (tx) => {
        const [claimedDraft] = await tx
          .update(crossingDrafts)
          .set({
            status: "auto_posted",
            autoPostAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(crossingDrafts.id, draft.id),
              eq(crossingDrafts.status, "awaiting_other"),
              lte(crossingDrafts.autoPostAt, now)
            )
          )
          .returning({
            id: crossingDrafts.id,
            initiatorId: crossingDrafts.initiatorId,
            sentence: crossingDrafts.sentence,
            context: crossingDrafts.context,
          });
        const sentence = claimedDraft?.sentence?.trim();
        if (!claimedDraft || !sentence) return null;

        const [user] = await tx
          .select({ photoUrl: users.photoUrl })
          .from(users)
          .where(eq(users.id, claimedDraft.initiatorId))
          .limit(1);

        const [thought] = await tx
          .insert(thoughts)
          .values({
            userId: claimedDraft.initiatorId,
            sentence,
            context: claimedDraft.context ?? null,
            photoUrl: user?.photoUrl ?? null,
            imageUrl: null,
            imageMetadata: null,
          })
          .returning({ id: thoughts.id });

        if (!thought) return null;

        await tx
          .update(crossingDrafts)
          .set({
            autoPostedThoughtId: thought.id,
          })
          .where(eq(crossingDrafts.id, claimedDraft.id));

        return {
          thoughtId: thought.id,
          initiatorId: claimedDraft.initiatorId,
        };
      });

      if (!result) continue;
      postedThoughtIds.push(result.thoughtId);
      postedUserIds.add(result.initiatorId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("autoPostExpiredCrossings failed", {
        draftId: draft.id,
        message,
      });
    }
  }

  for (const userId of postedUserIds) {
    void invalidateFeedCache(userId);
    void invalidateViewerFeedProfile(userId);
  }

  for (const thoughtId of postedThoughtIds) {
    processNewThought(thoughtId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("autoPostExpiredCrossings processNewThought failed", {
        thoughtId,
        message,
      });
    });
  }

  return { posted: postedThoughtIds.length };
}
