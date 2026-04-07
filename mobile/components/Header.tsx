import { View, Pressable, StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, shadows } from "../theme";
import { usePressAnimation } from "../hooks/usePressAnimation";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../assets/images/ohm-logo.png");

interface HeaderProps {
  /** When true, show orange notification dot and allow opening notification panel */
  hasNotifications?: boolean;
  onNotificationPress?: () => void;
}

export function Header({ hasNotifications = false, onNotificationPress }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const { animatedStyle: pressStyle, onPressIn, onPressOut } = usePressAnimation();

  return (
    <View style={[styles.row, { paddingTop: insets.top + 8 }]}>
      {/* Left: notification dot */}
      <View style={styles.side}>
        <Pressable
          onPress={onNotificationPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          accessibilityLabel="Open notifications"
        >
          <Animated.View style={[styles.notificationDot, !hasNotifications && styles.notificationDotInactive, pressStyle]}>
            {hasNotifications && <View style={styles.notificationInner} />}
          </Animated.View>
        </Pressable>
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
