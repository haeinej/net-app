import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors, spacing, typography, fontFamily } from "../theme";
import {
  fetchCrossingDetail,
  postCrossingReply,
  type FeedItemCrossing,
  type CrossingDetailResponse,
} from "../lib/api";

const REPLY_MIN_LENGTH = 50;
const REPLY_MAX_LENGTH = 300;
const IMAGE_HEIGHT = 150;
const CARD_HEIGHT = spacing.compactCardHeight;
const FOOTER_HEIGHT = spacing.compactFooterHeight;
const EXPANDED_HEIGHT = 340;

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

interface CrossingCardProps {
  item: FeedItemCrossing;
  visible?: boolean;
}

export function CrossingCard({ item, visible = false }: CrossingCardProps) {
  const { width } = useWindowDimensions();
  const cardWidth = width - spacing.screenPadding * 2;

  const { crossing, participant_a, participant_b, warmth_level } = item;

  // Panel state
  const currentPanel = useSharedValue(0);
  const [displayPanel, setDisplayPanel] = useState(0);
  const panel2X = useSharedValue(cardWidth);
  const panel3X = useSharedValue(cardWidth);

  // Detail data (lazy loaded)
  const [detailData, setDetailData] = useState<CrossingDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const fetchedRef = useRef(false);

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [replyTarget, setReplyTarget] = useState<string>(participant_a.id);
  const pulseOpacity = useSharedValue(0);

  // Warmth escalation
  const effectiveWarmth = (() => {
    if (isTyping) return "full" as const;
    const levels: Array<typeof warmth_level> = ["none", "low", "medium", "full"];
    if (displayPanel >= 2) return "full" as const;
    if (displayPanel === 1) return "medium" as const;
    const baseIdx = levels.indexOf(warmth_level);
    return levels[Math.max(baseIdx, 1)];
  })();

  const cardHeightAnim = useSharedValue<number>(CARD_HEIGHT);

  // Lazy fetch
  const loadDetail = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setDetailLoading(true);
    try {
      const data = await fetchCrossingDetail(crossing.id);
      setDetailData(data);
    } catch {
      fetchedRef.current = false;
    } finally {
      setDetailLoading(false);
    }
  }, [crossing.id]);

  const snapTo = useCallback(
    (target: number, from: number) => {
      const duration = 250;
      panel2X.value = withTiming(target >= 1 ? 0 : cardWidth, { duration });
      panel3X.value = withTiming(target >= 2 ? 0 : cardWidth, { duration });
      currentPanel.value = target;
      setDisplayPanel(target);
      if (from === 0 && target === 1) loadDetail();
    },
    [cardWidth, panel2X, panel3X, currentPanel, loadDetail]
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      "worklet";
      const ci = currentPanel.value;
      const tx = e.translationX;
      if (ci === 0) {
        panel2X.value = Math.max(0, Math.min(cardWidth, cardWidth + tx));
      } else if (ci === 1) {
        if (tx < 0) {
          panel3X.value = Math.max(0, Math.min(cardWidth, cardWidth + tx));
        } else {
          panel2X.value = Math.max(0, Math.min(cardWidth, tx));
        }
      } else if (ci === 2) {
        if (tx > 0) {
          panel3X.value = Math.max(0, Math.min(cardWidth, tx));
        }
      }
    })
    .onEnd((e) => {
      "worklet";
      const ci = currentPanel.value;
      const threshold = cardWidth * 0.3;
      if (ci === 0) {
        runOnJS(snapTo)(panel2X.value < cardWidth - threshold || e.velocityX < -200 ? 1 : 0, 0);
      } else if (ci === 1) {
        if (e.translationX < 0) {
          runOnJS(snapTo)(panel3X.value < cardWidth - threshold || e.velocityX < -200 ? 2 : 1, 1);
        } else {
          runOnJS(snapTo)(panel2X.value > threshold || e.velocityX > 200 ? 0 : 1, 1);
        }
      } else if (ci === 2) {
        runOnJS(snapTo)(panel3X.value > threshold || e.velocityX > 200 ? 1 : 2, 2);
      }
    });

  const panel2AnimStyle = useAnimatedStyle(() => ({ transform: [{ translateX: panel2X.value }] }));
  const panel3AnimStyle = useAnimatedStyle(() => ({ transform: [{ translateX: panel3X.value }] }));
  const cardHeightStyle = useAnimatedStyle(() => ({ height: cardHeightAnim.value }));
  const warmthBarHeightStyle = useAnimatedStyle(() => ({ height: cardHeightAnim.value }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  // Reply handlers
  const handleSendReply = useCallback(async () => {
    const text = replyText.trim();
    if (!text || text.length < REPLY_MIN_LENGTH || sending) return;
    if (!detailData?.panel_3.can_reply) return;
    setSending(true);
    try {
      await postCrossingReply(crossing.id, text, replyTarget);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      pulseOpacity.value = withSequence(
        withTiming(0.25, { duration: 100 }),
        withTiming(0, { duration: 300 })
      );
      setReplyText("");
      setIsTyping(false);
      cardHeightAnim.value = withTiming(CARD_HEIGHT, { duration: 250 });
      snapTo(0, 2);
      fetchedRef.current = false;
      loadDetail();
    } catch {
      // keep state for retry
    } finally {
      setSending(false);
    }
  }, [crossing.id, replyText, replyTarget, sending, detailData, pulseOpacity, cardHeightAnim, snapTo, loadDetail]);

  const onReplyFocus = useCallback(() => {
    setIsTyping(true);
    cardHeightAnim.value = withTiming(EXPANDED_HEIGHT, { duration: 250 });
  }, [cardHeightAnim]);

  const onReplyBlur = useCallback(() => {
    setIsTyping(false);
    cardHeightAnim.value = withTiming(CARD_HEIGHT, { duration: 250 });
  }, [cardHeightAnim]);

  const p2 = detailData?.panel_2;
  const p3 = detailData?.panel_3;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, { width: cardWidth }, cardHeightStyle]}>
        {/* Panel 1 — Split photo + sentence */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.panel1Inner}>
            <View style={{ width: spacing.warmthBarWidth }} />
            <View style={{ width: cardWidth - spacing.warmthBarWidth, height: IMAGE_HEIGHT }}>
              {/* Top half — participant A photo */}
              <View style={styles.splitHalf}>
                {participant_a.photo_url ? (
                  <Image source={{ uri: participant_a.photo_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.PANEL_DEEP }]} />
                )}
                <View style={styles.warmTint} />
              </View>
              {/* Bottom half — participant B photo */}
              <View style={styles.splitHalf}>
                {participant_b.photo_url ? (
                  <Image source={{ uri: participant_b.photo_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.PANEL_DEEP }]} />
                )}
                <View style={styles.warmTint} />
              </View>
              {/* Sentence overlay */}
              <Text style={styles.sentence} numberOfLines={4} ellipsizeMode="tail">
                {crossing.sentence}
              </Text>
              {/* Dots hint */}
              <View style={styles.dotsHint}>
                <View style={styles.dot} />
                <View style={styles.dot} />
                <View style={styles.dot} />
              </View>
            </View>
          </View>
          {/* Footer — two avatars + names + timestamp */}
          <View style={styles.footer}>
            <View style={styles.profileRow}>
              {participant_a.photo_url ? (
                <Image source={{ uri: participant_a.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              {participant_b.photo_url ? (
                <Image source={{ uri: participant_b.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <Text style={styles.names} numberOfLines={1}>
                {(participant_a.name ?? "—").toUpperCase()} × {(participant_b.name ?? "—").toUpperCase()}
              </Text>
            </View>
            <Text style={styles.timestamp}>
              {formatRelativeTime(crossing.created_at)}
            </Text>
          </View>
        </View>

        {/* Panel 2 — Context with split photo background */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.panel2, panel2AnimStyle]}>
          <Text style={styles.panelLabel}>Context</Text>
          {detailLoading ? (
            <View style={styles.panelCentered}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
            </View>
          ) : p2 ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.panel2Content}>
              <Text style={styles.sentenceP2} numberOfLines={2}>{p2.sentence}</Text>
              {p2.context ? (
                <Text style={styles.contextP2}>{p2.context}</Text>
              ) : (
                <Text style={styles.panelEmpty}>No context shared yet.</Text>
              )}
            </ScrollView>
          ) : (
            <View style={styles.panelCentered}>
              <Text style={styles.panelEmpty}>Swipe to load context.</Text>
            </View>
          )}
        </Animated.View>

        {/* Panel 3 — Replies with person selector */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.panel3, panel3AnimStyle]}>
          <Text style={styles.panelLabel}>Replies</Text>
          {detailLoading ? (
            <View style={styles.panelCentered}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
            </View>
          ) : p3 ? (
            <>
              <ScrollView
                style={styles.repliesScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.repliesContentContainer}
              >
                {p3.accepted_replies.length === 0 ? (
                  <Text style={styles.panelEmpty}>No accepted replies yet.</Text>
                ) : null}
                {p3.accepted_replies.map((r) => (
                  <View key={r.id} style={styles.replyRow}>
                    {r.user?.photo_url ? (
                      <Image source={{ uri: r.user.photo_url }} style={styles.replyAvatar} />
                    ) : (
                      <View style={[styles.replyAvatar, styles.avatarPlaceholder]} />
                    )}
                    <View style={styles.replyBody}>
                      <Text style={styles.replyName}>
                        {r.user?.name ? r.user.name.toUpperCase() : "—"}
                        {" → "}
                        {r.target_participant_id === participant_a.id
                          ? (participant_a.name ?? "—").toUpperCase()
                          : (participant_b.name ?? "—").toUpperCase()}
                      </Text>
                      <Text style={styles.replyText} numberOfLines={2}>{r.text}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
              {p3.can_reply && (
                <KeyboardAvoidingView
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                  style={styles.inputWrap}
                >
                  {/* Reply-to selector */}
                  <Text style={styles.replyInputLabel}>reply.</Text>
                  <View style={styles.targetRow}>
                    <Text style={styles.replyToLabel}>to</Text>
                    <TouchableOpacity
                      style={[styles.targetPill, replyTarget === participant_a.id && styles.targetPillActive]}
                      onPress={() => setReplyTarget(participant_a.id)}
                    >
                      <Text style={[styles.targetPillText, replyTarget === participant_a.id && styles.targetPillTextActive]}>
                        {(participant_a.name ?? "A").toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.targetPill, replyTarget === participant_b.id && styles.targetPillActive]}
                      onPress={() => setReplyTarget(participant_b.id)}
                    >
                      <Text style={[styles.targetPillText, replyTarget === participant_b.id && styles.targetPillTextActive]}>
                        {(participant_b.name ?? "B").toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.replyInput}
                    placeholder="what this surfaces in you..."
                    placeholderTextColor={colors.TYPE_MUTED}
                    value={replyText}
                    onChangeText={(t) => setReplyText(t.slice(0, REPLY_MAX_LENGTH))}
                    onFocus={onReplyFocus}
                    onBlur={onReplyBlur}
                    editable={!sending}
                    multiline={false}
                    maxLength={REPLY_MAX_LENGTH}
                  />
                  <View style={styles.inputRow}>
                    <Text style={styles.replyHint}>
                      {replyText.trim().length}/{REPLY_MIN_LENGTH} min
                    </Text>
                    <TouchableOpacity
                      style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
                      onPress={handleSendReply}
                      disabled={replyText.trim().length < REPLY_MIN_LENGTH || sending}
                    >
                      <Text style={styles.sendBtnText}>Send</Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              )}
            </>
          ) : (
            <View style={styles.panelCentered}>
              <Text style={styles.panelEmpty}>Swipe to load replies.</Text>
            </View>
          )}
        </Animated.View>

        {/* Pulse overlay */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pulseOverlay, pulseStyle]} />

        {/* Warmth bar */}
        <Animated.View style={[styles.warmthBarOverlay, warmthBarHeightStyle]} pointerEvents="none">
          <View style={[styles.warmthBarFill, {
            backgroundColor: effectiveWarmth === "none" ? "transparent"
              : effectiveWarmth === "low" ? colors.CHARTREUSE
              : effectiveWarmth === "medium" ? colors.OLIVE
              : colors.VERMILLION
          }]} />
        </Animated.View>

        {/* Panel indicator dots */}
        <View style={styles.indicator} pointerEvents="none">
          <View style={[styles.indicatorDot, displayPanel === 0 && styles.indicatorDotActive]} />
          <View style={[styles.indicatorDot, displayPanel === 1 && styles.indicatorDotActive]} />
          <View style={[styles.indicatorDot, displayPanel === 2 && styles.indicatorDotActive]} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    height: CARD_HEIGHT,
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
    backgroundColor: colors.CARD_GROUND,
  },
  warmthBarOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 10,
    overflow: "hidden",
    borderTopLeftRadius: spacing.cardRadius,
    borderBottomLeftRadius: spacing.cardRadius,
  },
  warmthBarFill: {
    width: spacing.warmthBarWidth,
    flex: 1,
  },
  panel1Inner: {
    flexDirection: "row",
  },
  splitHalf: {
    height: IMAGE_HEIGHT / 2,
    overflow: "hidden",
    position: "relative",
  },
  warmTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(60, 45, 30, 0.25)",
  },
  sentence: {
    fontFamily: fontFamily.sentient,
    fontWeight: "700",
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    fontSize: 24,
    lineHeight: 27,
    letterSpacing: -0.35,
    color: colors.TYPE_WHITE,
  },
  dotsHint: {
    position: "absolute",
    right: 8,
    top: 12,
    flexDirection: "column",
    justifyContent: "space-between",
    height: 10,
    opacity: 0.28,
  },
  dot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: colors.TYPE_WHITE,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    height: FOOTER_HEIGHT,
    backgroundColor: colors.CARD_GROUND,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  avatar: {
    width: spacing.compactAvatarSize,
    height: spacing.compactAvatarSize,
    borderRadius: spacing.compactAvatarSize / 2,
  },
  avatarPlaceholder: {
    backgroundColor: colors.TYPE_MUTED,
  },
  names: {
    fontFamily: typography.label.fontFamily,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.TYPE_DARK,
    flex: 1,
  },
  timestamp: {
    fontFamily: typography.metadata.fontFamily,
    fontSize: 7,
    lineHeight: 9,
    letterSpacing: 0.8,
    color: colors.TYPE_MUTED,
  },

  // Panel 2 — Context
  panel2: {
    backgroundColor: colors.PANEL_DARK,
    padding: 16,
    paddingTop: 14,
    borderRadius: spacing.cardRadius,
  },
  panel2Content: { paddingBottom: 8 },
  panelLabel: {
    ...typography.label,
    fontSize: 7,
    color: "rgba(255,255,255,0.48)",
    marginBottom: 10,
  },
  sentenceP2: {
    ...typography.thoughtDisplay,
    fontSize: 13,
    lineHeight: 16,
    color: colors.TYPE_WHITE,
    marginBottom: 10,
  },
  contextP2: {
    ...typography.context,
    fontSize: 9,
    lineHeight: 13,
    color: "rgba(255,255,255,0.7)",
  },
  panelEmpty: {
    ...typography.context,
    fontSize: 9,
    color: "rgba(255,255,255,0.4)",
  },
  panelCentered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Panel 3 — Replies
  panel3: {
    backgroundColor: colors.PANEL_DEEP,
    padding: 16,
    paddingTop: 14,
    borderRadius: spacing.cardRadius,
  },
  repliesScroll: { flex: 1 },
  repliesContentContainer: { paddingBottom: 48 },
  replyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  replyAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  replyBody: { flex: 1 },
  replyName: {
    ...typography.metadata,
    fontSize: 6,
    color: colors.TYPE_MUTED,
    marginBottom: 2,
  },
  replyText: {
    ...typography.context,
    fontSize: 9,
    lineHeight: 12,
    color: colors.TYPE_WHITE,
  },
  inputWrap: {
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  replyInputLabel: {
    ...typography.replyInput,
    fontSize: 8,
    color: colors.VERMILLION,
    marginBottom: 4,
  },
  replyToLabel: {
    ...typography.metadata,
    fontSize: 6,
    color: "rgba(255,255,255,0.4)",
    marginRight: 2,
  },
  targetPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  targetPillActive: {
    backgroundColor: colors.OLIVE,
  },
  targetPillText: {
    ...typography.label,
    fontSize: 6,
    color: "rgba(255,255,255,0.5)",
  },
  targetPillTextActive: {
    color: colors.TYPE_WHITE,
  },
  replyInput: {
    ...typography.replyInput,
    fontSize: 10,
    color: colors.TYPE_WHITE,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.2)",
    paddingVertical: 6,
  },
  inputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  replyHint: {
    ...typography.metadata,
    fontSize: 6,
    color: colors.TYPE_MUTED,
  },
  sendBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: colors.VERMILLION,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: {
    ...typography.label,
    fontSize: 7,
    color: colors.TYPE_WHITE,
  },

  // Pulse overlay
  pulseOverlay: {
    backgroundColor: colors.TYPE_WHITE,
    borderRadius: spacing.cardRadius,
  },

  // Indicator dots
  indicator: {
    position: "absolute",
    bottom: 6,
    right: 10,
    flexDirection: "row",
    gap: 4,
  },
  indicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  indicatorDotActive: {
    backgroundColor: "rgba(255,255,255,0.7)",
  },
});
