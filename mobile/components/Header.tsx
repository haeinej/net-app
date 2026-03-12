import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontFamily, typography } from "../theme";
import { spacing } from "../theme/spacing";

interface HeaderProps {
  /** When true, show orange notification dot and allow opening notification panel */
  hasNotifications?: boolean;
  onNotificationPress?: () => void;
}

export function Header({ hasNotifications = false, onNotificationPress }: HeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { paddingTop: insets.top + 8 }]}>
      {/* LEFT — Notification circle */}
      <View style={styles.side}>
        {hasNotifications ? (
          <TouchableOpacity
            style={styles.notificationDot}
            onPress={onNotificationPress}
            accessibilityLabel="Open notifications"
          />
        ) : (
          <View style={styles.notificationPlaceholder} />
        )}
      </View>

      {/* CENTRE — Logo */}
      <Text style={styles.logo}>
        ohm<Text style={styles.logoPeriod}>.</Text>
      </Text>

      {/* RIGHT — Compose (+) */}
      <View style={[styles.side, styles.sideRight]}>
        <TouchableOpacity
          style={styles.compose}
          onPress={() => router.push("/post")}
          accessibilityLabel="Post a thought"
        >
          <Text style={styles.composeIcon}>+</Text>
        </TouchableOpacity>
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
    paddingBottom: 8,
    minHeight: 44,
  },
  side: {
    width: 40,
    alignItems: "flex-start",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  notificationPlaceholder: {
    width: spacing.notificationDotSize,
    height: spacing.notificationDotSize,
  },
  logo: {
    ...typography.logo,
    fontFamily: fontFamily.comico,
    color: colors.TYPE_DARK,
    textTransform: "lowercase",
  },
  logoPeriod: {
    color: colors.VERMILLION,
  },
  notificationDot: {
    width: spacing.notificationDotSize,
    height: spacing.notificationDotSize,
    borderRadius: spacing.notificationDotSize / 2,
    backgroundColor: colors.VERMILLION,
  },
  compose: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  composeIcon: {
    fontSize: 22,
    fontWeight: "200",
    color: colors.TYPE_DARK,
    lineHeight: 24,
  },
});
