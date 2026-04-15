import { useRef } from "react";
import { Dimensions, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Platform } from "react-native";

const Haptics = {
  impactAsync: async (style?: string) => {
    if (Platform.OS === "web") return;
    const h = await import("expo-haptics");
    h.impactAsync(style as any);
  },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
};

// ohm-motion spring configs — physical, not canned
const SPRING_SNAPPY = { damping: 20, stiffness: 300, mass: 0.8 };
const SPRING_BOUNCY = { damping: 12, stiffness: 200, mass: 0.6 };

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;
const VELOCITY_THRESHOLD = 500;

interface CardGesturesProps {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onLongPress?: () => void;
  enabled?: boolean;
}

export function CardGestures({
  children,
  onSwipeRight,
  onSwipeLeft,
  onLongPress,
  enabled = true,
}: CardGesturesProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const cardOpacity = useSharedValue(1);

  // Hermes-safe stable refs for runOnJS
  const swipeRightRef = useRef(onSwipeRight);
  swipeRightRef.current = onSwipeRight;
  const swipeLeftRef = useRef(onSwipeLeft);
  swipeLeftRef.current = onSwipeLeft;
  const longPressRef = useRef(onLongPress);
  longPressRef.current = onLongPress;

  const resetTransform = () => {
    translateX.value = 0;
    translateY.value = 0;
    cardScale.value = 1;
    cardOpacity.value = 1;
  };

  const handleSwipeRight = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeRightRef.current?.();
    resetTransform();
  };

  const handleSwipeLeft = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeLeftRef.current?.();
    resetTransform();
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    longPressRef.current?.();
  };

  const pan = Gesture.Pan()
    .enabled(enabled)
    .onStart(() => {
      // Subtle press-in: card breathes on touch (metaball feel)
      cardScale.value = withSpring(0.98, SPRING_SNAPPY);
    })
    .onUpdate((e: { translationX: number; translationY: number }) => {
      // 1:1 tracking — finger moves, card moves
      translateX.value = e.translationX;
      // Damped vertical — resist vertical movement like rubber
      translateY.value = e.translationY * 0.25;
      // Scale couples to distance: further from center = slightly smaller
      const dist = Math.abs(e.translationX) / SCREEN_WIDTH;
      cardScale.value = interpolate(dist, [0, 0.5], [0.98, 0.93], Extrapolation.CLAMP);
    })
    .onEnd((e: { translationX: number; translationY: number; velocityX: number; velocityY: number }) => {
      const shouldSwipeRight =
        e.translationX > SWIPE_THRESHOLD || (e.translationX > 0 && e.velocityX > VELOCITY_THRESHOLD);
      const shouldSwipeLeft =
        e.translationX < -SWIPE_THRESHOLD || (e.translationX < 0 && e.velocityX < -VELOCITY_THRESHOLD);

      if (shouldSwipeRight) {
        // Exit with momentum carry — the card continues its velocity
        translateX.value = withSpring(SCREEN_WIDTH * 1.3, {
          ...SPRING_SNAPPY,
          velocity: e.velocityX,
        });
        cardOpacity.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
        runOnJS(handleSwipeRight)();
      } else if (shouldSwipeLeft) {
        translateX.value = withSpring(-SCREEN_WIDTH * 1.3, {
          ...SPRING_SNAPPY,
          velocity: e.velocityX,
        });
        cardOpacity.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
        runOnJS(handleSwipeLeft)();
      } else {
        // Snap back with bouncy spring — visible overshoot, organic settle
        translateX.value = withSpring(0, SPRING_BOUNCY);
        translateY.value = withSpring(0, SPRING_BOUNCY);
        cardScale.value = withSpring(1, SPRING_BOUNCY);
      }
    });

  const longPress = Gesture.LongPress()
    .enabled(enabled)
    .minDuration(400)
    .onStart(() => {
      // Scale breathing: press in then pulse on long-press recognition
      cardScale.value = withSequence(
        withSpring(0.96, { damping: 15, stiffness: 400 }),
        withSpring(1, SPRING_BOUNCY)
      );
      runOnJS(handleLongPress)();
    });

  const gesture = Gesture.Race(pan, longPress);

  const animatedStyle = useAnimatedStyle(() => {
    // Rotation coupled to horizontal movement (like holding a physical card)
    const rotation = interpolate(
      translateX.value,
      [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
      [-8, 0, 8],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation}deg` },
        { scale: cardScale.value },
      ],
      opacity: cardOpacity.value,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.container, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
