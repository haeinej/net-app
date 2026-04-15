import { useRef, useState, useCallback } from "react";
import { View, StyleSheet, Dimensions, LayoutRectangle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { GridCard } from "./GridCard";
import type { GridItem } from "./PuzzleGrid";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const SPRING = { damping: 22, stiffness: 260, mass: 0.8 };

interface HeroState {
  item: GridItem;
  rect: LayoutRectangle;
}

/**
 * Hero transition overlay for gallery → full-screen.
 *
 * Per emil-design-eng: don't use framework shared element transitions (fragile).
 * Instead, measure the source element, render a clone at that position, then
 * spring-animate to full screen. This is what Instagram, Pinterest, and Cosmos do.
 *
 * The animation is 300ms ease-out cubic feel achieved via spring (not duration).
 */
export function useHeroTransition() {
  const [hero, setHero] = useState<HeroState | null>(null);
  const router = useRouter();

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const opacity = useSharedValue(0);
  const borderRadius = useSharedValue(12);

  const startTransition = useCallback((item: GridItem, rect: LayoutRectangle) => {
    // Set initial position (where the grid card is)
    x.value = rect.x;
    y.value = rect.y;
    w.value = rect.width;
    h.value = rect.height;
    opacity.value = 1;
    borderRadius.value = 12;

    setHero({ item, rect });

    // Animate to full screen
    x.value = withSpring(0, SPRING);
    y.value = withSpring(0, SPRING);
    w.value = withSpring(SCREEN_W, SPRING);
    h.value = withSpring(SCREEN_H, SPRING);
    borderRadius.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });

    // Navigate after the spring settles (~300ms)
    setTimeout(() => {
      opacity.value = withTiming(0, { duration: 100 });
      router.push(`/thought/${item.id}`);
      setTimeout(() => setHero(null), 150);
    }, 280);
  }, [router]);

  const animatedStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
    opacity: opacity.value,
    borderRadius: borderRadius.value,
    overflow: "hidden" as const,
    zIndex: 999,
  }));

  const HeroOverlay = hero ? (
    <Animated.View style={animatedStyle} pointerEvents="none">
      <View style={styles.heroCard}>
        <GridCard
          sentence={hero.item.sentence}
          keywords={hero.item.keywords}
          background={hero.item.background}
          authorName={hero.item.authorName}
          showAuthor={false}
          index={0}
        />
      </View>
    </Animated.View>
  ) : null;

  return { startTransition, HeroOverlay };
}

const styles = StyleSheet.create({
  heroCard: {
    flex: 1,
  },
});
