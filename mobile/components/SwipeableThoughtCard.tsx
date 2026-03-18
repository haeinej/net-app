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
  type GestureResponderEvent,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
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
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { ThoughtImageFrame } from "./ThoughtImageFrame";
import { SwipeSendHint } from "./SwipeSendHint";
import {
  deleteReply,
  fetchThought,
  postReply,
  type FeedItemThought,
  type ThoughtDetailResponse,
} from "../lib/api";
import { useEngagementTracking } from "../hooks/useEngagementTracking";
import { getSavedCardPanel, setSavedCardPanel } from "../lib/card-panel-memory";
import { formatRelativeTime } from "../lib/format";

const REPLY_MIN_LENGTH = 30;
const REPLY_MAX_LENGTH = 300;
const IMAGE_HEIGHT = 150;
const CARD_HEIGHT = spacing.compactCardHeight;
const FOOTER_HEIGHT = spacing.compactFooterHeight;
const EXPANDED_HEIGHT = 340;
const SEND_READY_PROGRESS = 0.78;
const SEND_VELOCITY_THRESHOLD = -650;

interface SwipeableThoughtCardProps {
  item: FeedItemThought;
  visible?: boolean;
  isOwn?: boolean;
  onDelete?: (thoughtId: string) => void;
  onEdit?: (thoughtId: string) => void;
}

