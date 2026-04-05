"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONVERSATION_HISTORY_RETENTION_DAYS = void 0;
exports.getConversationHistoryExpiresAt = getConversationHistoryExpiresAt;
exports.isConversationHistoryExpired = isConversationHistoryExpired;
exports.clearConversationHistories = clearConversationHistories;
exports.clearExpiredConversationHistories = clearExpiredConversationHistories;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
exports.CONVERSATION_HISTORY_RETENTION_DAYS = 14;
const CONVERSATION_HISTORY_RETENTION_MS = exports.CONVERSATION_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
function getConversationHistoryExpiresAt(lastMessageAt) {
    if (!lastMessageAt)
        return null;
    return new Date(lastMessageAt.getTime() + CONVERSATION_HISTORY_RETENTION_MS);
}
function isConversationHistoryExpired(lastMessageAt, now = Date.now()) {
    const historyExpiresAt = getConversationHistoryExpiresAt(lastMessageAt);
    return Boolean(historyExpiresAt && historyExpiresAt.getTime() <= now);
}
async function clearConversationHistories(conversationIds) {
    if (conversationIds.length === 0)
        return;
    await db_1.db.delete(db_1.messages).where((0, drizzle_orm_1.inArray)(db_1.messages.conversationId, conversationIds));
}
async function clearExpiredConversationHistories() {
    const cutoff = new Date(Date.now() - CONVERSATION_HISTORY_RETENTION_MS);
    const rows = await db_1.db
        .select({ id: db_1.conversations.id })
        .from(db_1.conversations)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNotNull)(db_1.conversations.lastMessageAt), (0, drizzle_orm_1.lt)(db_1.conversations.lastMessageAt, cutoff)));
    const conversationIds = rows.map((row) => row.id);
    await clearConversationHistories(conversationIds);
    return conversationIds.length;
}
