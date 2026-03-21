import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { registerPushToken as apiRegisterToken, unregisterPushToken as apiUnregisterToken } from "./api";
import { isDemoAuthToken } from "./demo-mode";
import { getStoredToken } from "./auth-store";

const KEY_PUSH_TOKEN = "ohm.push.token";

// Re-export expo-notifications types under existing interface names
export type Notification = Notifications.Notification;
export type NotificationResponse = Notifications.NotificationResponse;

/**
 * Must be called at module level (outside any component) so the handler
 * is registered before any notification arrives.
 */
export function setupForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Request push permission, obtain an Expo push token, and register it
 * with the backend. Returns true if successfully registered.
 * Skips silently for demo sessions.
 */
export async function requestPushPermissionIfNeeded(): Promise<boolean> {
  try {
    // Skip for demo users
    const authToken = await getStoredToken();
    if (isDemoAuthToken(authToken)) return false;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return false;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      console.warn("Push: missing EAS projectId");
      return false;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    await apiRegisterToken(token, Platform.OS);
    await SecureStore.setItemAsync(KEY_PUSH_TOKEN, token);

    return true;
  } catch (error) {
    console.warn("Push registration failed:", error);
    return false;
  }
}

/**
 * Unregister the stored push token from the backend and clear it locally.
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(KEY_PUSH_TOKEN);
    if (token) {
      await apiUnregisterToken(token);
    }
  } catch {
    // best-effort
  } finally {
    await SecureStore.deleteItemAsync(KEY_PUSH_TOKEN).catch(() => {});
  }
}

/**
 * Check whether a push token is currently stored (i.e. notifications are active).
 */
export async function getStoredPushToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_PUSH_TOKEN);
}

/**
 * Clear the stored push token without calling the API (used during auth clear).
 */
export async function clearStoredPushToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PUSH_TOKEN).catch(() => {});
}

export function addNotificationReceivedListener(
  callback: (notification: Notification) => void
): () => void {
  const sub = Notifications.addNotificationReceivedListener(callback);
  return () => sub.remove();
}

export function addNotificationResponseListener(
  callback: (response: NotificationResponse) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(callback);
  return () => sub.remove();
}

export async function getLastNotificationResponse(): Promise<NotificationResponse | null> {
  return Notifications.getLastNotificationResponseAsync();
}
