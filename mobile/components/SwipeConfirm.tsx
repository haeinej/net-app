import { useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  interpolateColor,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors, typography } from "../theme";

const CARD_HEIGHT = 52;
const SEND_THRESHOLD = 0.40;

/**
 * Threshold (px) the finger must move before the PanResponder claims the
 * gesture. Keeping this *higher* than the parent Gesture.Pan's activeOffsetX
 * (12 px) avoids stealing the parent's panel-navigation swipe.
 */
const CLAIM_THRESHOLD = 16;

interface SwipeConfirmProps {
  label: string;
  hint?: string;
  completionLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  onComplete: () => void | Promise<void>;
  style?: StyleProp<ViewStyle>;
  darkSurface?: boolean;
}

export function SwipeConfirm({
  label,
  hint,
  completionLabel = "Send",
  disabled = false,
  loading = false,
  onComplete,
  style,
  darkSurface = false,
}: SwipeConfirmProps) {
  const translateX = useSharedValue(0);
  const cardOpacity = useSharedValue(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [completing, setCompleting] = useState(false);
  const hasFiredHaptic = useRef(false);

  useEffect(() => {
    if (disabled) {
      translateX.value = 0;
      cardOpacity.value = 1;
    }
  }, [disabled]);

  const resetCard = () => {
    hasFiredHaptic.current = false;
    translateX.value = withSpring(0, { damping: 20, stiffness: 260, mass: 0.7 });
  };

  const flyOut = (cb: () => void) => {
    translateX.value = withSpring(containerWidth * 1.2, {
      damping: 20, stiffness: 300, mass: 0.8,
      velocity: 800,
    });
    cardOpacity.value = withTiming(0, { duration: 180 });
    setTimeout(cb, 200);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) => {
          if (disabled || loading || completing) return false;
          return gs.dx > CLAIM_THRESHOLD && Math.abs(gs.dy) < gs.dx * 0.5;
        },
        onMoveShouldSetPanResponderCapture: () => false,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          hasFiredHaptic.current = false;
        },
        onPanResponderMove: (_, gs) => {
          const dx = gs.dx;
          if (dx >= 0) {
            translateX.value = dx;
          } else {
            const resist = 12 * (1 - Math.exp((-0.25 * Math.abs(dx)) / 12));
            translateX.value = -resist;
          }

          if (containerWidth > 0 && dx >= containerWidth * SEND_THRESHOLD && !hasFiredHaptic.current) {
            hasFiredHaptic.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          if (containerWidth > 0 && dx < containerWidth * SEND_THRESHOLD) {
            hasFiredHaptic.current = false;
          }
        },
        onPanResponderRelease: async (_, gs) => {
          if (disabled || loading || completing) {
            resetCard();
            return;
          }
          const pastThreshold = containerWidth > 0 && gs.dx >= containerWidth * SEND_THRESHOLD;
          const flickedRight = gs.vx > 0.8;

          if (pastThreshold || flickedRight) {
            setCompleting(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            flyOut(async () => {
              try {
                await onComplete();
              } finally {
                setCompleting(false);
                translateX.value = 0;
                cardOpacity.value = 1;
                hasFiredHaptic.current = false;
              }
            });
          } else {
            resetCard();
          }
        },
        onPanResponderTerminate: () => resetCard(),
      }),
    [completing, disabled, loading, containerWidth, onComplete]
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  const inFlight = loading || completing;
  const thresholdPx = containerWidth * SEND_THRESHOLD || 1;

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [0, containerWidth || 1],
      [0, 4],
      Extrapolation.CLAMP
    );

    const bgColor = interpolateColor(
      translateX.value,
      [0, thresholdPx],
      darkSurface
        ? ["rgba(235, 65, 1, 0.10)", "rgba(235, 65, 1, 0.28)"]
        : ["rgba(235, 65, 1, 0.06)", "rgba(235, 65, 1, 0.18)"]
    );

    return {
      transform: [
        { translateX: translateX.value },
        { rotate: `${rotation}deg` },
      ],
      opacity: cardOpacity.value,
      backgroundColor: bgColor,
    };
  });

  return (
    <View style={[styles.wrapper, style]} onLayout={handleLayout}>
      <View style={styles.revealLayer}>
        <Text style={styles.revealText}>
          {inFlight ? "sending..." : "→ send"}
        </Text>
      </View>

      <Animated.View
        style={[
          styles.card,
          darkSurface && styles.cardDark,
          disabled && styles.cardDisabled,
          cardAnimatedStyle,
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardLeft}>
            <Text
              style={[styles.label, darkSurface && styles.labelDark]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {hint ? (
              <Text style={styles.hint} numberOfLines={1}>
                {hint}
              </Text>
            ) : null}
          </View>
          <View style={styles.cardRight}>
            <Text
              style={[styles.actionLabel, inFlight && styles.actionLabelSending]}
              numberOfLines={1}
            >
              {inFlight ? "..." : completionLabel}
            </Text>
            <Text style={styles.arrow}>→</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: CARD_HEIGHT,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  revealLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(235, 65, 1, 0.14)",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  revealText: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.VERMILLION,
  },
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(235, 65, 1, 0.16)",
    justifyContent: "center",
  },
  cardDark: {
    borderColor: "rgba(235, 65, 1, 0.28)",
  },
  cardDisabled: {
    opacity: 0.45,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  cardLeft: {
    flex: 1,
    marginRight: 8,
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
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  actionLabel: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.VERMILLION,
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
