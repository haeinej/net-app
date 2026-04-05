import { useState, useCallback, useRef, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import { colors, spacing, typography, fontFamily, shadows, glass } from "../theme";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { ThoughtImageFrame } from "./ThoughtImageFrame";

import {
  fetchThought,
  fetchThoughtReplies,
  type FeedItem,
  type FeedItemThought,
  type ThoughtDetailResponse,
} from "../lib/api";
import { useEngagementTracking } from "../hooks/useEngagementTracking";
import { getSavedCardPanel, setSavedCardPanel } from "../lib/card-panel-memory";
import { formatRelativeTime } from "../lib/format";

const IMAGE_HEIGHT = 150;
const CARD_HEIGHT = spacing.compactCardHeight;
const FOOTER_HEIGHT = spacing.compactFooterHeight;

interface SwipeableThoughtCardProps {
  item: FeedItemThought;
  visible?: boolean;
  isOwn?: boolean;
  onDelete?: (thoughtId: string) => void;
  onEdit?: (thoughtId: string) => void;
  onReplySent?: (thoughtId: string) => void;
}

export const SwipeableThoughtCard = memo(function SwipeableThoughtCard({ item, visible = false, isOwn = false, onDelete, onEdit }: SwipeableThoughtCardProps) {
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

  // Reply-cards state (fetched when panel 3 becomes visible)
  const [replyCards, setReplyCards] = useState<FeedItem[]>([]);
  const [replyCardsLoading, setReplyCardsLoading] = useState(false);
  const replyCardsFetchedRef = useRef(false);

  // Engagement tracking
  const {
    recordSwipeP2,
    recordSwipeP3,
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

  // Fetch reply-cards for panel 3
  const loadReplyCards = useCallback(async () => {
    if (replyCardsFetchedRef.current) return;
    replyCardsFetchedRef.current = true;
    setReplyCardsLoading(true);
    try {
      const items = await fetchThoughtReplies(thought.id);
      setReplyCards(items);
    } catch {
      replyCardsFetchedRef.current = false; // allow retry
    } finally {
      setReplyCardsLoading(false);
    }
  }, [thought.id]);

  // Apple-style spring config: responsive with slight bounce
  const SNAP_SPRING = { damping: 28, stiffness: 320, mass: 0.8 };
  // Softer spring for rubber-band release
  const RUBBER_SPRING = { damping: 22, stiffness: 180, mass: 0.6 };

  const rememberPanel = useCallback(
    (panel: number) => {
      setSavedCardPanel(cardKey, panel);
    },
    [cardKey]
  );

  // ── Stable-identity wrappers for runOnJS (prevents Hermes crash from GC'd closures) ──
  // When React re-renders (e.g. every keystroke), useCallback recreates closures.
  // Gesture worklets capture these via runOnJS — if the old closure is GC'd mid-swipe,
  // Hermes crashes with throwPendingError. Refs ensure the worklet always calls a live function.
  const loadDetailRef = useRef(loadDetail);
  loadDetailRef.current = loadDetail;
  const loadReplyCardsRef = useRef(loadReplyCards);
  loadReplyCardsRef.current = loadReplyCards;
  const rememberPanelRef = useRef(rememberPanel);
  rememberPanelRef.current = rememberPanel;
  const recordSwipeP2Ref = useRef(recordSwipeP2);
  recordSwipeP2Ref.current = recordSwipeP2;
  const recordSwipeP3Ref = useRef(recordSwipeP3);
  recordSwipeP3Ref.current = recordSwipeP3;
  const jsLoadDetail = useCallback(() => { loadDetailRef.current(); }, []);
  const jsLoadReplyCards = useCallback(() => { loadReplyCardsRef.current(); }, []);
  const jsRememberPanel = useCallback((p: number) => { rememberPanelRef.current(p); }, []);
  const jsRecordSwipeP2 = useCallback(() => { recordSwipeP2Ref.current(); }, []);
  const jsRecordSwipeP3 = useCallback(() => { recordSwipeP3Ref.current(); }, []);

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

      currentPanel.value = target;
      runOnJS(setDisplayPanel)(target);
      runOnJS(jsRememberPanel)(target);

      if (from === 0 && target === 1) {
        runOnJS(jsRecordSwipeP2)();
        runOnJS(jsLoadDetail)();
      } else if (from === 1 && target === 2) {
        runOnJS(jsRecordSwipeP3)();
        runOnJS(jsLoadReplyCards)();
      }
    },
    [
      cardWidth,
      currentPanel,
      indicatorProgress,
      jsLoadDetail,
      jsLoadReplyCards,
      panel2X,
      panel3X,
      jsRememberPanel,
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

      // Track drag progress for parallax
      dragProgress.value = Math.max(-1, Math.min(1, tx / cardWidth));

      // Update indicator progress during drag
      if (ci === 0) {
        const progress = Math.max(0, Math.min(1, -tx / cardWidth));
        indicatorProgress.value = progress;
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
        } else {
          // Swiping left on the reply panel only rubber-bands.
          panel3X.value = -rubberBand(-tx, cardWidth * 0.15);
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
        if (e.translationX < 0) {
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

  const p2 = detailData?.panel_2;
  const p3 = detailData?.panel_3;

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

  const hasPhoto = Boolean(thought.photo_url ?? thought.image_url);

  const openUserProfile = useCallback(
    (userId?: string | null) => {
      if (!userId) return;
      router.push({ pathname: "/user/[id]", params: { id: userId } });
    },
    [router]
  );

  const handleProfilePress = useCallback(
    () => {
      openUserProfile(user.id);
    },
    [openUserProfile, user.id]
  );

  const inResponseTo = thought.in_response_to;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, { width: cardWidth }]}>
        {/* Panel 1 — Thought image + footer */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.panel1Inner}>
            <View style={{ width: spacing.warmthBarWidth }} />
            <View style={[styles.imageWrap, { width: cardWidth - spacing.warmthBarWidth, height: IMAGE_HEIGHT }]}>
              <View style={styles.panel1OpenHitArea}>
                <ThoughtImageFrame
                  imageUrl={thought.photo_url ?? thought.image_url}
                  aspectRatio={4 / 3}
                  borderRadius={0}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.imageOverlay} pointerEvents="none">
                  {inResponseTo ? (
                    <TouchableOpacity
                      style={styles.inResponseToLink}
                      onPress={() => router.push({ pathname: "/thought/[id]", params: { id: inResponseTo.id } })}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.inResponseToText, !hasPhoto && styles.inResponseToTextNoPhoto]} numberOfLines={1}>
                        in response to "{inResponseTo.sentence.length > 40 ? inResponseTo.sentence.slice(0, 40) + "..." : inResponseTo.sentence}"
                      </Text>
                    </TouchableOpacity>
                  ) : null}
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
              </View>
            </View>
          </View>
          <View style={styles.footer}>
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
          </View>
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

        {/* Panel 3 — Reply-cards (slides from right, glass-rimmed) */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.panel3, panel3AnimStyle]}>
          <Text style={styles.panelLabel}>Replies</Text>
          {replyCardsLoading ? (
            <View style={styles.panelCentered}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
            </View>
          ) : replyCards.length > 0 ? (
            <ScrollView
              style={styles.repliesScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.repliesContentContainer}
            >
              {replyCards.map((rc) => {
                if (rc.type !== "thought") return null;
                return (
                  <TouchableOpacity
                    key={rc.thought.id}
                    style={styles.replyCardRow}
                    onPress={() => router.push({ pathname: "/thought/[id]", params: { id: rc.thought.id } })}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.replyCardAuthor} numberOfLines={1}>
                      {rc.user.name ? rc.user.name.toUpperCase() : "—"}
                    </Text>
                    <Text style={styles.replyCardSentence} numberOfLines={2}>
                      {rc.thought.sentence}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.panelCentered}>
              <Text style={styles.panelEmpty}>No replies yet.</Text>
            </View>
          )}
          {/* Reply button */}
          {!isOwn && (
            <TouchableOpacity
              style={styles.replyPillButton}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/post",
                  params: {
                    in_response_to_id: thought.id,
                    in_response_to_sentence: thought.sentence,
                  },
                })
              }
              activeOpacity={0.8}
            >
              <Text style={styles.replyPillButtonText}>Reply with your own thought</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Warmth bar — always visible across all panels */}
        <View style={styles.warmthBarOverlay} pointerEvents="none">
          <View style={[styles.warmthBarFill, { backgroundColor: colors.VERMILLION }]} />
        </View>

        {/* Panel indicator dots — animated Apple-style */}
        <View style={styles.indicator} pointerEvents="none">
          <Animated.View style={[styles.indicatorDot, dot0Style]} />
          <Animated.View style={[styles.indicatorDot, dot1Style]} />
          <Animated.View style={[styles.indicatorDot, dot2Style]} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

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
    bottom: 0,
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

  // Panel 3 — Reply-cards (glass-rimmed deep surface)
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
    paddingBottom: 8,
  },
  replyCardRow: {
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  replyCardAuthor: {
    ...typography.metadata,
    fontSize: 7.5,
    color: colors.TYPE_MUTED,
    marginBottom: 3,
  },
  replyCardSentence: {
    ...typography.bodySmall,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.TYPE_WHITE,
  },
  replyPillButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.VERMILLION,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  replyPillButtonText: {
    ...typography.label,
    fontSize: 9,
    color: colors.TYPE_WHITE,
  },

  // "In response to" link on Panel 1
  inResponseToLink: {
    position: "absolute",
    top: 8,
    left: 16,
    right: 16,
    zIndex: 3,
  },
  inResponseToText: {
    ...typography.metadata,
    fontSize: 8.5,
    lineHeight: 12,
    color: "rgba(255,255,255,0.6)",
    fontStyle: "italic",
  },
  inResponseToTextNoPhoto: {
    color: colors.TYPE_MUTED,
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
