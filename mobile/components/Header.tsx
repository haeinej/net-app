import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, shadows } from "../theme";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../assets/images/ohm-logo.png");

interface HeaderProps {
  /** When true, show orange notification dot and allow opening notification panel */
  hasNotifications?: boolean;
  onNotificationPress?: () => void;
}

export function Header({ hasNotifications = false, onNotificationPress }: HeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { paddingTop: insets.top + 8 }]}>
      {/* Left: notification dot */}
      <View style={styles.side}>
        <TouchableOpacity
          style={[styles.notificationDot, !hasNotifications && styles.notificationDotInactive]}
          onPress={onNotificationPress}
          accessibilityLabel="Open notifications"
        >
          {hasNotifications && <View style={styles.notificationInner} />}
        </TouchableOpacity>
      </View>
      {/* Center: logo */}
      <Image source={ohmLogo} style={styles.logo} contentFit="contain" />
      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 12,
    minHeight: 44,
  },
  side: {
    flex: 1,
  },
  logo: {
    width: 28,
    height: 28,
  },
  notificationDot: {
    width: spacing.notificationDotSize,
    height: spacing.notificationDotSize,
    borderRadius: spacing.notificationDotSize / 2,
    backgroundColor: colors.VERMILLION,
    alignItems: "center",
    justifyContent: "center",
    // Organic liquid lift
    ...shadows.raised,
  },
  notificationDotInactive: {
    backgroundColor: colors.CARD_GROUND,
    shadowOpacity: 0.04,
  },
  notificationInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.TYPE_WHITE,
    // Tiny inner glow
    shadowColor: colors.TYPE_WHITE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
  },
});
