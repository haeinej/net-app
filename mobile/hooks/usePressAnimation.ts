import { useCallback } from "react";
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const SPRING_STIFF = { damping: 30, stiffness: 400, mass: 0.5 };
const SPRING_BOUNCY = { damping: 12, stiffness: 200, mass: 0.6 };

export function usePressAnimation(targetScale = 0.97) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = useCallback(() => {
    scale.value = withSpring(targetScale, SPRING_STIFF);
  }, [targetScale]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING_BOUNCY);
  }, []);

  return { animatedStyle, onPressIn, onPressOut };
}
