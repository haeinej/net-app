import { and, eq, isNull } from "drizzle-orm";
import { db, thoughts, users } from "../db";

export interface OnboardingState {
  onboarding_step: 1 | 2 | 3;
  onboarding_complete: boolean;
}

export async function getOnboardingStateForUser(
  userId: string
): Promise<OnboardingState> {
  const [[user], [existingThought]] = await Promise.all([
    db
      .select({
        interests: users.interests,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ id: thoughts.id })
      .from(thoughts)
      .where(and(eq(thoughts.userId, userId), isNull(thoughts.deletedAt)))
      .limit(1),
  ]);

  if (!user) {
    return {
      onboarding_step: 1,
      onboarding_complete: false,
    };
  }

  const hasInterests =
    Array.isArray(user.interests) &&
    user.interests.some(
      (value) => typeof value === "string" && value.trim().length > 0
    );

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
