import { Pressable, StyleSheet, Text, ViewStyle, TextStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors, typography, spacing, springs, motion } from "../../theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = "filled" | "outlined" | "vermillion";

interface PillButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
}

export function PillButton({
  label,
  onPress,
  variant = "filled",
  disabled = false,
  style,
}: PillButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const variantStyle = variantStyles[variant];

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(motion.buttonActiveScale, springs.stiff);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springs.bouncy);
      }}
      style={[styles.pill, variantStyle.container, animatedStyle, disabled && styles.disabled, style]}
    >
      <Text style={[typography.pillButton, variantStyle.text]}>{label}</Text>
    </AnimatedPressable>
  );
}

const variantStyles = {
  filled: {
    container: {
      backgroundColor: colors.TYPE_PRIMARY,
    } as ViewStyle,
    text: {
      color: colors.BG,
    } as TextStyle,
  },
  outlined: {
    container: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.TYPE_MUTED,
    } as ViewStyle,
    text: {
      color: colors.TYPE_PRIMARY,
    } as TextStyle,
  },
  vermillion: {
    container: {
      backgroundColor: colors.VERMILLION,
    } as ViewStyle,
    text: {
      color: "#FFFFFF",
    } as TextStyle,
  },
};

const styles = StyleSheet.create({
  pill: {
    minHeight: spacing.pillButtonHeight,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: spacing.pillButtonHeight / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.4,
  },
});
