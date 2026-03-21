import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { colors, typography } from "../theme";

const CARD_HEIGHT = 52;

interface SwipeSendHintProps {
  label: string;
  hint?: string;
  progress: SharedValue<number>;
  disabled?: boolean;
  loading?: boolean;
  darkSurface?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SwipeSendHint({
  label,
  hint,
  progress,
  disabled = false,
  loading = false,
  darkSurface = false,
  style,
}: SwipeSendHintProps) {
  const shellStyle = useAnimatedStyle(() => {
    const clamped = Math.max(0, Math.min(1, progress.value));
    return {
      backgroundColor: interpolateColor(
        clamped,
        [0, 1],
        darkSurface
          ? ["rgba(245, 240, 234, 0.06)", "rgba(235, 65, 1, 0.18)"]
          : ["rgba(235, 65, 1, 0.04)", "rgba(235, 65, 1, 0.14)"]
      ),
      borderColor: interpolateColor(
        clamped,
        [0, 1],
        darkSurface
          ? ["rgba(245, 240, 234, 0.12)", "rgba(245, 240, 234, 0.26)"]
          : ["rgba(235, 65, 1, 0.12)", "rgba(235, 65, 1, 0.22)"]
      ),
    };
  });

  const actionWrapStyle = useAnimatedStyle(() => {
    const clamped = Math.max(0, Math.min(1, progress.value));
    return {
      backgroundColor: interpolateColor(
        clamped,
        [0, 1],
        darkSurface
          ? ["rgba(245, 240, 234, 0.08)", "rgba(245, 240, 234, 0.18)"]
          : ["rgba(235, 65, 1, 0.08)", "rgba(235, 65, 1, 0.22)"]
      ),
      borderColor: interpolateColor(
        clamped,
        [0, 1],
        darkSurface
          ? ["rgba(245, 240, 234, 0.14)", "rgba(245, 240, 234, 0.32)"]
          : ["rgba(235, 65, 1, 0.14)", "rgba(235, 65, 1, 0.28)"]
      ),
      transform: [
        { translateX: interpolate(clamped, [0, 1], [0, -8], Extrapolation.CLAMP) },
        { scale: interpolate(clamped, [0, 1], [1, 1.04], Extrapolation.CLAMP) },
      ],
    };
  });

  const arrowStyle = useAnimatedStyle(() => {
    const clamped = Math.max(0, Math.min(1, progress.value));
    return {
      opacity: interpolate(clamped, [0, 1], [0.56, 1], Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(clamped, [0, 1], [0, -3], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.card, shellStyle, disabled && styles.cardDisabled, style]}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardLeft}>
          <Text style={[styles.label, darkSurface && styles.labelDark]}>{label}</Text>
          {hint ? <Text style={[styles.hint, darkSurface && styles.hintDark]}>{hint}</Text> : null}
        </View>
        <Animated.View style={[styles.cardRight, actionWrapStyle]}>
          <Text
            style={[
              styles.actionLabel,
              darkSurface && styles.actionLabelDark,
              loading && styles.actionLabelSending,
            ]}
          >
            {loading ? "Sending..." : "Keep left"}
          </Text>
          <Animated.Text style={[styles.arrow, arrowStyle]}>←</Animated.Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: CARD_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
  },
  cardDisabled: {
    opacity: 0.45,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  cardLeft: {
    flex: 1,
  },
  label: {
    ...typography.replyInput,
    fontSize: 14,
    lineHeight: 18,
    color: colors.TYPE_DARK,
  },
  labelDark: {
    color: colors.TYPE_WHITE,
  },
  hint: {
    ...typography.context,
    fontSize: 11,
    lineHeight: 14,
    color: colors.TYPE_MUTED,
    marginTop: 1,
  },
  hintDark: {
    color: "rgba(245,240,234,0.58)",
  },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 12,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionLabel: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.VERMILLION,
  },
  actionLabelDark: {
    color: colors.WARM_GROUND,
  },
  actionLabelSending: {
    color: colors.TYPE_MUTED,
  },
  arrow: {
    fontSize: 16,
    color: colors.VERMILLION,
    marginTop: -1,
  },
});
