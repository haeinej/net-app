import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { colors, fontFamily, typography } from "../theme";
import { spacing } from "../theme/spacing";

interface HeaderProps {
  /** When true, show orange notification dot and allow opening notification panel */
  hasNotifications?: boolean;
  onNotificationPress?: () => void;
}

export function Header({ hasNotifications = false, onNotificationPress }: HeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.row}>
      <Text style={styles.logo}>
        ohm<Text style={styles.logoPeriod}>.</Text>
      </Text>
      <View style={styles.right}>
        {hasNotifications ? (
          <TouchableOpacity
            style={styles.notificationDot}
            onPress={onNotificationPress}
            accessibilityLabel="Open notifications"
          >
            <View style={styles.notificationInner} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.compose}
          onPress={() => router.push("/post")}
          accessibilityLabel="Post a thought"
        >
          <Text style={styles.composeText}>Post</Text>
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
    paddingVertical: 12,
    minHeight: 44,
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
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notificationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.VERMILLION,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#FFFFFF",
  },
  compose: {
    backgroundColor: colors.PANEL_DEEP,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  composeText: {
    fontFamily: fontFamily.comico,
    fontSize: 6,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#FFFFFF",
  },
});
