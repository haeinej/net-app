import { eq, or } from "drizzle-orm";
import { db, blocks } from "../db";

/**
 * Get the set of user IDs that the viewer has blocked OR that have blocked the viewer.
 * Bidirectional so neither party sees the other's content.
 */
export async function getBlockedUserIds(viewerId: string): Promise<Set<string>> {
  const rows = await db
    .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
    .from(blocks)
    .where(or(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, viewerId)));

  const ids = new Set<string>();
  for (const r of rows) {
    if (r.blockerId !== viewerId) ids.add(r.blockerId);
    if (r.blockedId !== viewerId) ids.add(r.blockedId);
  }
  return ids;
}
