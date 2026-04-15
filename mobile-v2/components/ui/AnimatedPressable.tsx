import { Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { springs, motion } from "../../theme";

const AP = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  activeScale?: number;
}

/**
 * Drop-in Pressable with spring press feedback.
 * Press-in: STIFF (instant, switch-like)
 * Release: BOUNCY (visible overshoot, alive)
 *
 * Per emil-design-eng: "Every pressable element gets scale on press. No exceptions."
 */
export function AnimatedPressable({
  children,
  style,
  activeScale = motion.buttonActiveScale,
  disabled,
  onPress,
  ...rest
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AP
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(activeScale, springs.stiff);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springs.bouncy);
      }}
      style={[animatedStyle, style, disabled ? { opacity: 0.4 } : undefined]}
      {...rest}
    >
      {children}
    </AP>
  );
}
