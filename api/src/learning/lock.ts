/**
 * Simple DB lock for learning jobs. Expires after 2h so crashed jobs don't block forever.
 */

import { eq } from "drizzle-orm";
import { db, learningJobLock } from "../db";
import { learningConfig } from "./config";

const LOCK_EXPIRY_MS = learningConfig.lockExpiryMs;

export async function acquireLock(
  jobType: "daily" | "weekly",
  lockedBy: string
): Promise<boolean> {
  const now = new Date();
  const expired = new Date(now.getTime() - LOCK_EXPIRY_MS);
  const existing = await db
    .select()
    .from(learningJobLock)
    .where(eq(learningJobLock.jobType, jobType))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(learningJobLock).values({
      jobType,
      lockedAt: now,
      lockedBy,
    });
    return true;
  }
  const row = existing[0]!;
  if (row.lockedAt < expired) {
    await db
      .update(learningJobLock)
      .set({ lockedAt: now, lockedBy })
      .where(eq(learningJobLock.jobType, jobType));
    return true;
  }
  return false;
}

export async function releaseLock(jobType: "daily" | "weekly"): Promise<void> {
  await db.delete(learningJobLock).where(eq(learningJobLock.jobType, jobType));
}
