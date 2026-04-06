"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBlockedUserIds = getBlockedUserIds;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
/**
 * Get the set of user IDs that the viewer has blocked OR that have blocked the viewer.
 * Bidirectional so neither party sees the other's content.
 */
async function getBlockedUserIds(viewerId) {
    const rows = await db_1.db
        .select({ blockerId: db_1.blocks.blockerId, blockedId: db_1.blocks.blockedId })
        .from(db_1.blocks)
        .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.blocks.blockerId, viewerId), (0, drizzle_orm_1.eq)(db_1.blocks.blockedId, viewerId)));
    const ids = new Set();
    for (const r of rows) {
        if (r.blockerId !== viewerId)
            ids.add(r.blockerId);
        if (r.blockedId !== viewerId)
            ids.add(r.blockedId);
    }
    return ids;
}
