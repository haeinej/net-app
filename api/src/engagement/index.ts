/**
 * Phase 6: engagement tracking and analytics (internal).
 */

export { engagementRoutes } from "./routes";
export { trackEngagementEvents, isValidEventType } from "./track";
export { getThoughtFunnel, getUserEngagementProfile } from "./analytics";
export type {
  EngagementEventType,
  EngagementEventPayload,
  TrackRequestBody,
  ThoughtFunnel,
  UserEngagement,
} from "./types";
export { ENGAGEMENT_EVENT_TYPES } from "./types";
