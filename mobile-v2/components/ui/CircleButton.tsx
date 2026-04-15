import { Pressable, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors, spacing, springs, motion } from "../../theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface CircleButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  size?: number;
  style?: ViewStyle;
}

export function CircleButton({
  onPress,
  children,
  size = spacing.circleButtonSize,
  style,
}: CircleButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(motion.buttonActiveScale, springs.stiff);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springs.bouncy);
      }}
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
        animatedStyle,
        style,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.SURFACE_ALT,
    alignItems: "center",
    justifyContent: "center",
  },
});
