import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { colors, fontFamily } from "../theme";
import { usePressAnimation } from "../hooks/usePressAnimation";

type ScreenExitButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  variant?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function ScreenExitButton({
  onPress,
  disabled = false,
  variant = "light",
  style,
  accessibilityLabel = "Close screen",
}: ScreenExitButtonProps) {
  const { animatedStyle: pressStyle, onPressIn, onPressOut } = usePressAnimation();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={10}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View
        style={[
          styles.button,
          variant === "dark" ? styles.buttonDark : styles.buttonLight,
          disabled && styles.buttonDisabled,
          pressStyle,
          style,
        ]}
      >
        <Text style={[styles.label, variant === "dark" ? styles.labelDark : styles.labelLight]}>
          X
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 28,
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLight: {
    backgroundColor: "transparent",
  },
  buttonDark: {
    backgroundColor: "transparent",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  label: {
    fontFamily: fontFamily.comico,
    fontSize: 16.5,
    letterSpacing: 0.8,
  },
  labelLight: {
    color: colors.TYPE_DARK,
  },
  labelDark: {
    color: colors.TYPE_WHITE,
  },
});
