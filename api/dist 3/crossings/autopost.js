"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoPostExpiredCrossings = autoPostExpiredCrossings;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const feed_1 = require("../feed");
const thought_processing_1 = require("../thought-processing");
const viewer_profile_1 = require("../feed/viewer-profile");
async function autoPostExpiredCrossings() {
    const now = new Date();
    const postedThoughtIds = [];
    const postedUserIds = new Set();
    const dueDrafts = await db_1.db
        .select({
        id: db_1.crossingDrafts.id,
    })
        .from(db_1.crossingDrafts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.status, "awaiting_other"), (0, drizzle_orm_1.lte)(db_1.crossingDrafts.autoPostAt, now)));
    for (const draft of dueDrafts) {
        try {
            const result = await db_1.db.transaction(async (tx) => {
                const [claimedDraft] = await tx
                    .update(db_1.crossingDrafts)
                    .set({
                    status: "auto_posted",
                    autoPostAt: null,
                    updatedAt: now,
                })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.crossingDrafts.id, draft.id), (0, drizzle_orm_1.eq)(db_1.crossingDrafts.status, "awaiting_other"), (0, drizzle_orm_1.lte)(db_1.crossingDrafts.autoPostAt, now)))
                    .returning({
                    id: db_1.crossingDrafts.id,
                    initiatorId: db_1.crossingDrafts.initiatorId,
                    sentence: db_1.crossingDrafts.sentence,
                    context: db_1.crossingDrafts.context,
                });
                const sentence = claimedDraft?.sentence?.trim();
                if (!claimedDraft || !sentence)
                    return null;
                const [user] = await tx
                    .select({ photoUrl: db_1.users.photoUrl })
                    .from(db_1.users)
                    .where((0, drizzle_orm_1.eq)(db_1.users.id, claimedDraft.initiatorId))
                    .limit(1);
                const [thought] = await tx
                    .insert(db_1.thoughts)
                    .values({
                    userId: claimedDraft.initiatorId,
                    sentence,
                    context: claimedDraft.context ?? null,
                    photoUrl: user?.photoUrl ?? null,
                    imageUrl: null,
                    imageMetadata: null,
                })
                    .returning({ id: db_1.thoughts.id });
                if (!thought)
                    return null;
                await tx
                    .update(db_1.crossingDrafts)
                    .set({
                    autoPostedThoughtId: thought.id,
                })
                    .where((0, drizzle_orm_1.eq)(db_1.crossingDrafts.id, claimedDraft.id));
                return {
                    thoughtId: thought.id,
                    initiatorId: claimedDraft.initiatorId,
                };
            });
            if (!result)
                continue;
            postedThoughtIds.push(result.thoughtId);
            postedUserIds.add(result.initiatorId);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("autoPostExpiredCrossings failed", {
                draftId: draft.id,
                message,
            });
        }
    }
    for (const userId of postedUserIds) {
        void (0, feed_1.invalidateFeedCache)(userId);
        void (0, viewer_profile_1.invalidateViewerFeedProfile)(userId);
    }
    for (const thoughtId of postedThoughtIds) {
        (0, thought_processing_1.processNewThought)(thoughtId).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            console.error("autoPostExpiredCrossings processNewThought failed", {
                thoughtId,
                message,
            });
        });
    }
    return { posted: postedThoughtIds.length };
}
