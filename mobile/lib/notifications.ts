import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { API_URL } from "./api-config";

/**
 * Configure how notifications appear when the app is in the foreground.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request push notification permissions and register the Expo push token
 * with the API server.
 */
export async function requestPushPermissionIfNeeded(): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return false;
  }

  // Physical device required for push notifications
  if (!Device.isDevice) {
    return false;
  }

  // Check existing status first
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") {
    await registerPushToken();
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  if (status === "granted") {
    await registerPushToken();
    return true;
  }

  return false;
}

/**
 * Get the Expo push token and send it to the API.
 */
async function registerPushToken(): Promise<void> {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "8954382e-1e4f-4137-8714-9890844f9dcd",
    });
    const token = tokenData.data;
    if (!token) return;

    const { getStoredToken } = await import("./auth-store");
    const authToken = await getStoredToken();
    if (!authToken) return;

    await fetch(`${API_URL}/api/push/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token,
        platform: Platform.OS,
      }),
    });
  } catch (error) {
    // Silent — push registration is best-effort
    console.warn("Push token registration failed:", error);
  }
}

/**
 * Unregister the push token (call on logout).
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "8954382e-1e4f-4137-8714-9890844f9dcd",
    });
    const token = tokenData.data;
    if (!token) return;

    const { getStoredToken } = await import("./auth-store");
    const authToken = await getStoredToken();
    if (!authToken) return;

    await fetch(`${API_URL}/api/push/register`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Silent
  }
}

/**
 * Vibrate with haptic feedback when a notification is received in-app.
 */
export function vibrateOnNotification(): void {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics not available (simulator)
  }
}

/**
 * Add a listener for received notifications (foreground).
 * Returns a cleanup function.
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): () => void {
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    vibrateOnNotification();
    callback(notification);
  });
  return () => subscription.remove();
}

/**
 * Add a listener for notification taps (opens from background/killed).
 * Returns a cleanup function.
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(callback);
  return () => subscription.remove();
}
