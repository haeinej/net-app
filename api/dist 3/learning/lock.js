"use strict";
/**
 * Simple DB lock for learning jobs. Expires after 2h so crashed jobs don't block forever.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.acquireLock = acquireLock;
exports.releaseLock = releaseLock;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const config_1 = require("./config");
const LOCK_EXPIRY_MS = config_1.learningConfig.lockExpiryMs;
async function acquireLock(jobType, lockedBy) {
    const now = new Date();
    const expired = new Date(now.getTime() - LOCK_EXPIRY_MS);
    const existing = await db_1.db
        .select()
        .from(db_1.learningJobLock)
        .where((0, drizzle_orm_1.eq)(db_1.learningJobLock.jobType, jobType))
        .limit(1);
    if (existing.length === 0) {
        await db_1.db.insert(db_1.learningJobLock).values({
            jobType,
            lockedAt: now,
            lockedBy,
        });
        return true;
    }
    const row = existing[0];
    if (row.lockedAt < expired) {
        await db_1.db
            .update(db_1.learningJobLock)
            .set({ lockedAt: now, lockedBy })
            .where((0, drizzle_orm_1.eq)(db_1.learningJobLock.jobType, jobType));
        return true;
    }
    return false;
}
async function releaseLock(jobType) {
    await db_1.db.delete(db_1.learningJobLock).where((0, drizzle_orm_1.eq)(db_1.learningJobLock.jobType, jobType));
}
