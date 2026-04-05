"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOnboardingStateForUser = getOnboardingStateForUser;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
async function getOnboardingStateForUser(userId) {
    const [[user], [existingThought]] = await Promise.all([
        db_1.db
            .select({
            interests: db_1.users.interests,
        })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .limit(1),
        db_1.db
            .select({ id: db_1.thoughts.id })
            .from(db_1.thoughts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.thoughts.userId, userId), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt)))
            .limit(1),
    ]);
    if (!user) {
        return {
            onboarding_step: 1,
            onboarding_complete: false,
        };
    }
    const hasInterests = Array.isArray(user.interests) &&
        user.interests.some((value) => typeof value === "string" && value.trim().length > 0);
    if (existingThought || hasInterests) {
        return {
            onboarding_step: 1,
            onboarding_complete: true,
        };
    }
    return {
        onboarding_step: 2,
        onboarding_complete: false,
    };
}
