import { View, StyleSheet } from "react-native";
import { colors, spacing } from "../theme";

export type WarmthLevel = "none" | "low" | "medium" | "full";

interface WarmthBarProps {
  warmthLevel: WarmthLevel;
  /** Card height in px; bar spans full card height */
  height: number;
}

const warmthColorMap: Record<WarmthLevel, string | null> = {
  none: null,
  low: "rgba(235,65,1,0.3)",
  medium: "rgba(235,65,1,0.6)",
  full: colors.VERMILLION,
};

export function WarmthBar({ warmthLevel, height }: WarmthBarProps) {
  const bg = warmthColorMap[warmthLevel];
  return (
    <View
      style={[
        styles.bar,
        { height },
        bg != null && { backgroundColor: bg },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    width: spacing.warmthBarWidth,
    borderTopLeftRadius: spacing.cardRadius,
    borderBottomLeftRadius: spacing.cardRadius,
  },
});
