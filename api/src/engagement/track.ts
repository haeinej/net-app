/**
 * Bulk insert engagement events (Phase 6). Called from POST /api/engagement/track.
 */

import { db, engagementEvents } from "../db";
import type { EngagementEventPayload } from "./types";
import { ENGAGEMENT_EVENT_TYPES } from "./types";

export function isValidEventType(s: string): s is EngagementEventPayload["event_type"] {
  return ENGAGEMENT_EVENT_TYPES.includes(s as EngagementEventPayload["event_type"]);
}

function sanitizeMetadata(
  metadata: EngagementEventPayload["metadata"]
): Record<string, string | number | boolean | null | Array<string | number | boolean | null>> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const sanitizedEntries: Array<
    [string, string | number | boolean | null | Array<string | number | boolean | null>]
  > = [];
  for (const [key, value] of Object.entries(metadata).slice(0, 12)) {
    if (!key.trim()) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      sanitizedEntries.push([key, value]);
      continue;
    }
    if (Array.isArray(value)) {
      const sanitizedArray = value
        .filter(
          (entry): entry is string | number | boolean | null =>
            entry === null ||
            typeof entry === "string" ||
            typeof entry === "number" ||
            typeof entry === "boolean"
        )
        .slice(0, 10);
      sanitizedEntries.push([key, sanitizedArray]);
    }
  }

  return sanitizedEntries.length > 0 ? Object.fromEntries(sanitizedEntries) : null;
}

export async function trackEngagementEvents(
  userId: string,
  events: EngagementEventPayload[]
): Promise<number> {
  if (events.length === 0) return 0;
  const valid = events.filter(
    (e) =>
      isValidEventType(e.event_type) &&
      typeof e.thought_id === "string" &&
      e.thought_id.length > 0 &&
      typeof e.session_id === "string"
  );
  if (valid.length === 0) return 0;
  await db.insert(engagementEvents).values(
    valid.map((e) => ({
      userId,
      thoughtId: e.thought_id,
      eventType: e.event_type,
      sessionId: e.session_id,
      metadata: sanitizeMetadata(e.metadata),
    }))
  );
  return valid.length;
}
