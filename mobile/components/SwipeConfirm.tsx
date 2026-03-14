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
import { colors, typography } from "../theme";

const KNOB_SIZE = 42;
const TRACK_HEIGHT = 60;

interface SwipeConfirmProps {
  label: string;
  hint?: string;
  completionLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  onComplete: () => void | Promise<void>;
  style?: StyleProp<ViewStyle>;
}

export function SwipeConfirm({
  label,
  hint,
  completionLabel = "Slide",
  disabled = false,
  loading = false,
  onComplete,
  style,
}: SwipeConfirmProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  const [completing, setCompleting] = useState(false);
  const maxOffset = Math.max(0, trackWidth - KNOB_SIZE - 8);

  useEffect(() => {
    if (disabled || maxOffset === 0) {
      translateX.setValue(0);
    }
  }, [disabled, maxOffset, translateX]);

  const resetKnob = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 6,
      speed: 20,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !disabled && !loading && !completing && Math.abs(gestureState.dx) > 4,
        onPanResponderMove: (_, gestureState) => {
          const nextX = Math.min(Math.max(0, gestureState.dx), maxOffset);
          translateX.setValue(nextX);
        },
        onPanResponderRelease: async (_, gestureState) => {
          if (disabled || loading || completing) {
            resetKnob();
            return;
          }
          const shouldComplete = gestureState.dx >= maxOffset * 0.78;
          if (!shouldComplete) {
            resetKnob();
            return;
          }
          setCompleting(true);
          Animated.timing(translateX, {
            toValue: maxOffset,
            duration: 120,
            useNativeDriver: true,
          }).start(async () => {
            try {
              await onComplete();
            } finally {
              setCompleting(false);
              resetKnob();
            }
          });
        },
        onPanResponderTerminate: resetKnob,
      }),
    [completing, disabled, loading, maxOffset, onComplete, translateX]
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const inFlight = loading || completing;

  return (
    <View
      style={[
        styles.wrapper,
        disabled && styles.wrapperDisabled,
        style,
      ]}
      onLayout={handleLayout}
    >
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={styles.track}>
        <Text style={styles.trackLabel}>
          {inFlight ? "..." : completionLabel}
        </Text>
        <Animated.View
          style={[
            styles.knob,
            { transform: [{ translateX }] },
          ]}
          {...panResponder.panHandlers}
        >
          <Text style={styles.knobText}>→</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: "rgba(235, 65, 1, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(235, 65, 1, 0.16)",
  },
  wrapperDisabled: {
    opacity: 0.55,
  },
  copy: {
    marginBottom: 10,
    paddingRight: 10,
  },
  label: {
    ...typography.replyInput,
    fontSize: 16,
    lineHeight: 21,
    color: colors.TYPE_DARK,
  },
  hint: {
    ...typography.context,
    fontSize: 14,
    lineHeight: 18,
    color: colors.TYPE_MUTED,
    marginTop: 4,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: "rgba(235, 65, 1, 0.12)",
    justifyContent: "center",
    overflow: "hidden",
  },
  trackLabel: {
    ...typography.label,
    fontSize: 11,
    color: colors.VERMILLION,
    textAlign: "center",
  },
  knob: {
    position: "absolute",
    left: 4,
    top: 6,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: colors.VERMILLION,
    alignItems: "center",
    justifyContent: "center",
  },
  knobText: {
    ...typography.label,
    fontSize: 18,
    color: colors.TYPE_WHITE,
    letterSpacing: 0,
  },
});
