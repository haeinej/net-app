import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontFamily } from "../theme";
import { spacing } from "../theme/spacing";
import { BrandLockup } from "./BrandLockup";

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
      <BrandLockup size="sm" />
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
