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

const FALLBACK_ROUTE: RouteTarget = { pathname: "/(tabs)" };

export function resolveNotificationRoute(data?: NotificationData | null): RouteTarget | null {
  if (!data?.type) return null;

  switch (data.type) {
    case "reply":
      return data.thought_id
        ? { pathname: "/thought/[id]", params: { id: data.thought_id } }
        : FALLBACK_ROUTE;

    case "message":
      return data.conversation_id
        ? { pathname: "/conversation/[id]", params: { id: data.conversation_id } }
        : FALLBACK_ROUTE;

    case "resonance_milestone":
      return data.thought_id
        ? { pathname: "/thought/[id]", params: { id: data.thought_id } }
        : FALLBACK_ROUTE;

    default:
      console.warn("[notification] Unknown notification type:", data.type);
      return FALLBACK_ROUTE;
  }
}
