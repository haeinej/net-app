import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { colors } from "../../theme";
import { AnimatedPressable as APressable } from "./AnimatedPressable";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../../assets/images/ohm-logo.png");

interface TopBarProps {
  hasNotification?: boolean;
  onNotificationPress?: () => void;
  variant?: "default" | "profile";
  onSharePress?: () => void;
  onMenuPress?: () => void;
}

function NotificationDot({
  active,
  onPress,
}: {
  active: boolean;
  onPress?: () => void;
}) {
  return (
    <APressable
      onPress={onPress}
      style={[styles.notifDot, active ? styles.notifDotActive : undefined]}
    >
      {active ? (
        <View style={styles.notifInner} />
      ) : (
        <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
          <Path
            d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"
            stroke={colors.TYPE_MUTED}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </Svg>
      )}
    </APressable>
  );
}

export function TopBar({
  hasNotification = false,
  onNotificationPress,
  variant = "default",
  onSharePress,
  onMenuPress,
}: TopBarProps) {
  if (variant === "profile") {
    return (
      <View style={styles.row}>
        <APressable onPress={onSharePress} hitSlop={12}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"
              stroke={colors.TYPE_MUTED}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </APressable>
        <View style={styles.spacer} />
        <APressable
          onPress={onMenuPress}
          style={styles.menuButton}
          hitSlop={12}
        >
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
            <Path
              d="M4 6h16M4 12h16M4 18h16"
              stroke={colors.TYPE_MUTED}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </Svg>
        </APressable>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <NotificationDot
        active={hasNotification}
        onPress={onNotificationPress}
      />
      <Image source={ohmLogo} style={styles.logo} contentFit="contain" />
      <View style={{ width: 20 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    height: 32,
  },
  notifDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.SURFACE,
    alignItems: "center",
    justifyContent: "center",
  },
  notifDotActive: {
    backgroundColor: colors.VERMILLION,
  },
  notifInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  logo: {
    width: 20,
    height: 20,
  },
  spacer: {
    flex: 1,
  },
  menuButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.SURFACE,
    alignItems: "center",
    justifyContent: "center",
  },
});
