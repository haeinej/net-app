/**
 * Engagement tracking types (Phase 6). Event payload from client.
 */

export const ENGAGEMENT_EVENT_TYPES = [
  "view_p1",
  "swipe_p2",
  "swipe_p3",
  "type_start",
  "reply_sent",
] as const;

export type EngagementEventType = (typeof ENGAGEMENT_EVENT_TYPES)[number];

export interface EngagementEventPayload {
  event_type: EngagementEventType;
  thought_id: string;
  session_id: string;
  metadata?: Record<string, unknown>;
  timestamp: string; // ISO
}

export interface TrackRequestBody {
  events: EngagementEventPayload[];
}

/** Internal analytics only — never exposed to users. */
export interface ThoughtFunnel {
  views: number;
  swipe_to_context: number;
  swipe_to_replies: number;
  typing_started: number;
  replies_sent: number;
  replies_accepted: number;
  conversion_rates: {
    p1_to_p2: number;
    p2_to_p3: number;
    p3_to_reply: number;
    reply_to_accepted: number;
  };
}

export interface UserEngagement {
  avg_swipe_through_rate: number;
  avg_reply_rate: number;
  cross_cohort_reply_rate: number;
  cross_concentration_reply_rate: number;
  avg_reply_length: number;
  total_thoughts_posted: number;
  total_replies_sent: number;
  total_conversations: number;
}
