import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, IMAGE_ASPECT_RATIO } from "../../theme";
import { ScreenExitButton } from "../../components/ScreenExitButton";
import { WarmthBar, type WarmthLevel } from "../../components/WarmthBar";
import { ThoughtImageFrame } from "../../components/ThoughtImageFrame";
import { fetchThought, postReply, type ThoughtDetailResponse } from "../../lib/api";
import { useEngagementTracking } from "../../hooks/useEngagementTracking";

const REPLY_MIN_LENGTH = 50;
const REPLY_MAX_LENGTH = 300;

export default function ThoughtDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [data, setData] = useState<ThoughtDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const pulseOpacity = useSharedValue(0);

  const translateX = useSharedValue(0);
  const gestureStartX = useSharedValue(0);
  const lastPanelIndex = useRef(0);
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);

  const {
    recordViewP1,
    recordSwipeP2,
    recordSwipeP3,
    recordTypeStart,
    recordReplySent,
  } = useEngagementTracking({
    thoughtId: id ?? "",
    visible: true,
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetchThought(id)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const applyPanel = useCallback(
    (index: number) => {
      lastPanelIndex.current = index;
      setCurrentPanelIndex(index);
    },
    []
  );

  const handleSwipeToPanel = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === 0 && toIndex === 1) {
        recordSwipeP2();
      } else if (fromIndex === 1 && toIndex === 2) {
        recordSwipeP3();
      }
    },
    [recordSwipeP2, recordSwipeP3]
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const snapToPanel = useCallback(
    (targetIndex: number) => {
      const target = -targetIndex * screenWidth;
      translateX.value = withTiming(target, { duration: 280 });
      const fromIndex = lastPanelIndex.current;
      handleSwipeToPanel(fromIndex, targetIndex);
      applyPanel(targetIndex);
    },
    [screenWidth, translateX, handleSwipeToPanel, applyPanel]
  );

  const panGesture = Gesture.Pan()
    .onStart(() => {
      gestureStartX.value = translateX.value;
    })
    .onUpdate((e) => {
      const min = -2 * screenWidth;
      const max = 0;
      const next = Math.min(max, Math.max(min, gestureStartX.value + e.translationX));
      translateX.value = next;
    })
    .onEnd((e) => {
      const current = translateX.value;
      const velocity = e.velocityX;
      let targetIndex = Math.round(-current / screenWidth);
      if (targetIndex < 0) targetIndex = 0;
      if (targetIndex > 2) targetIndex = 2;
      if (targetIndex === 0 && current > -screenWidth * 0.2 && (velocity > 80 || current > 20)) {
        runOnJS(handleBack)();
        return;
      }
      runOnJS(snapToPanel)(targetIndex);
    });

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const panelWidth = screenWidth;
  const imageHeight = panelWidth / IMAGE_ASPECT_RATIO;
  const fullPanelHeight = screenHeight - insets.top - insets.bottom;

  const handleSendReply = useCallback(async () => {
    const text = replyText.trim();
    if (
      !text ||
      text.length < REPLY_MIN_LENGTH ||
      !id ||
      !data?.panel_3.can_reply ||
      sending
    ) {
      return;
    }
    setSending(true);
    try {
      await postReply(id, text);
      recordReplySent({ reply_length_chars: text.length });
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
      pulseOpacity.value = withSequence(
        withTiming(0.25, { duration: 100 }),
        withTiming(0, { duration: 300 })
      );
      setReplyText("");
      setIsTyping(false);
      translateX.value = withTiming(0, { duration: 220 });
      applyPanel(0);
      const fresh = await fetchThought(id);
      setData(fresh);
    } catch {
      setSending(false);
    } finally {
      setSending(false);
    }
  }, [id, replyText, data?.panel_3.can_reply, sending, recordReplySent, translateX, applyPanel]);

  const onReplyFocus = useCallback(() => {
    setIsTyping(true);
    recordTypeStart();
  }, [recordTypeStart]);

  const onReplyBlur = useCallback(() => {
    setIsTyping(false);
  }, []);

  useEffect(() => {
    if (!data || loading) return;
    const t = setTimeout(() => recordViewP1(), 1000);
    return () => clearTimeout(t);
  }, [data, loading, recordViewP1]);

  if (loading || !data) {
    return (
      <View style={[styles.loadingRoot, { paddingTop: insets.top }]}>
        <ScreenExitButton
          onPress={() => router.back()}
          style={[styles.exitButton, { top: insets.top + 12 }]}
          variant="dark"
        />
        <View style={[styles.skeletonImage, { width: panelWidth, height: imageHeight }]} />
        <ActivityIndicator size="small" color={colors.TYPE_MUTED} style={styles.loader} />
      </View>
    );
  }

  const p1 = data.panel_1;
  const p2 = data.panel_2;
  const p3 = data.panel_3;
  const warmthForBar: WarmthLevel = isTyping ? "full" : p1.warmth_level;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.row, { width: panelWidth * 3 }, animatedRowStyle]}>
          {/* Panel 1 */}
          <View style={[styles.panel, { width: panelWidth, minHeight: fullPanelHeight }]}>
            <View style={styles.panel1Inner}>
              <WarmthBar warmthLevel={warmthForBar} height={imageHeight + 56} />
              <ThoughtImageFrame
                imageUrl={p1.photo_url ?? p1.image_url}
                aspectRatio={IMAGE_ASPECT_RATIO}
                borderRadius={0}
                style={{ width: panelWidth - spacing.warmthBarWidth, height: imageHeight }}
              >
                <Text style={styles.sentenceP1} numberOfLines={2}>
                  {p1.sentence}
                </Text>
                <View style={styles.dots}>
                  <View style={styles.dot} />
                  <View style={styles.dot} />
                  <View style={styles.dot} />
                </View>
              </ThoughtImageFrame>
            </View>
            <View style={styles.footerP1}>
              {p1.user?.photo_url ? (
                <Image source={{ uri: p1.user.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlc]} />
              )}
              <Text style={styles.nameP1}>{p1.user?.name ? p1.user.name.toUpperCase() : "—"}</Text>
            </View>
          </View>

          {/* Panel 2 */}
          <View style={[styles.panel, styles.panel2, { width: panelWidth, minHeight: fullPanelHeight }]}>
            <ScrollView
              contentContainerStyle={styles.panel2Content}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.panelLabel}>Context</Text>
              <Text style={styles.sentenceP2}>{p2.sentence}</Text>
              {p2.context ? (
                <Text style={styles.contextP2}>{p2.context}</Text>
              ) : (
                <Text style={styles.panelEmpty}>No context shared yet.</Text>
              )}
            </ScrollView>
          </View>

          {/* Panel 3 */}
          <View style={[styles.panel, styles.panel3, { width: panelWidth, minHeight: fullPanelHeight }]}>
            <ScrollView
              style={styles.repliesScroll}
              contentContainerStyle={styles.repliesContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.panelLabel}>Accepted replies</Text>
              {p3.accepted_replies.length === 0 ? (
                <Text style={styles.panelEmpty}>No accepted replies yet.</Text>
              ) : null}
              {p3.accepted_replies.map((r) => (
                <View key={r.id} style={styles.replyRow}>
                  {r.user?.photo_url ? (
                    <Image source={{ uri: r.user.photo_url }} style={styles.replyAvatar} />
                  ) : (
                    <View style={[styles.replyAvatar, styles.avatarPlc]} />
                  )}
                  <View style={styles.replyBody}>
                    <Text style={styles.replyName}>
                      {r.user?.name ? r.user.name.toUpperCase() : "—"}
                    </Text>
                    <Text style={styles.replyText}>{r.text}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            {p3.can_reply && (
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={styles.inputWrap}
              >
                <Text style={styles.replyLabel}>reply.</Text>
                <TextInput
                  style={styles.replyInput}
                  placeholder="what this thought surfaces in you..."
                  placeholderTextColor={colors.TYPE_MUTED}
                  value={replyText}
                  onChangeText={(t) => setReplyText(t.slice(0, REPLY_MAX_LENGTH))}
                  onFocus={onReplyFocus}
                  onBlur={onReplyBlur}
                  editable={!sending}
                  multiline={false}
                  maxLength={REPLY_MAX_LENGTH}
                />
                <Text style={styles.replyHint}>
                  Minimum {REPLY_MIN_LENGTH} characters. Space for up to {REPLY_MAX_LENGTH}.
                </Text>
                <TouchableOpacity
                  style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
                  onPress={handleSendReply}
                  disabled={replyText.trim().length < REPLY_MIN_LENGTH || sending}
                >
                  <Text style={styles.sendBtnText}>Send</Text>
                </TouchableOpacity>
              </KeyboardAvoidingView>
            )}
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Panel indicator — three dots, current slightly brighter */}
      <View style={[styles.indicator, { bottom: insets.bottom + 16 }]}>
        <View style={[styles.indicatorDot, currentPanelIndex === 0 && styles.indicatorDotActive]} />
        <View style={[styles.indicatorDot, currentPanelIndex === 1 && styles.indicatorDotActive]} />
        <View style={[styles.indicatorDot, currentPanelIndex === 2 && styles.indicatorDotActive]} />
      </View>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.pulseOverlay, pulseStyle]}
      />
      <ScreenExitButton
        onPress={() => router.back()}
        style={[styles.exitButton, { top: insets.top + 12 }]}
        variant="dark"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.PANEL_DARK,
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: colors.PANEL_DARK,
    justifyContent: "center",
    alignItems: "center",
  },
  skeletonImage: {
    backgroundColor: colors.PANEL_DARK,
    opacity: 0.6,
  },
  loader: { marginTop: 16 },
  exitButton: {
    position: "absolute",
    right: spacing.screenPadding,
    zIndex: 5,
  },
  row: {
    flexDirection: "row",
    minHeight: "100%",
  },
  panel: {
    flex: 1,
  },
  panel1Inner: {
    flexDirection: "row",
  },
  sentenceP1: {
    ...typography.thoughtDisplay,
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -0.15,
    color: colors.TYPE_WHITE,
    textShadowColor: "rgba(8,6,4,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  dots: {
    position: "absolute",
    right: 10,
    top: 18,
    opacity: 0.2,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.TYPE_WHITE,
    marginBottom: 2,
  },
  footerP1: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: colors.CARD_GROUND,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarPlc: {
    backgroundColor: colors.TYPE_MUTED,
  },
  nameP1: {
    fontFamily: typography.label.fontFamily,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.TYPE_DARK,
  },
  panel2: {
    backgroundColor: colors.PANEL_DARK,
    paddingHorizontal: 24,
  },
  panel2Content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 40,
  },
  panelLabel: {
    ...typography.label,
    fontSize: 8.5,
    color: "rgba(255,255,255,0.48)",
    marginBottom: 16,
  },
  sentenceP2: {
    ...typography.thoughtDisplay,
    fontSize: 15,
    lineHeight: 19,
    color: colors.TYPE_WHITE,
    marginBottom: 20,
  },
  contextP2: {
    ...typography.context,
    fontSize: 9.5,
    color: "rgba(255,255,255,0.7)",
  },
  panelEmpty: {
    ...typography.context,
    color: "rgba(255,255,255,0.4)",
  },
  panel3: {
    backgroundColor: colors.PANEL_DEEP,
    paddingHorizontal: 16,
  },
  repliesScroll: {
    flex: 1,
  },
  repliesContent: {
    paddingVertical: 24,
    paddingBottom: 120,
  },
  replyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  replyAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 10,
  },
  replyBody: { flex: 1 },
  replyName: {
    ...typography.metadata,
    fontSize: 7,
    color: colors.TYPE_MUTED,
    marginBottom: 4,
  },
  replyText: {
    ...typography.context,
    fontSize: 10,
    color: colors.TYPE_WHITE,
  },
  inputWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 0,
    paddingBottom: 24,
    backgroundColor: colors.PANEL_DEEP,
  },
  replyLabel: {
    ...typography.replyInput,
    color: colors.VERMILLION,
    marginBottom: 6,
  },
  replyInput: {
    ...typography.replyInput,
    color: colors.TYPE_WHITE,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.2)",
    paddingVertical: 8,
  },
  replyHint: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    marginTop: 8,
  },
  sendBtn: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 6,
    backgroundColor: colors.OLIVE,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: {
    ...typography.label,
    color: colors.TYPE_WHITE,
  },
  indicator: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  indicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  indicatorDotActive: {
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  pulseOverlay: {
    backgroundColor: colors.TYPE_WHITE,
  },
});
