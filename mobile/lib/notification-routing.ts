/**
 * Maps push notification data payloads to expo-router paths.
 * Keeps deep-link logic isolated and testable.
 */

interface NotificationData {
  type?: string;
  thought_id?: string;
  conversation_id?: string;
  [key: string]: unknown;
}

interface RouteTarget {
  pathname: string;
  params?: Record<string, string>;
}

export function resolveNotificationRoute(data?: NotificationData | null): RouteTarget | null {
  if (!data?.type) return null;

  switch (data.type) {
    case "reply":
      return data.thought_id
        ? { pathname: "/thought/[id]", params: { id: data.thought_id } }
        : null;

    case "message":
      return data.conversation_id
        ? { pathname: "/conversation/[id]", params: { id: data.conversation_id } }
        : null;

    case "resonance_milestone":
      return data.thought_id
        ? { pathname: "/thought/[id]", params: { id: data.thought_id } }
        : null;

    default:
      return null;
  }
}
