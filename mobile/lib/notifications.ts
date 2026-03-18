import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const NOTIFICATION_SEEN_KEY = "ohm_notifications_seen_v1";

export async function requestPushPermissionIfNeeded(): Promise<boolean> {
  if (!Platform.OS === "ios" && !Platform.OS === "android") {
    return false;
  }

  // Check existing status first
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return status === "granted";
}

