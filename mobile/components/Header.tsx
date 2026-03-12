import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontFamily, spacing } from "../theme";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../assets/images/ohm-logo.png");

interface HeaderProps {
  /** When true, show orange notification dot and allow opening notification panel */
  hasNotifications?: boolean;
  onNotificationPress?: () => void;
  /** Ref for walkthrough spotlight on the Post button */
  postButtonRef?: React.RefObject<View | null>;
}

export function Header({ hasNotifications = false, onNotificationPress, postButtonRef }: HeaderProps) {
  const router = useRouter();
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
      {/* Right: post button */}
      <View style={[styles.side, styles.sideRight]}>
        <View ref={postButtonRef} collapsable={false}>
          <TouchableOpacity
            style={styles.compose}
            onPress={() => router.push("/post")}
            accessibilityLabel="Post a thought"
          >
            <Text style={styles.composeText}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  sideRight: {
    alignItems: "flex-end",
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
  },
  notificationDotInactive: {
    backgroundColor: colors.CARD_GROUND,
  },
  notificationInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.TYPE_WHITE,
  },
  compose: {
    backgroundColor: colors.VERMILLION,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  composeText: {
    fontFamily: fontFamily.comico,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.TYPE_WHITE,
  },
});
