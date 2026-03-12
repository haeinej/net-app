import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { colors, fontFamily } from "../theme";

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
  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      activeOpacity={0.8}
      disabled={disabled}
      hitSlop={10}
      onPress={onPress}
      style={[
        styles.button,
        variant === "dark" ? styles.buttonDark : styles.buttonLight,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Text style={[styles.label, variant === "dark" ? styles.labelDark : styles.labelLight]}>
        X
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 4,
    paddingVertical: 4,
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
    fontSize: 11,
    letterSpacing: 0.8,
  },
  labelLight: {
    color: colors.TYPE_DARK,
  },
  labelDark: {
    color: colors.TYPE_WHITE,
  },
});
