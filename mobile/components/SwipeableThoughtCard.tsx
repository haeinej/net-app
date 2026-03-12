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
  Alert,
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
import { colors, spacing, typography } from "../theme";
import { ThoughtImageFrame } from "./ThoughtImageFrame";
import {
  fetchThought,
  postReply,
  type FeedItemThought,
  type ThoughtDetailResponse,
} from "../lib/api";
import { useEngagementTracking } from "../hooks/useEngagementTracking";

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

interface SwipeableThoughtCardProps {
  item: FeedItemThought;
  visible?: boolean;
  isOwn?: boolean;
  onDelete?: (thoughtId: string) => void;
  onEdit?: (thoughtId: string) => void;
}

export function SwipeableThoughtCard({ item, visible = false, isOwn = false, onDelete, onEdit }: SwipeableThoughtCardProps) {
  const { width } = useWindowDimensions();
  const cardWidth = width - spacing.screenPadding * 2;

  const { thought, user, warmth_level } = item;

  // Panel state — shared value for worklet access, React state for indicator rendering
  const currentPanel = useSharedValue(0);
  const [displayPanel, setDisplayPanel] = useState(0);
  const panel2X = useSharedValue(cardWidth);
  const panel3X = useSharedValue(cardWidth);

  // Detail data (lazy loaded)
  const [detailData, setDetailData] = useState<ThoughtDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const fetchedRef = useRef(false);

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const pulseOpacity = useSharedValue(0);

  // Warmth escalates as user swipes deeper into panels
  const effectiveWarmth = (() => {
    if (isTyping) return "full" as const;
    const levels: Array<typeof warmth_level> = ["none", "low", "medium", "full"];
    if (displayPanel >= 2) return "full" as const;
    if (displayPanel === 1) return "medium" as const;
    // Panel 0: show at least "low" so the bar is always visible
    const baseIdx = levels.indexOf(warmth_level);
    return levels[Math.max(baseIdx, 1)];
  })();

  // Card height animation for reply expansion
  const cardHeightAnim = useSharedValue<number>(CARD_HEIGHT);

  // Engagement tracking
  const {
    recordSwipeP2,
    recordSwipeP3,
    recordTypeStart,
    recordReplySent,
  } = useEngagementTracking({
    thoughtId: thought.id,
    visible,
  });

  // Lazy fetch detail data
  const loadDetail = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setDetailLoading(true);
    try {
      const data = await fetchThought(thought.id);
      setDetailData(data);
    } catch {
      fetchedRef.current = false; // allow retry
    } finally {
      setDetailLoading(false);
    }
  }, [thought.id]);

  const snapTo = useCallback(
    (target: number, from: number) => {
      const duration = 250;
      if (target >= 1) {
        panel2X.value = withTiming(0, { duration });
      } else {
        panel2X.value = withTiming(cardWidth, { duration });
      }
      if (target >= 2) {
        panel3X.value = withTiming(0, { duration });
      } else {
        panel3X.value = withTiming(cardWidth, { duration });
      }
      currentPanel.value = target;
      setDisplayPanel(target);
      if (from === 0 && target === 1) {
        recordSwipeP2();
        loadDetail();
      } else if (from === 1 && target === 2) {
        recordSwipeP3();
      }
    },
    [cardWidth, panel2X, panel3X, currentPanel, recordSwipeP2, recordSwipeP3, loadDetail]
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      "worklet";
      const ci = currentPanel.value;
      const tx = e.translationX;

      if (ci === 0) {
        // Swiping left from panel 0 → bring panel 2 in
        const next = Math.max(0, Math.min(cardWidth, cardWidth + tx));
        panel2X.value = next;
      } else if (ci === 1) {
        if (tx < 0) {
          // Swiping left from panel 1 → bring panel 3 in
          const next = Math.max(0, Math.min(cardWidth, cardWidth + tx));
          panel3X.value = next;
        } else {
          // Swiping right from panel 1 → push panel 2 out
          const next = Math.max(0, Math.min(cardWidth, tx));
          panel2X.value = next;
        }
      } else if (ci === 2) {
        if (tx > 0) {
          // Swiping right from panel 2 → push panel 3 out
          const next = Math.max(0, Math.min(cardWidth, tx));
          panel3X.value = next;
        }
      }
    })
    .onEnd((e) => {
      "worklet";
      const ci = currentPanel.value;
      const vx = e.velocityX;
      const threshold = cardWidth * 0.3;

      if (ci === 0) {
        if (panel2X.value < cardWidth - threshold || vx < -200) {
          runOnJS(snapTo)(1, 0);
        } else {
          runOnJS(snapTo)(0, 0);
        }
      } else if (ci === 1) {
        if (e.translationX < 0) {
          if (panel3X.value < cardWidth - threshold || vx < -200) {
            runOnJS(snapTo)(2, 1);
          } else {
            runOnJS(snapTo)(1, 1);
          }
        } else {
          if (panel2X.value > threshold || vx > 200) {
            runOnJS(snapTo)(0, 1);
          } else {
            runOnJS(snapTo)(1, 1);
          }
        }
      } else if (ci === 2) {
        if (panel3X.value > threshold || vx > 200) {
          runOnJS(snapTo)(1, 2);
        } else {
          runOnJS(snapTo)(2, 2);
        }
      }
    });

  const panel2AnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panel2X.value }],
  }));

  const panel3AnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panel3X.value }],
  }));

  const cardHeightStyle = useAnimatedStyle(() => ({
    height: cardHeightAnim.value,
  }));

  const warmthBarHeightStyle = useAnimatedStyle(() => ({
    height: cardHeightAnim.value,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Reply handlers
  const handleSendReply = useCallback(async () => {
    const text = replyText.trim();
    if (!text || text.length < REPLY_MIN_LENGTH || sending) return;
    if (!detailData?.panel_3.can_reply) return;
    setSending(true);
    try {
      await postReply(thought.id, text);
      recordReplySent({ reply_length_chars: text.length });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      pulseOpacity.value = withSequence(
        withTiming(0.25, { duration: 100 }),
        withTiming(0, { duration: 300 })
      );
      setReplyText("");
      setIsTyping(false);
      cardHeightAnim.value = withTiming(CARD_HEIGHT, { duration: 250 });
      // Snap back to panel 0
      snapTo(0, 2);
      // Refresh data
      fetchedRef.current = false;
      loadDetail();
    } catch {
      // keep state for retry
    } finally {
      setSending(false);
    }
  }, [thought.id, replyText, sending, detailData, recordReplySent, pulseOpacity, cardHeightAnim, snapTo, loadDetail]);

  const onReplyFocus = useCallback(() => {
    setIsTyping(true);
    recordTypeStart();
    cardHeightAnim.value = withTiming(EXPANDED_HEIGHT, { duration: 250 });
  }, [recordTypeStart, cardHeightAnim]);

  const onReplyBlur = useCallback(() => {
    setIsTyping(false);
    cardHeightAnim.value = withTiming(CARD_HEIGHT, { duration: 250 });
  }, [cardHeightAnim]);

  const handleLongPress = useCallback(() => {
    if (!isOwn) return;
    const options: Array<{ text: string; style?: "cancel" | "destructive"; onPress?: () => void }> = [];
    if (onEdit) {
      options.push({ text: "Edit", onPress: () => onEdit(thought.id) });
    }
    if (onDelete) {
      options.push({
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Alert.alert("Delete thought", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => onDelete(thought.id) },
          ]);
        },
      });
    }
    if (options.length === 0) return;
    options.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Thought", undefined, options);
  }, [isOwn, onEdit, onDelete, thought.id]);

  const p2 = detailData?.panel_2;
  const p3 = detailData?.panel_3;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, { width: cardWidth }, cardHeightStyle]}>
        {/* Panel 1 — Thought image + footer */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.panel1Inner}>
            <View style={{ width: spacing.warmthBarWidth }} />
            <ThoughtImageFrame
              imageUrl={thought.photo_url ?? thought.image_url}
              aspectRatio={4 / 3}
              borderRadius={0}
              style={{ width: cardWidth - spacing.warmthBarWidth, height: IMAGE_HEIGHT }}
            >
              <Text style={styles.sentence} numberOfLines={3}>
                {thought.sentence}
              </Text>
              <View style={styles.dotsHint}>
                <View style={styles.dot} />
                <View style={styles.dot} />
                <View style={styles.dot} />
              </View>
            </ThoughtImageFrame>
          </View>
          <TouchableOpacity
            style={styles.footer}
            onLongPress={handleLongPress}
            activeOpacity={isOwn ? 0.7 : 1}
            delayLongPress={400}
          >
            <View style={styles.profileRow}>
              {user.photo_url ? (
                <Image source={{ uri: user.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <Text style={styles.name} numberOfLines={1}>
                {user.name ? user.name.toUpperCase() : "—"}
              </Text>
            </View>
            <Text style={styles.timestamp}>
              {formatRelativeTime(thought.created_at)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Panel 2 — Context (slides from right) */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.panel2, panel2AnimStyle]}>
          <Text style={styles.panelLabel}>Context</Text>
          {detailLoading ? (
            <View style={styles.panelCentered}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
            </View>
          ) : p2 ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.panel2Content}
            >
              <Text style={styles.sentenceP2} numberOfLines={2}>
                {p2.sentence}
              </Text>
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

        {/* Panel 3 — Replies (slides from right) */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.panel3, panel3AnimStyle]}>
          <Text style={styles.panelLabel}>Accepted replies</Text>
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
                      </Text>
                      <Text style={styles.replyText} numberOfLines={2}>
                        {r.text}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
              {p3.can_reply && (
                <KeyboardAvoidingView
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                  style={styles.inputWrap}
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
            </>
          ) : (
            <View style={styles.panelCentered}>
              <Text style={styles.panelEmpty}>Swipe to load replies.</Text>
            </View>
          )}
        </Animated.View>

        {/* Pulse overlay on reply sent */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.pulseOverlay, pulseStyle]}
        />

        {/* Warmth bar — always visible across all panels, follows card height */}
        <Animated.View style={[styles.warmthBarOverlay, warmthBarHeightStyle]} pointerEvents="none">
          <View style={[styles.warmthBarFill, { backgroundColor: effectiveWarmth === "none" ? "transparent" : effectiveWarmth === "low" ? colors.CHARTREUSE : effectiveWarmth === "medium" ? colors.OLIVE : colors.VERMILLION }]} />
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
  sentence: {
    fontFamily: "Sentient-Light",
    fontWeight: "600",
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.2,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  name: {
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
  panel2Content: {
    paddingBottom: 8,
  },
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
  repliesScroll: {
    flex: 1,
  },
  repliesContentContainer: {
    paddingBottom: 48,
  },
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
  replyInputLabel: {
    ...typography.replyInput,
    fontSize: 8,
    color: colors.VERMILLION,
    marginBottom: 4,
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
