import { View, StyleSheet } from "react-native";

interface PanelIndicatorProps {
  currentIndex: number;
  count?: number;
}

export function PanelIndicator({ currentIndex, count = 3 }: PanelIndicatorProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[styles.dot, i === currentIndex && styles.dotActive]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dotActive: {
    backgroundColor: "rgba(255,255,255,0.55)",
  },
});
