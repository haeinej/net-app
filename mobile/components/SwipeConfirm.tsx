import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors, typography } from "../theme";

const CARD_HEIGHT = 52;
const SEND_THRESHOLD = 0.40; // 40% of container width to trigger send
const FLYOUT_DURATION = 180;

/**
 * Threshold (px) the finger must move before the PanResponder claims the
 * gesture. Keeping this *higher* than the parent Gesture.Pan's activeOffsetX
 * (12 px) avoids stealing the parent's panel-navigation swipe.  The user has
 * to start a deliberate horizontal drag on the SwipeConfirm card itself for
 * the send gesture to engage.
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
  /** When true, text colors adapt for a dark background (Panel 3). */
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
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const [completing, setCompleting] = useState(false);
  const hasFiredHaptic = useRef(false);

  useEffect(() => {
    if (disabled) {
      translateX.setValue(0);
      opacity.setValue(1);
    }
  }, [disabled, translateX, opacity]);

  const resetCard = () => {
    hasFiredHaptic.current = false;
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 260,
      mass: 0.7,
    }).start();
  };

  const flyOut = (cb: () => void) => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: containerWidth * 1.2,
        duration: FLYOUT_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: FLYOUT_DURATION,
        useNativeDriver: true,
      }),
    ]).start(cb);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) => {
          // Only claim rightward drags that exceed our threshold and are
          // primarily horizontal (prevent stealing vertical scroll).
          if (disabled || loading || completing) return false;
          return gs.dx > CLAIM_THRESHOLD && Math.abs(gs.dy) < gs.dx * 0.5;
        },
        // Prevent the parent RNGH Gesture.Pan from reclaiming mid-drag.
        onMoveShouldSetPanResponderCapture: () => false,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          hasFiredHaptic.current = false;
        },
        onPanResponderMove: (_, gs) => {
          const dx = gs.dx;
          if (dx >= 0) {
            translateX.setValue(dx);
          } else {
            // Rubber-band leftward
            const resist = 12 * (1 - Math.exp((-0.25 * Math.abs(dx)) / 12));
            translateX.setValue(-resist);
          }

          // Haptic when crossing threshold
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
                translateX.setValue(0);
                opacity.setValue(1);
                hasFiredHaptic.current = false;
              }
            });
          } else {
            resetCard();
          }
        },
        onPanResponderTerminate: () => resetCard(),
      }),
    [completing, disabled, loading, containerWidth, onComplete, translateX, opacity]
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  const inFlight = loading || completing;

  // Progress-based background tint
  const bgInterpolation = translateX.interpolate({
    inputRange: [0, containerWidth * SEND_THRESHOLD || 1],
    outputRange: darkSurface
      ? ["rgba(235, 65, 1, 0.10)", "rgba(235, 65, 1, 0.28)"]
      : ["rgba(235, 65, 1, 0.06)", "rgba(235, 65, 1, 0.18)"],
    extrapolate: "clamp",
  });

  // Slight rotation as card moves
  const rotate = translateX.interpolate({
    inputRange: [0, containerWidth || 1],
    outputRange: ["0deg", "4deg"],
    extrapolate: "clamp",
  });

  return (
    <View style={[styles.wrapper, style]} onLayout={handleLayout}>
      {/* Reveal layer behind the card */}
      <View style={styles.revealLayer}>
        <Text style={styles.revealText}>
          {inFlight ? "sending..." : "→ send"}
        </Text>
      </View>

      {/* Swipeable card */}
      <Animated.View
        style={[
          styles.card,
          darkSurface && styles.cardDark,
          disabled && styles.cardDisabled,
          {
            transform: [{ translateX }, { rotate }],
            opacity,
            backgroundColor: bgInterpolation,
          },
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

  // Reveal layer sits behind the card
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

  // The draggable card
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
