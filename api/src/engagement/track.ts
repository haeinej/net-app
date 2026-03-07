/**
 * Bulk insert engagement events (Phase 6). Called from POST /api/engagement/track.
 */

import { db, engagementEvents } from "../db";
import type { EngagementEventPayload } from "./types";
import { ENGAGEMENT_EVENT_TYPES } from "./types";

export function isValidEventType(s: string): s is EngagementEventPayload["event_type"] {
  return ENGAGEMENT_EVENT_TYPES.includes(s as EngagementEventPayload["event_type"]);
}

export async function trackEngagementEvents(
  userId: string,
  events: EngagementEventPayload[]
): Promise<void> {
  if (events.length === 0) return;
  const valid = events.filter(
    (e) =>
      isValidEventType(e.event_type) &&
      typeof e.thought_id === "string" &&
      e.thought_id.length > 0 &&
      typeof e.session_id === "string"
  );
  if (valid.length === 0) return;
  await db.insert(engagementEvents).values(
    valid.map((e) => ({
      userId,
      thoughtId: e.thought_id,
      eventType: e.event_type,
      sessionId: e.session_id,
      metadata: e.metadata ?? null,
      createdAt: e.timestamp ? new Date(e.timestamp) : undefined,
    }))
  );
}
