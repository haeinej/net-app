import { useRef } from "react";
import { Dimensions, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
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
import { springs, easings, durations, motion } from "../../theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
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
  const isActive = useSharedValue(false);

  // Hermes-safe stable refs for runOnJS
  const swipeRightRef = useRef(onSwipeRight);
  swipeRightRef.current = onSwipeRight;
  const swipeLeftRef = useRef(onSwipeLeft);
  swipeLeftRef.current = onSwipeLeft;
  const longPressRef = useRef(onLongPress);
  longPressRef.current = onLongPress;

  const handleSwipeRight = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeRightRef.current?.();
  };

  const handleSwipeLeft = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeLeftRef.current?.();
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    longPressRef.current?.();
  };

  const pan = Gesture.Pan()
    .enabled(enabled)
    .onStart(() => {
      isActive.value = true;
      cardScale.value = withSpring(motion.cardScaleOnPress, springs.snap);
    })
    .onUpdate((e: { translationX: number; translationY: number }) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.3; // damped vertical
    })
    .onEnd((e: { translationX: number; velocityX: number }) => {
      isActive.value = false;
      const shouldSwipeRight =
        e.translationX > SWIPE_THRESHOLD || e.velocityX > VELOCITY_THRESHOLD;
      const shouldSwipeLeft =
        e.translationX < -SWIPE_THRESHOLD || e.velocityX < -VELOCITY_THRESHOLD;

      if (shouldSwipeRight) {
        translateX.value = withTiming(SCREEN_WIDTH * 1.5, {
          duration: durations.slow,
        });
        runOnJS(handleSwipeRight)();
      } else if (shouldSwipeLeft) {
        translateX.value = withTiming(-SCREEN_WIDTH * 1.5, {
          duration: durations.slow,
        });
        runOnJS(handleSwipeLeft)();
      } else {
        // Snap back
        translateX.value = withSpring(0, springs.snap);
        translateY.value = withSpring(0, springs.snap);
      }
      cardScale.value = withSpring(1, springs.snap);
    });

  const longPress = Gesture.LongPress()
    .enabled(enabled)
    .minDuration(400)
    .onStart(() => {
      runOnJS(handleLongPress)();
    });

  const gesture = Gesture.Race(pan, longPress);

  const animatedStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      [-motion.cardRotationMax, 0, motion.cardRotationMax],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation}deg` },
        { scale: cardScale.value },
      ],
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
