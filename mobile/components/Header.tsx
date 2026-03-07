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
      <View style={styles.left}>
        {hasNotifications ? (
          <TouchableOpacity
            style={styles.notificationDot}
            onPress={onNotificationPress}
            accessibilityLabel="Open notifications"
          />
        ) : null}
      </View>
      <Text style={styles.logo}>
        net<Text style={styles.logoPeriod}>.</Text>
      </Text>
      <TouchableOpacity
        style={styles.compose}
        onPress={() => router.push("/post")}
        accessibilityLabel="Post a thought"
      >
        <Text style={styles.plus}>+</Text>
      </TouchableOpacity>
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
  left: {
    width: spacing.notificationDotSize + 8,
    alignItems: "flex-start",
  },
  notificationDot: {
    width: spacing.notificationDotSize,
    height: spacing.notificationDotSize,
    borderRadius: spacing.notificationDotSize / 2,
    backgroundColor: colors.ACCENT_ORANGE,
  },
  logo: {
    ...typography.logo,
    fontFamily: fontFamily.generalSansBold,
    color: colors.TYPE_DARK,
    textTransform: "lowercase",
  },
  logoPeriod: {
    color: colors.ACCENT_ORANGE,
  },
  compose: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  plus: {
    fontSize: 22,
    fontWeight: "300",
    color: colors.TYPE_DARK,
  },
});
