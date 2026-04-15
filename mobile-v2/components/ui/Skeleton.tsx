import { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors, durations } from "../../theme";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = "100%",
  height = 20,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    // Smooth breathing pulse (ohm-motion: not harsh blink)
    opacity.value = withRepeat(
      withTiming(0.7, { duration: durations.skeleton, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          backgroundColor: colors.SURFACE,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Full-screen skeleton card for the Explore deck */
export function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonContent}>
        <Skeleton width="80%" height={32} borderRadius={4} />
        <View style={{ height: 12 }} />
        <Skeleton width="60%" height={32} borderRadius={4} />
        <View style={{ height: 12 }} />
        <Skeleton width="40%" height={32} borderRadius={4} />
      </View>
      <View style={styles.skeletonAuthor}>
        <Skeleton width={16} height={16} borderRadius={8} />
        <Skeleton width={60} height={10} borderRadius={4} />
      </View>
    </View>
  );
}

/** Grid of skeleton cards for Friends/Profile */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.skeletonGridItem}>
          <Skeleton
            width="100%"
            height={i % 3 === 0 ? 180 : i % 3 === 1 ? 140 : 160}
            borderRadius={12}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonCard: {
    flex: 1,
    backgroundColor: colors.BG,
    justifyContent: "flex-start",
    paddingTop: 140,
    paddingHorizontal: 24,
  },
  skeletonContent: {
    flex: 1,
  },
  skeletonAuthor: {
    position: "absolute",
    bottom: 110,
    left: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    gap: 6,
  },
  skeletonGridItem: {
    width: "48%",
    marginBottom: 6,
  },
});
