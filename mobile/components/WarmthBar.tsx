import { View, StyleSheet } from "react-native";
import { colors, spacing } from "../theme";

interface WarmthBarProps {
  /** Card height in px; bar spans full card height */
  height: number;
  color?: string;
}

export function WarmthBar({ height, color = colors.VERMILLION }: WarmthBarProps) {
  return (
    <View
      style={[
        styles.bar,
        { height },
        { backgroundColor: color },
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
