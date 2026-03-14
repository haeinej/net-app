import { and, inArray, isNotNull, lt } from "drizzle-orm";
import { db, conversations, messages } from "../db";

export const CONVERSATION_HISTORY_RETENTION_DAYS = 14;
const CONVERSATION_HISTORY_RETENTION_MS =
  CONVERSATION_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function getConversationHistoryExpiresAt(lastMessageAt: Date | null): Date | null {
  if (!lastMessageAt) return null;
  return new Date(lastMessageAt.getTime() + CONVERSATION_HISTORY_RETENTION_MS);
}

export function isConversationHistoryExpired(lastMessageAt: Date | null, now = Date.now()): boolean {
  const historyExpiresAt = getConversationHistoryExpiresAt(lastMessageAt);
  return Boolean(historyExpiresAt && historyExpiresAt.getTime() <= now);
}

export async function clearConversationHistories(conversationIds: string[]): Promise<void> {
  if (conversationIds.length === 0) return;
  await db.delete(messages).where(inArray(messages.conversationId, conversationIds));
}

export async function clearExpiredConversationHistories(): Promise<number> {
  const cutoff = new Date(Date.now() - CONVERSATION_HISTORY_RETENTION_MS);
  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(isNotNull(conversations.lastMessageAt), lt(conversations.lastMessageAt, cutoff)));
  const conversationIds = rows.map((row) => row.id);
  await clearConversationHistories(conversationIds);
  return conversationIds.length;
}
