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
  Alert,
  type GestureResponderEvent,
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
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, typography, IMAGE_ASPECT_RATIO, fontFamily, shadows, glass } from "../../theme";
import { ScreenExitButton } from "../../components/ScreenExitButton";
import { WarmthBar, type WarmthLevel } from "../../components/WarmthBar";
import { ThoughtImageFrame } from "../../components/ThoughtImageFrame";
import {
  deleteReply,
  deleteThought,
  editThought,
  fetchThought,
  postReply,
  type ThoughtDetailResponse,
} from "../../lib/api";
import { useEngagementTracking } from "../../hooks/useEngagementTracking";
import { pickPrompt, REPLY_PROMPTS, REPLY_SAFETY_TEXT } from "../../constants/prompts";

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
  const [replyPlaceholder] = useState(() => pickPrompt(REPLY_PROMPTS));
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

  const refreshThought = useCallback(async () => {
    if (!id) return;
    const fresh = await fetchThought(id);
    setData(fresh);
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
      await refreshThought();
    } catch {
      setSending(false);
    } finally {
      setSending(false);
    }
  }, [id, replyText, data?.panel_3.can_reply, sending, recordReplySent, translateX, applyPanel, refreshThought]);

  const handleDeleteReply = useCallback(
    (replyId: string) => {
      Alert.alert("Delete reply", "Remove this reply from your thought?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteReply(replyId);
              await refreshThought();
            } catch {}
          },
        },
      ]);
    },
    [refreshThought]
  );

  const handleOwnerCardMenu = useCallback(() => {
    if (!id || !data?.panel_3.viewer_is_author) return;

    Alert.alert("Thought", undefined, [
      {
        text: "Edit",
        onPress: () => {
          Alert.prompt(
            "Edit thought",
            "Update your sentence:",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Save",
                onPress: async (newSentence?: string) => {
                  const nextSentence = newSentence?.trim();
                  if (!nextSentence) return;

                  try {
                    await editThought(id, { sentence: nextSentence });
                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            panel_1: { ...prev.panel_1, sentence: nextSentence },
                            panel_2: { ...prev.panel_2, sentence: nextSentence },
                          }
                        : prev
                    );
                  } catch {}
                },
              },
            ],
            "plain-text",
            data.panel_1.sentence
          );
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Alert.alert("Delete thought", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                try {
                  await deleteThought(id);
                  router.back();
                } catch {}
              },
            },
          ]);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [data, id, router]);

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
  const p1HasPhoto = Boolean(p1.photo_url ?? p1.image_url);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.row, { width: panelWidth * 3 }, animatedRowStyle]}>
          {/* Panel 1 */}
          <View style={[styles.panel, { width: panelWidth, minHeight: fullPanelHeight }]}>
            <View style={styles.panel1Inner}>
              <WarmthBar warmthLevel={warmthForBar} height={imageHeight + 56} />
              <View
                style={[
                  styles.panel1ImageWrap,
                  { width: panelWidth - spacing.warmthBarWidth, height: imageHeight },
                ]}
              >
                <ThoughtImageFrame
                  imageUrl={p1.photo_url ?? p1.image_url}
                  aspectRatio={IMAGE_ASPECT_RATIO}
                  borderRadius={0}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.panel1ImageOverlay} pointerEvents="none">
                  <Text
                    style={[styles.sentenceP1, !p1HasPhoto && styles.sentenceP1NoPhoto]}
                    numberOfLines={4}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {p1.sentence}
                  </Text>
                  <View style={[styles.dots, !p1HasPhoto && styles.dotsNoPhoto]}>
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.footerP1}>
              <TouchableOpacity
                style={styles.profileRowP1}
                onPress={() => {
                  if (p1.user?.id) {
                    router.push({ pathname: "/user/[id]", params: { id: p1.user.id } });
                  }
                }}
                disabled={!p1.user?.id}
                activeOpacity={0.7}
              >
                {p1.user?.photo_url ? (
                  <Image source={{ uri: p1.user.photo_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlc]} />
                )}
                <Text style={styles.nameP1}>{p1.user?.name ? p1.user.name.toUpperCase() : "—"}</Text>
              </TouchableOpacity>
              {p3.viewer_is_author ? (
                <TouchableOpacity
                  style={styles.ownerActionBtn}
                  onPress={handleOwnerCardMenu}
                  activeOpacity={0.7}
                >
                  <Text style={styles.ownerActionText}>•••</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Panel 2 */}
          <View style={[styles.panel, styles.panel2, { width: panelWidth, minHeight: fullPanelHeight }]}>
            <ScrollView
              contentContainerStyle={styles.panel2Content}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.panelLabel}>Context</Text>
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
              <Text style={styles.panelLabel}>Replies</Text>
              {p3.replies.length === 0 ? (
                <Text style={styles.panelEmpty}>No replies yet.</Text>
              ) : null}
              {p3.replies.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.replyRow}
                  onPress={() => {
                    if (r.user?.id) {
                      router.push({ pathname: "/user/[id]", params: { id: r.user.id } });
                    }
                  }}
                  disabled={!r.user?.id}
                  activeOpacity={0.7}
                >
                  {r.user?.photo_url ? (
                    <Image source={{ uri: r.user.photo_url }} style={styles.replyAvatar} />
                  ) : (
                    <View style={[styles.replyAvatar, styles.avatarPlc]} />
                  )}
                  <View style={styles.replyBody}>
                    <View style={styles.replyTopRow}>
                      <Text style={styles.replyName}>
                        {r.user?.name ? r.user.name.toUpperCase() : "—"}
                      </Text>
                      {p3.viewer_is_author ? (
                        <Text style={styles.replyStatus}>
                          {r.status === "accepted" ? "IN CHAT" : "PENDING"}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.replyText}>{r.text}</Text>
                  </View>
                  {r.can_delete ? (
                    <TouchableOpacity
                      style={styles.replyDeleteBtn}
                      onPress={(event: GestureResponderEvent) => {
                        event.stopPropagation();
                        handleDeleteReply(r.id);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.replyDeleteText}>Delete</Text>
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
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
                  placeholder={replyPlaceholder}
                  placeholderTextColor={colors.TYPE_MUTED}
                  value={replyText}
                  onChangeText={(t) => setReplyText(t.slice(0, REPLY_MAX_LENGTH))}
                  onFocus={onReplyFocus}
                  onBlur={onReplyBlur}
                  editable={!sending}
                  multiline={false}
                  maxLength={REPLY_MAX_LENGTH}
                />
                <Text style={styles.replySafety}>{REPLY_SAFETY_TEXT}</Text>
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
  panel1ImageWrap: {
    position: "relative",
    overflow: "hidden",
  },
  panel1ImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  sentenceP1: {
    fontFamily: fontFamily.sentientBold,
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 22,
    fontSize: 24,
    lineHeight: 27,
    letterSpacing: -0.35,
    color: colors.TYPE_WHITE,
  },
  sentenceP1NoPhoto: {
    color: colors.TYPE_DARK,
  },
  dotsNoPhoto: {
    opacity: 0.35,
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
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: colors.CARD_GROUND,
  },
  profileRowP1: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarPlc: {
    backgroundColor: colors.TYPE_MUTED,
    borderColor: "rgba(0,0,0,0.06)",
  },
  nameP1: {
    fontFamily: typography.label.fontFamily,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.TYPE_DARK,
    flex: 1,
  },
  ownerActionBtn: {
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    marginLeft: 8,
  },
  ownerActionText: {
    fontFamily: typography.metadata.fontFamily,
    fontSize: 11,
    lineHeight: 11,
    letterSpacing: 0.6,
    color: colors.TYPE_MUTED,
  },
  panel2: {
    backgroundColor: colors.PANEL_DARK,
    paddingHorizontal: 24,
    // Soft organic transition
    borderLeftWidth: 0.5,
    borderLeftColor: "rgba(255,255,255,0.08)",
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
  contextP2: {
    ...typography.context,
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(255,255,255,0.7)",
  },
  panelEmpty: {
    ...typography.context,
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  panel3: {
    backgroundColor: colors.PANEL_DEEP,
    paddingHorizontal: 16,
    borderLeftWidth: 0.5,
    borderLeftColor: "rgba(255,255,255,0.06)",
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
  replyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  replyName: {
    ...typography.metadata,
    fontSize: 8,
    color: colors.TYPE_MUTED,
    marginBottom: 4,
  },
  replyStatus: {
    ...typography.metadata,
    fontSize: 6.5,
    color: colors.OLIVE,
    letterSpacing: 0.7,
  },
  replyText: {
    ...typography.context,
    fontSize: 12,
    lineHeight: 16,
    color: colors.TYPE_WHITE,
  },
  replyDeleteBtn: {
    marginLeft: 10,
    paddingVertical: 2,
  },
  replyDeleteText: {
    ...typography.metadata,
    color: colors.VERMILLION,
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
  replySafety: {
    ...typography.metadata,
    color: "rgba(255,255,255,0.35)",
    marginTop: 8,
    fontStyle: "italic",
  },
  sendBtn: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: colors.OLIVE,
    ...shadows.raised,
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
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  indicatorDotActive: {
    backgroundColor: "rgba(255,255,255,0.60)",
    // Soft organic glow
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.20,
    shadowRadius: 3,
  },
  pulseOverlay: {
    backgroundColor: colors.TYPE_WHITE,
  },
});
