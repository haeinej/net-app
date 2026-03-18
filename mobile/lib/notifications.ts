export interface Notification {
  request: {
    content: {
      data?: Record<string, unknown>;
    };
  };
}

export interface NotificationResponse {
  notification: Notification;
}

// Push notifications are intentionally disabled while we stabilize iOS launch.
export async function requestPushPermissionIfNeeded(): Promise<boolean> {
  return false;
}

export async function unregisterPushToken(): Promise<void> {
  // no-op
}

export function vibrateOnNotification(): void {
  // no-op
}

export function addNotificationReceivedListener(
  _callback: (notification: Notification) => void
): () => void {
  return () => {};
}

export function addNotificationResponseListener(
  _callback: (response: NotificationResponse) => void
): () => void {
  return () => {};
}