export function SwipeableThoughtCard({ item, visible = false, isOwn = false, onDelete, onEdit }: SwipeableThoughtCardProps) {
  const router = useRouter();
  const { contentWidth } = useResponsiveLayout();
  const cardWidth = contentWidth - spacing.screenPadding * 2;

  const { thought, user } = item;
  const cardKey = `thought-${thought.id}`;
  const initialPanel = getSavedCardPanel(cardKey);

  // Panel state — shared value for worklet access, React state for indicator rendering
  const currentPanel = useSharedValue(initialPanel);
  const [displayPanel, setDisplayPanel] = useState(initialPanel);
  const panel2X = useSharedValue(initialPanel >= 1 ? 0 : cardWidth);
  const panel3X = useSharedValue(initialPanel >= 2 ? 0 : cardWidth);

  // Gesture progress for parallax & scale effects (0 = idle, -1 = dragging left, 1 = dragging right)
  const dragProgress = useSharedValue(0);

  // Animated indicator dot values
  const indicatorProgress = useSharedValue(initialPanel);

  // Detail data (lazy loaded)
  const [detailData, setDetailData] = useState<ThoughtDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const fetchedRef = useRef(false);

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const pulseOpacity = useSharedValue(0);
  const sendSwipeProgress = useSharedValue(0);
  const sendHapticArmed = useSharedValue(0);

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

  const refreshDetail = useCallback(async () => {
    fetchedRef.current = false;
    await loadDetail();
  }, [loadDetail]);

  // Apple-style spring config: responsive with slight bounce
  const SNAP_SPRING = { damping: 28, stiffness: 320, mass: 0.8 };
  // Softer spring for rubber-band release
  const RUBBER_SPRING = { damping: 22, stiffness: 180, mass: 0.6 };

  const triggerSnapHaptic = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, []);

  const triggerSendReadyHaptic = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  }, []);

  const rememberPanel = useCallback(
    (panel: number) => {
      setSavedCardPanel(cardKey, panel);
    },
    [cardKey]
  );

  const snapTo = useCallback(
    (target: number, from: number) => {
      "worklet";

      // Spring-based snap for organic feel
      if (target >= 1) {
        panel2X.value = withSpring(0, SNAP_SPRING);
      } else {
        panel2X.value = withSpring(cardWidth, SNAP_SPRING);
      }
      if (target >= 2) {
        panel3X.value = withSpring(0, SNAP_SPRING);
      } else {
        panel3X.value = withSpring(cardWidth, SNAP_SPRING);
      }
      // Animate indicator smoothly
      indicatorProgress.value = withSpring(target, { damping: 20, stiffness: 200 });
      // Reset drag progress
      dragProgress.value = withSpring(0, RUBBER_SPRING);
      sendSwipeProgress.value = withTiming(0, { duration: 140 });
      sendHapticArmed.value = 0;

      currentPanel.value = target;
      runOnJS(setDisplayPanel)(target);
      runOnJS(rememberPanel)(target);

      // Haptic on panel change
      if (target !== from) {
        runOnJS(triggerSnapHaptic)();
      }

      if (from === 0 && target === 1) {
        runOnJS(recordSwipeP2)();
        runOnJS(loadDetail)();
      } else if (from === 1 && target === 2) {
        runOnJS(recordSwipeP3)();
      }
    },
    [
      cardWidth,
      currentPanel,
      indicatorProgress,
      loadDetail,
      panel2X,
      panel3X,
      rememberPanel,
      sendHapticArmed,
      sendSwipeProgress,
      triggerSnapHaptic,
    ]
  );

  // Rubber-band function: diminishing returns past boundary (like iOS overscroll)
  const rubberBand = (offset: number, limit: number) => {
    "worklet";
    const c = 0.35; // resistance factor
    return limit * (1 - Math.exp((-c * offset) / limit));
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onUpdate((e) => {
      "worklet";
      const ci = currentPanel.value;
      const tx = e.translationX;
      const sendDistance = cardWidth * 0.28;

      // Track drag progress for parallax
      dragProgress.value = Math.max(-1, Math.min(1, tx / cardWidth));

      // Update indicator progress during drag
      if (ci === 0) {
        sendSwipeProgress.value = 0;
        sendHapticArmed.value = 0;
        const progress = Math.max(0, Math.min(1, -tx / cardWidth));
        indicatorProgress.value = progress;
      } else if (ci === 1) {
        sendSwipeProgress.value = 0;
        sendHapticArmed.value = 0;
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
          // Swiping left → bring panel 2 in
          const next = Math.max(0, Math.min(cardWidth, cardWidth + tx));
          panel2X.value = next;
        } else {
          // Swiping right on first panel → rubber band
          panel2X.value = cardWidth + rubberBand(tx, cardWidth * 0.15);
        }
      } else if (ci === 1) {
        if (tx < 0) {
          // Swiping left → bring panel 3 in
          const next = Math.max(0, Math.min(cardWidth, cardWidth + tx));
          panel3X.value = next;
        } else {
          // Swiping right → push panel 2 out
          const next = Math.max(0, Math.min(cardWidth, tx));
          panel2X.value = next;
        }
      } else if (ci === 2) {
        if (tx > 0) {
          // Swiping right → push panel 3 out
          const next = Math.max(0, Math.min(cardWidth, tx));
          panel3X.value = next;
          sendSwipeProgress.value = 0;
          sendHapticArmed.value = 0;
        } else {
          const canOverswipeSend =
            !isOwn &&
            !sending &&
            replyText.trim().length >= REPLY_MIN_LENGTH &&
            Boolean(detailData?.panel_3.can_reply);

          if (canOverswipeSend) {
            const overswipe = Math.max(0, -tx);
            const progress = Math.max(0, Math.min(1, overswipe / sendDistance));
            sendSwipeProgress.value = progress;

            if (progress >= SEND_READY_PROGRESS && sendHapticArmed.value === 0) {
              sendHapticArmed.value = 1;
              runOnJS(triggerSendReadyHaptic)();
            } else if (progress < SEND_READY_PROGRESS && sendHapticArmed.value === 1) {
              sendHapticArmed.value = 0;
            }

            panel3X.value = -rubberBand(overswipe, cardWidth * 0.22);
          } else {
            sendSwipeProgress.value = 0;
            sendHapticArmed.value = 0;
            // Swiping left on last panel → rubber band
            panel3X.value = -rubberBand(-tx, cardWidth * 0.15);
          }
        }
      }
    })
    .onEnd((e) => {
      "worklet";
      const ci = currentPanel.value;
      const vx = e.velocityX;
      // Lower threshold for flick gestures (Apple uses ~25% + velocity)
      const threshold = cardWidth * 0.25;
      const flickVelocity = 400;

      if (ci === 0) {
        if (e.translationX > 0) {
          // Rubber-band release — snap back
          snapTo(0, 0);
        } else if (panel2X.value < cardWidth - threshold || vx < -flickVelocity) {
          snapTo(1, 0);
        } else {
          snapTo(0, 0);
        }
      } else if (ci === 1) {
        if (e.translationX < 0) {
          if (panel3X.value < cardWidth - threshold || vx < -flickVelocity) {
            snapTo(2, 1);
          } else {
            snapTo(1, 1);
          }
        } else {
          if (panel2X.value > threshold || vx > flickVelocity) {
            snapTo(0, 1);
          } else {
            snapTo(1, 1);
          }
        }
      } else if (ci === 2) {
        const canOverswipeSend =
          !isOwn &&
          !sending &&
          replyText.trim().length >= REPLY_MIN_LENGTH &&
          Boolean(detailData?.panel_3.can_reply);
        const shouldSend =
          canOverswipeSend &&
          e.translationX < 0 &&
          (sendSwipeProgress.value >= SEND_READY_PROGRESS ||
            vx <= SEND_VELOCITY_THRESHOLD);

        if (shouldSend) {
          sendSwipeProgress.value = withTiming(0, { duration: 120 });
          sendHapticArmed.value = 0;
          panel3X.value = withSpring(0, SNAP_SPRING);
          indicatorProgress.value = withSpring(2, { damping: 20, stiffness: 200 });
          runOnJS(handleSendReply)();
        } else if (e.translationX < 0) {
          sendSwipeProgress.value = withTiming(0, { duration: 120 });
          sendHapticArmed.value = 0;
          // Rubber-band release — snap back
          snapTo(2, 2);
        } else if (panel3X.value > threshold || vx > flickVelocity) {
          snapTo(1, 2);
        } else {
          snapTo(2, 2);
        }
      }
    });

  // Panel 2: slide in with subtle scale-up for depth
  const panel2AnimStyle = useAnimatedStyle(() => {
    const progress = 1 - panel2X.value / cardWidth; // 0 = offscreen, 1 = fully visible
    const scale = interpolate(progress, [0, 1], [0.97, 1], Extrapolation.CLAMP);
    return {
      transform: [{ translateX: panel2X.value }, { scale }],
    };
  });

  // Panel 3: slide in with subtle scale-up
  const panel3AnimStyle = useAnimatedStyle(() => {
    const progress = 1 - panel3X.value / cardWidth;
    const scale = interpolate(progress, [0, 1], [0.97, 1], Extrapolation.CLAMP);
    return {
      transform: [{ translateX: panel3X.value }, { scale }],
    };
  });

  // Animated indicator dot styles (Apple-style expanding active dot)
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
        withTiming(0.2, { duration: 80, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) })
      );
      setReplyText("");
      setIsTyping(false);
      // Snap back to panel 0
      snapTo(0, 2);
      await refreshDetail();
    } catch {
      // keep state for retry
    } finally {
      setSending(false);
    }
  }, [thought.id, replyText, sending, detailData, recordReplySent, pulseOpacity, snapTo, refreshDetail]);

  const onReplyFocus = useCallback(() => {
    setIsTyping(true);
    recordTypeStart();
  }, [recordTypeStart]);

  const onReplyBlur = useCallback(() => {
    setIsTyping(false);
  }, []);

  const showOwnerActions = useCallback(() => {
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

  const handleLongPress = useCallback(() => {
    showOwnerActions();
  }, [showOwnerActions]);

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
              await refreshDetail();
            } catch {}
          },
        },
      ]);
    },
    [refreshDetail]
  );

  const hasPhoto = Boolean(thought.photo_url ?? thought.image_url);
  const p2 = detailData?.panel_2;
  const p3 = detailData?.panel_3;

  const openUserProfile = useCallback(
    (userId?: string | null) => {
      if (!userId) return;
      router.push({ pathname: "/user/[id]", params: { id: userId } });
    },
    [router]
  );

  const openThoughtDetail = useCallback(() => {
    router.push({ pathname: "/thought/[id]", params: { id: thought.id } });
  }, [router, thought.id]);

  const handleProfilePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      openUserProfile(user.id);
    },
    [openUserProfile, user.id]
  );

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, { width: cardWidth }, cardHeightStyle]}>
        {/* Panel 1 — Thought image + footer */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.panel1Inner}>
            <View style={{ width: spacing.warmthBarWidth }} />
            <View style={[styles.imageWrap, { width: cardWidth - spacing.warmthBarWidth, height: IMAGE_HEIGHT }]}>
              <TouchableOpacity
                style={styles.panel1OpenHitArea}
                activeOpacity={0.92}
                onPress={openThoughtDetail}
              >
                <ThoughtImageFrame
                  imageUrl={thought.photo_url ?? thought.image_url}
                  aspectRatio={4 / 3}
                  borderRadius={0}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.imageOverlay} pointerEvents="none">
                  <Text
                    style={[styles.sentence, !hasPhoto && styles.sentenceNoPhoto]}
                    numberOfLines={4}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {thought.sentence}
                  </Text>
                  <View style={[styles.dotsHint, !hasPhoto && styles.dotsHintNoPhoto]}>
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={styles.footer}
            onPress={openThoughtDetail}
            onLongPress={handleLongPress}
            activeOpacity={0.92}
            delayLongPress={400}
          >
            <TouchableOpacity
              style={styles.profileRow}
              onPress={handleProfilePress}
              disabled={!user.id}
              activeOpacity={0.7}
            >
              {user.photo_url ? (
                <Image source={{ uri: user.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <Text style={styles.name} numberOfLines={1}>
                {user.name ? user.name.toUpperCase() : "—"}
              </Text>
            </TouchableOpacity>
            <View style={styles.footerRight}>
              <Text style={styles.timestamp}>
                {formatRelativeTime(thought.created_at)}
              </Text>
              {isOwn ? (
                <TouchableOpacity
                  style={styles.ownerActionBtn}
                  onPress={showOwnerActions}
                  activeOpacity={0.7}
                >
                  <Text style={styles.ownerActionText}>•••</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>

        {/* Panel 2 — Context (slides from right, glass-rimmed) */}
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

        {/* Panel 3 — Replies (slides from right, glass-rimmed) */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.panel3, panel3AnimStyle]}>
          <Text style={styles.panelLabel}>Replies</Text>
          {/* Existing replies */}
          <ScrollView
            style={styles.repliesScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.repliesContentContainer}
          >
            {detailLoading ? (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" style={{ marginTop: 16 }} />
            ) : p3 && p3.replies.length > 0 ? (
              p3.replies.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.replyRow}
                  onPress={() => openUserProfile(r.user?.id)}
                  disabled={!r.user?.id}
                  activeOpacity={0.7}
                >
                  {r.user?.photo_url ? (
                    <Image source={{ uri: r.user.photo_url }} style={styles.replyAvatar} />
                  ) : (
                    <View style={[styles.replyAvatar, styles.avatarPlaceholder]} />
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
                    <Text style={styles.replyText} numberOfLines={2}>
                      {r.text}
                    </Text>
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
              ))
            ) : !detailLoading ? (
              <Text style={styles.panelEmpty}>No replies yet.</Text>
            ) : null}
          </ScrollView>
          {/* Reply input — only for other people's cards */}
          {!isOwn && (
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
                <SwipeSendHint
                  label="Reply"
                  hint={`${replyText.trim().length}/${REPLY_MIN_LENGTH} min • keep swiping left to send`}
                  progress={sendSwipeProgress}
                  style={styles.replySwipe}
                  disabled={replyText.trim().length < REPLY_MIN_LENGTH || sending}
                  loading={sending}
                  darkSurface
                />
              </View>
            </KeyboardAvoidingView>
          )}
        </Animated.View>

        {/* Pulse overlay on reply sent */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.pulseOverlay, pulseStyle]}
        />

        {/* Warmth bar — always visible across all panels, follows card height */}
        <Animated.View style={[styles.warmthBarOverlay, warmthBarHeightStyle]} pointerEvents="none">
          <View style={[styles.warmthBarFill, { backgroundColor: colors.VERMILLION }]} />
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
    height: IMAGE_HEIGHT,
  },
  imageWrap: {
    position: "relative",
    overflow: "hidden",
  },
  panel1OpenHitArea: {
    flex: 1,
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  sentence: {
    fontFamily: fontFamily.sentientBold,
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    fontSize: 18.5,
    lineHeight: 22,
    letterSpacing: -0.3,
    color: colors.TYPE_WHITE,
  },
  sentenceNoPhoto: {
    color: colors.TYPE_DARK,
  },
  dotsHintNoPhoto: {
    opacity: 0.35,
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
    borderColor: "rgba(0,0,0,0.06)",
  },
  name: {
    fontFamily: typography.label.fontFamily,
    fontSize: 9.5,
    lineHeight: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.TYPE_DARK,
    flex: 1,
  },
  timestamp: {
    fontFamily: typography.metadata.fontFamily,
    fontSize: 8.5,
    lineHeight: 10.5,
    letterSpacing: 0.8,
    color: colors.TYPE_MUTED,
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
  },
  ownerActionBtn: {
    minWidth: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  ownerActionText: {
    fontFamily: typography.metadata.fontFamily,
    fontSize: 15,
    lineHeight: 15,
    letterSpacing: 0.6,
    color: colors.TYPE_MUTED,
  },

  // Panel 2 — Context (glass-rimmed dark surface)
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
    fontSize: 8.5,
    color: "rgba(255,255,255,0.48)",
    marginBottom: 10,
  },
  contextP2: {
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

  // Panel 3 — Replies (glass-rimmed deep surface)
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
    paddingBottom: 4,
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
  replyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  replyName: {
    ...typography.metadata,
    fontSize: 7.5,
    color: colors.TYPE_MUTED,
    marginBottom: 2,
  },
  replyStatus: {
    ...typography.metadata,
    fontSize: 6.5,
    color: colors.OLIVE,
    letterSpacing: 0.6,
  },
  replyText: {
    ...typography.context,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.TYPE_WHITE,
  },
  replyDeleteBtn: {
    marginLeft: 8,
    paddingVertical: 1,
  },
  replyDeleteText: {
    ...typography.metadata,
    fontSize: 7.5,
    color: colors.VERMILLION,
  },
  inputWrap: {
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
  replySwipe: {
    flex: 1,
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
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
});
