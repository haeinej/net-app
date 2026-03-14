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
  withSpring,
  withSequence,
  interpolate,
  Extrapolation,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, typography, fontFamily, shadows, glass } from "../theme";
import {
  fetchCrossingDetail,
  postCrossingReply,
  type FeedItemCrossing,
  type CrossingDetailResponse,
} from "../lib/api";
import { getSavedCardPanel, setSavedCardPanel } from "../lib/card-panel-memory";

const REPLY_MIN_LENGTH = 50;
const REPLY_MAX_LENGTH = 300;
const CARD_HEIGHT = spacing.compactCardHeight; // 190
const HALF_HEIGHT = CARD_HEIGHT / 2; // 95
const PROFILE_SIZE = 28;

interface CrossingCardProps {
  item: FeedItemCrossing;
  visible?: boolean;
  myUserId?: string | null;
}

export function CrossingCard({ item, visible = false, myUserId }: CrossingCardProps) {
  const { width } = useWindowDimensions();
  const cardWidth = width - spacing.screenPadding * 2;

  const { crossing, participant_a, participant_b, warmth_level } = item;
  const isParticipant = myUserId === participant_a.id || myUserId === participant_b.id;
  const cardKey = `crossing-${crossing.id}`;
  const initialPanel = getSavedCardPanel(cardKey);

  // Panel state
  const currentPanel = useSharedValue(initialPanel);
  const [displayPanel, setDisplayPanel] = useState(initialPanel);
  const panel2X = useSharedValue(initialPanel >= 1 ? 0 : cardWidth);
  const panel3X = useSharedValue(initialPanel >= 2 ? 0 : cardWidth);

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

  // Animated indicator dot progress (mirrors SwipeableThoughtCard)
  const indicatorProgress = useSharedValue(initialPanel);

  // Spring configs (match SwipeableThoughtCard exactly)
  const SNAP_SPRING = { damping: 28, stiffness: 320, mass: 0.8 };
  const RUBBER_SPRING = { damping: 22, stiffness: 180, mass: 0.6 };

  const triggerSnapHaptic = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  }, []);

  const rememberPanel = useCallback(
    (panel: number) => {
      setSavedCardPanel(cardKey, panel);
    },
    [cardKey]
  );

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

  // Rubber-band function (matches SwipeableThoughtCard)
  const rubberBand = (offset: number, limit: number) => {
    "worklet";
    const c = 0.35;
    return limit * (1 - Math.exp((-c * offset) / limit));
  };

  const snapTo = useCallback(
    (target: number, from: number) => {
      "worklet";
      panel2X.value = withSpring(target >= 1 ? 0 : cardWidth, SNAP_SPRING);
      panel3X.value = withSpring(target >= 2 ? 0 : cardWidth, SNAP_SPRING);
      indicatorProgress.value = withSpring(target, { damping: 20, stiffness: 200 });
      currentPanel.value = target;
      runOnJS(setDisplayPanel)(target);
      runOnJS(rememberPanel)(target);
      if (target !== from) {
        runOnJS(triggerSnapHaptic)();
      }
      if (from === 0 && target === 1) runOnJS(loadDetail)();
    },
    [cardWidth, currentPanel, indicatorProgress, loadDetail, panel2X, panel3X, rememberPanel, triggerSnapHaptic]
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onUpdate((e) => {
      "worklet";
      const ci = currentPanel.value;
      const tx = e.translationX;

      // Update indicator progress during drag
      if (ci === 0) {
        indicatorProgress.value = Math.max(0, Math.min(1, -tx / cardWidth));
      } else if (ci === 1) {
        if (tx < 0) {
          indicatorProgress.value = 1 + Math.max(0, Math.min(1, -tx / cardWidth));
        } else {
          indicatorProgress.value = 1 - Math.max(0, Math.min(1, tx / cardWidth));
        }
      } else if (ci === 2) {
        indicatorProgress.value = 2 - Math.max(0, Math.min(1, tx / cardWidth));
      }

      if (ci === 0) {
        if (tx < 0) {
          panel2X.value = Math.max(0, Math.min(cardWidth, cardWidth + tx));
        } else {
          // Rubber band on first panel
          panel2X.value = cardWidth + rubberBand(tx, cardWidth * 0.15);
        }
      } else if (ci === 1) {
        if (tx < 0) {
          panel3X.value = Math.max(0, Math.min(cardWidth, cardWidth + tx));
        } else {
          panel2X.value = Math.max(0, Math.min(cardWidth, tx));
        }
      } else if (ci === 2) {
        if (tx > 0) {
          panel3X.value = Math.max(0, Math.min(cardWidth, tx));
        } else {
          // Rubber band on last panel
          panel3X.value = -rubberBand(-tx, cardWidth * 0.15);
        }
      }
    })
    .onEnd((e) => {
      "worklet";
      const ci = currentPanel.value;
      const threshold = cardWidth * 0.25;
      const flickVelocity = 400;

      if (ci === 0) {
        if (e.translationX > 0) {
          snapTo(0, 0);
        } else if (panel2X.value < cardWidth - threshold || e.velocityX < -flickVelocity) {
          snapTo(1, 0);
        } else {
          snapTo(0, 0);
        }
      } else if (ci === 1) {
        if (e.translationX < 0) {
          if (panel3X.value < cardWidth - threshold || e.velocityX < -flickVelocity) {
            snapTo(2, 1);
          } else {
            snapTo(1, 1);
          }
        } else {
          if (panel2X.value > threshold || e.velocityX > flickVelocity) {
            snapTo(0, 1);
          } else {
            snapTo(1, 1);
          }
        }
      } else if (ci === 2) {
        if (e.translationX < 0) {
          snapTo(2, 2);
        } else if (panel3X.value > threshold || e.velocityX > flickVelocity) {
          snapTo(1, 2);
        } else {
          snapTo(2, 2);
        }
      }
    });

  // Panel animations with parallax scale (match SwipeableThoughtCard)
  const panel2AnimStyle = useAnimatedStyle(() => {
    const progress = 1 - panel2X.value / cardWidth;
    const scale = interpolate(progress, [0, 1], [0.97, 1], Extrapolation.CLAMP);
    return { transform: [{ translateX: panel2X.value }, { scale }] };
  });
  const panel3AnimStyle = useAnimatedStyle(() => {
    const progress = 1 - panel3X.value / cardWidth;
    const scale = interpolate(progress, [0, 1], [0.97, 1], Extrapolation.CLAMP);
    return { transform: [{ translateX: panel3X.value }, { scale }] };
  });
  const cardHeightStyle = useAnimatedStyle(() => ({ height: cardHeightAnim.value }));
  const warmthBarHeightStyle = useAnimatedStyle(() => ({ height: cardHeightAnim.value }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  // Animated expanding indicator dots (match SwipeableThoughtCard exactly)
  const dot0Style = useAnimatedStyle(() => {
    const active = interpolate(indicatorProgress.value, [-0.5, 0, 0.5], [0, 1, 0], Extrapolation.CLAMP);
    return {
      width: interpolate(active, [0, 1], [4, 12], Extrapolation.CLAMP),
      opacity: interpolate(active, [0, 1], [0.3, 0.8], Extrapolation.CLAMP),
    };
  });
  const dot1Style = useAnimatedStyle(() => {
    const active = interpolate(indicatorProgress.value, [0.5, 1, 1.5], [0, 1, 0], Extrapolation.CLAMP);
    return {
      width: interpolate(active, [0, 1], [4, 12], Extrapolation.CLAMP),
      opacity: interpolate(active, [0, 1], [0.3, 0.8], Extrapolation.CLAMP),
    };
  });
  const dot2Style = useAnimatedStyle(() => {
    const active = interpolate(indicatorProgress.value, [1.5, 2, 2.5], [0, 1, 0], Extrapolation.CLAMP);
    return {
      width: interpolate(active, [0, 1], [4, 12], Extrapolation.CLAMP),
      opacity: interpolate(active, [0, 1], [0.3, 0.8], Extrapolation.CLAMP),
    };
  });

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
        withTiming(0.2, { duration: 80, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) })
      );
      setReplyText("");
      setIsTyping(false);
      snapTo(0, 2);
      fetchedRef.current = false;
      loadDetail();
    } catch {
      // keep state for retry
    } finally {
      setSending(false);
    }
  }, [crossing.id, replyText, replyTarget, sending, detailData, pulseOpacity, snapTo, loadDetail]);

  const onReplyFocus = useCallback(() => {
    setIsTyping(true);
  }, []);

  const onReplyBlur = useCallback(() => {
    setIsTyping(false);
  }, []);

  const p2 = detailData?.panel_2;
  const p3 = detailData?.panel_3;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, { width: cardWidth }, cardHeightStyle]}>
        {/* ── Panel 1 — Split halves: person A top, person B bottom ── */}
        <View style={StyleSheet.absoluteFill}>
          {/* Top half — Person A */}
          <View style={styles.halfTop}>
            <View style={{ width: spacing.warmthBarWidth }} />
            <View style={styles.halfContent}>
              {participant_a.photo_url ? (
                <Image source={{ uri: participant_a.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <View style={styles.textWrap}>
                <Text style={styles.personName} numberOfLines={1}>
                  {(participant_a.name ?? "—").toUpperCase()}
                </Text>
                <Text style={styles.sentence} numberOfLines={3} ellipsizeMode="tail">
                  {crossing.sentence}
                </Text>
              </View>
            </View>
          </View>
          {/* Divider */}
          <View style={styles.divider} />
          {/* Bottom half — Person B */}
          <View style={styles.halfBottom}>
            <View style={{ width: spacing.warmthBarWidth }} />
            <View style={styles.halfContent}>
              {participant_b.photo_url ? (
                <Image source={{ uri: participant_b.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <View style={styles.textWrap}>
                <Text style={styles.personName} numberOfLines={1}>
                  {(participant_b.name ?? "—").toUpperCase()}
                </Text>
                <Text style={styles.sentence} numberOfLines={3} ellipsizeMode="tail">
                  {crossing.sentence}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Panel 2 — Context (split halves, glass-rimmed) ── */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.panelOverlay, panel2AnimStyle]}>
          <View style={styles.panelLabelRow}>
            <Text style={styles.panelLabel}>Context</Text>
          </View>
          {detailLoading ? (
            <View style={styles.panelCentered}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
            </View>
          ) : p2 ? (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {/* A context */}
              <View style={styles.panelHalf}>
                {participant_a.photo_url ? (
                  <Image source={{ uri: participant_a.photo_url }} style={styles.panelAvatar} />
                ) : (
                  <View style={[styles.panelAvatar, styles.avatarPlaceholder]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.panelName}>{(participant_a.name ?? "—").toUpperCase()}</Text>
                  <Text style={styles.panelText}>{p2.context ?? "No context shared."}</Text>
                </View>
              </View>
              <View style={styles.panelDivider} />
              {/* B context */}
              <View style={styles.panelHalf}>
                {participant_b.photo_url ? (
                  <Image source={{ uri: participant_b.photo_url }} style={styles.panelAvatar} />
                ) : (
                  <View style={[styles.panelAvatar, styles.avatarPlaceholder]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.panelName}>{(participant_b.name ?? "—").toUpperCase()}</Text>
                  <Text style={styles.panelText}>{p2.context ?? "No context shared."}</Text>
                </View>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.panelCentered}>
              <Text style={styles.panelEmpty}>Swipe to load context.</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Panel 3 — Replies (dark, glass-rimmed) ── */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.panel3Overlay, panel3AnimStyle]}>
          <View style={styles.panelLabelRow}>
            <Text style={styles.panelLabel}>Replies</Text>
          </View>
          {/* Replies scroll area */}
          <ScrollView
            style={styles.repliesScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 4 }}
          >
            {detailLoading ? (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" style={{ marginTop: 8 }} />
            ) : p3 && p3.accepted_replies.length > 0 ? (
              <>
                {/* A replies */}
                <View style={styles.replySection}>
                  <Text style={styles.panelName}>{(participant_a.name ?? "—").toUpperCase()}</Text>
                  {p3.accepted_replies
                    .filter((r) => r.target_participant_id === participant_a.id)
                    .map((r) => (
                      <View key={r.id} style={styles.replyItem}>
                        <Text style={styles.replyFrom}>{r.user?.name ? r.user.name.toUpperCase() : "—"}</Text>
                        <Text style={styles.replyText} numberOfLines={2}>{r.text}</Text>
                      </View>
                    ))}
                </View>
                {/* B replies */}
                <View style={styles.replySection}>
                  <Text style={styles.panelName}>{(participant_b.name ?? "—").toUpperCase()}</Text>
                  {p3.accepted_replies
                    .filter((r) => r.target_participant_id === participant_b.id)
                    .map((r) => (
                      <View key={r.id} style={styles.replyItem}>
                        <Text style={styles.replyFrom}>{r.user?.name ? r.user.name.toUpperCase() : "—"}</Text>
                        <Text style={styles.replyText} numberOfLines={2}>{r.text}</Text>
                      </View>
                    ))}
                </View>
              </>
            ) : !detailLoading ? (
              <Text style={styles.panelEmpty}>No replies yet.</Text>
            ) : null}
          </ScrollView>
          {/* Reply input — only for non-participants */}
          {/* Reply input — matches SwipeableThoughtCard layout */}
          {!isParticipant && (
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.replyInputWrap}
            >
              <Text style={styles.replyInputLabel}>reply.</Text>
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

        {/* Panel indicator dots — animated Apple-style */}
        <View style={styles.indicator} pointerEvents="none">
          <Animated.View style={[styles.indicatorDot, dot0Style]} />
          <Animated.View style={[styles.indicatorDot, dot1Style]} />
          <Animated.View style={[styles.indicatorDot, dot2Style]} />
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
    ...shadows.card,
  },

  /* ── Panel 1 — Two halves ── */
  halfTop: {
    height: HALF_HEIGHT - StyleSheet.hairlineWidth,
    flexDirection: "row",
  },
  halfBottom: {
    height: HALF_HEIGHT,
    flexDirection: "row",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  halfContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 16,
  },
  avatar: {
    width: PROFILE_SIZE,
    height: PROFILE_SIZE,
    borderRadius: PROFILE_SIZE / 2,
    marginRight: 12,
    flexShrink: 0,
  },
  avatarPlaceholder: {
    backgroundColor: colors.TYPE_MUTED,
    opacity: 0.4,
    borderColor: "rgba(0,0,0,0.06)",
  },
  textWrap: {
    flex: 1,
  },
  personName: {
    fontFamily: typography.label.fontFamily,
    fontSize: 8.5,
    letterSpacing: 1,
    color: colors.TYPE_MUTED,
    marginBottom: 4,
  },
  sentence: {
    fontFamily: fontFamily.sentientBold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: colors.TYPE_DARK,
  },

  /* ── Warmth bar ── */
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

  /* ── Panel 2 — Context (dark, matches SwipeableThoughtCard) ── */
  panelOverlay: {
    backgroundColor: colors.PANEL_DARK,
    padding: 16,
    paddingTop: 14,
    borderRadius: spacing.cardRadius,
  },
  panelLabelRow: {
    marginBottom: 6,
  },
  panelLabel: {
    ...typography.label,
    fontSize: 8.5,
    color: "rgba(255,255,255,0.48)",
  },
  panelBody: {
    flex: 1,
  },
  panelHalf: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  panelDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 4,
  },
  panelAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 8,
    marginTop: 2,
    flexShrink: 0,
  },
  panelTextScroll: {
    flex: 1,
  },
  panelName: {
    ...typography.metadata,
    fontSize: 7.5,
    color: colors.TYPE_MUTED,
    marginBottom: 3,
  },
  panelText: {
    ...typography.context,
    fontSize: 13.5,
    lineHeight: 19,
    color: "rgba(255,255,255,0.7)",
  },
  panelEmpty: {
    ...typography.context,
    fontSize: 13.5,
    color: "rgba(255,255,255,0.4)",
  },
  panelCentered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  /* ── Panel 3 — Replies (dark, matches SwipeableThoughtCard) ── */
  panel3Overlay: {
    backgroundColor: colors.PANEL_DEEP,
    padding: 16,
    paddingTop: 14,
    borderRadius: spacing.cardRadius,
  },
  repliesScroll: {
    flex: 1,
  },
  replySection: {
    paddingVertical: 4,
  },
  replyItem: {
    marginBottom: 5,
  },
  replyFrom: {
    ...typography.metadata,
    fontSize: 6.5,
    color: colors.TYPE_MUTED,
    marginBottom: 1,
  },
  replyText: {
    ...typography.context,
    fontSize: 13.5,
    lineHeight: 18,
    color: colors.TYPE_WHITE,
  },

  /* ── Reply input ── */
  replyInputWrap: {
    paddingTop: 6,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  replyInputLabel: {
    ...typography.replyInput,
    fontSize: 9.5,
    color: colors.VERMILLION,
    marginBottom: 4,
  },
  replyInput: {
    ...typography.replyInput,
    fontSize: 12.5,
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
    fontSize: 7.5,
    color: colors.TYPE_MUTED,
  },
  sendBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.VERMILLION,
    ...shadows.raised,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: {
    ...typography.label,
    fontSize: 8.5,
    color: colors.TYPE_WHITE,
  },

  /* ── Pulse overlay ── */
  pulseOverlay: {
    backgroundColor: colors.TYPE_WHITE,
    borderRadius: spacing.cardRadius,
  },

  /* ── Indicator dots ── */
  indicator: {
    position: "absolute",
    bottom: 6,
    right: 10,
    flexDirection: "row",
    gap: 4,
  },
  indicatorDot: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
});
