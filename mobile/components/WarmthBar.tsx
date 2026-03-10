import { View, StyleSheet } from "react-native";
import { colors, spacing } from "../theme";

export type WarmthLevel = "none" | "low" | "medium" | "full";

interface WarmthBarProps {
  warmthLevel: WarmthLevel;
  /** Card height in px; bar spans full card height */
  height: number;
}

export function WarmthBar({ warmthLevel, height }: WarmthBarProps) {
  const opacity =
    warmthLevel === "none" ? 0 : warmthLevel === "low" ? 0.3 : warmthLevel === "medium" ? 0.6 : 1;
  return (
    <View
      style={[
        styles.bar,
        { height },
        opacity > 0 && { backgroundColor: colors.VERMILLION, opacity },
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
