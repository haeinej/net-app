import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, IMAGE_ASPECT_RATIO, fontFamily } from "../../theme";
import { ScreenExitButton } from "../../components/ScreenExitButton";
import { WarmthBar } from "../../components/WarmthBar";
import { ThoughtImageFrame } from "../../components/ThoughtImageFrame";
import {
  deleteThought,
  editThought,
  fetchThought,
  fetchThoughtReplies,
  type FeedItem,
  type ThoughtDetailResponse,
} from "../../lib/api";
import { ReportModal } from "../../components/ReportModal";
import { useEngagementTracking } from "../../hooks/useEngagementTracking";

export default function ThoughtDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [data, setData] = useState<ThoughtDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportVisible, setReportVisible] = useState(false);
  const [replyCards, setReplyCards] = useState<FeedItem[]>([]);
  const [replyCardsLoading, setReplyCardsLoading] = useState(false);
  const replyCardsFetchedRef = useRef(false);
  const panelIndexValue = useSharedValue(0);

  const translateX = useSharedValue(0);
  const gestureStartX = useSharedValue(0);
  const lastPanelIndex = useRef(0);
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);

  const {
    recordViewP1,
    recordSwipeP2,
    recordSwipeP3,
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
      panelIndexValue.value = index;
    },
    [panelIndexValue]
  );

  const loadReplyCards = useCallback(async () => {
    if (replyCardsFetchedRef.current || !id) return;
    replyCardsFetchedRef.current = true;
    setReplyCardsLoading(true);
    try {
      const items = await fetchThoughtReplies(id);
      setReplyCards(items);
    } catch {
      replyCardsFetchedRef.current = false;
    } finally {
      setReplyCardsLoading(false);
    }
  }, [id]);

  const handleSwipeToPanel = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === 0 && toIndex === 1) {
        recordSwipeP2();
      } else if (fromIndex === 1 && toIndex === 2) {
        recordSwipeP3();
        loadReplyCards();
      }
    },
    [recordSwipeP2, recordSwipeP3, loadReplyCards]
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
    [
      screenWidth,
      translateX,
      handleSwipeToPanel,
      applyPanel,
    ]
  );

  // ── Stable-identity wrappers for runOnJS (prevents Hermes crash from GC'd closures) ──
  const snapToPanelRef = useRef(snapToPanel);
  snapToPanelRef.current = snapToPanel;
  const handleBackRef = useRef(handleBack);
  handleBackRef.current = handleBack;
  const jsSnapToPanel = useCallback((i: number) => { snapToPanelRef.current(i); }, []);
  const jsHandleBack = useCallback(() => { handleBackRef.current(); }, []);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      gestureStartX.value = translateX.value;
    })
    .onUpdate((e) => {
      const min = -2 * screenWidth;
      const max = 0;
      const rawNext = gestureStartX.value + e.translationX;
      const next = Math.min(max, Math.max(min, rawNext));
      translateX.value = next;
    })
    .onEnd((e) => {
      const current = translateX.value;
      const velocity = e.velocityX;

      let targetIndex = Math.round(-current / screenWidth);
      if (targetIndex < 0) targetIndex = 0;
      if (targetIndex > 2) targetIndex = 2;
      if (targetIndex === 0 && current > -screenWidth * 0.2 && (velocity > 80 || current > 20)) {
        runOnJS(jsHandleBack)();
        return;
      }
      runOnJS(jsSnapToPanel)(targetIndex);
    });

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const panelWidth = screenWidth;
  const imageHeight = panelWidth / IMAGE_ASPECT_RATIO;
  const fullPanelHeight = screenHeight - insets.top - insets.bottom;

  const handleOwnerCardMenu = useCallback(() => {
    if (!id || !data?.panel_3.viewer_is_author) return;

    const openContextPrompt = (nextSentence: string) => {
      Alert.prompt(
        "Edit context",
        "Update the context:",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save",
            onPress: async (newContext?: string) => {
              const nextContext = newContext?.trim() ?? "";

              try {
                await editThought(id, {
                  sentence: nextSentence,
                  context: nextContext,
                });
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        panel_1: { ...prev.panel_1, sentence: nextSentence },
                        panel_2: {
                          ...prev.panel_2,
                          sentence: nextSentence,
                          context: nextContext,
                        },
                      }
                    : prev
                );
              } catch {}
            },
          },
        ],
        "plain-text",
        data.panel_2.context ?? ""
      );
    };

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
                text: "Next",
                onPress: async (newSentence?: string) => {
                  const nextSentence = newSentence?.trim();
                  if (!nextSentence) return;
                  openContextPrompt(nextSentence);
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
  const p1HasPhoto = Boolean(p1.photo_url ?? p1.image_url);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.row, { width: panelWidth * 3 }, animatedRowStyle]}>
          {/* Panel 1 */}
          <View style={[styles.panel, { width: panelWidth, minHeight: fullPanelHeight }]}>
            <View style={styles.panel1Inner}>
              <WarmthBar height={imageHeight + 56} />
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
              ) : (
                <TouchableOpacity
                  style={styles.ownerActionBtn}
                  onPress={() => setReportVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.ownerActionText}>•••</Text>
                </TouchableOpacity>
              )}
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

          {/* Panel 3 — Reply cards */}
          <View style={[styles.panel, styles.panel3, { width: panelWidth, minHeight: fullPanelHeight }]}>
            <ScrollView
              style={styles.repliesScroll}
              contentContainerStyle={styles.repliesContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.panelLabel}>Replies</Text>
              {replyCardsLoading ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" style={{ marginTop: 24 }} />
              ) : replyCards.length > 0 ? (
                replyCards.map((rc) => {
                  if (rc.type !== "thought") return null;
                  return (
                    <TouchableOpacity
                      key={rc.thought.id}
                      style={styles.replyCardRow}
                      onPress={() => router.push({ pathname: "/thought/[id]", params: { id: rc.thought.id } })}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.replyCardAuthor} numberOfLines={1}>
                        {rc.user.name ? rc.user.name.toUpperCase() : "---"}
                      </Text>
                      <Text style={styles.replyCardSentence} numberOfLines={2}>
                        {rc.thought.sentence}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={styles.panelEmpty}>No replies yet.</Text>
              )}
            </ScrollView>
            {!p3.viewer_is_author && (
              <TouchableOpacity
                style={styles.replyPillButton}
                onPress={() =>
                  router.push({
                    pathname: "/post",
                    params: {
                      in_response_to_id: id,
                      in_response_to_sentence: p1.sentence,
                    },
                  })
                }
                activeOpacity={0.8}
              >
                <Text style={styles.replyPillButtonText}>Reply with your own thought</Text>
              </TouchableOpacity>
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

      <ScreenExitButton
        onPress={() => router.back()}
        style={[styles.exitButton, { top: insets.top + 12 }]}
        variant="dark"
      />

      {id && !p3.viewer_is_author && (
        <ReportModal
          visible={reportVisible}
          onClose={() => setReportVisible(false)}
          targetType="thought"
          targetId={id}
          targetUserId={p1.user?.id}
          onReported={() => setReportVisible(false)}
        />
      )}
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
    fontSize: 29,
    lineHeight: 33,
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
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    marginLeft: 8,
  },
  ownerActionText: {
    fontFamily: typography.metadata.fontFamily,
    fontSize: 16.5,
    lineHeight: 16.5,
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
    fontSize: 14.5,
    lineHeight: 20,
    color: "rgba(255,255,255,0.7)",
  },
  panelEmpty: {
    ...typography.context,
    fontSize: 14.5,
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
    ...typography.context,
    fontSize: 13.5,
    lineHeight: 18,
    color: colors.TYPE_WHITE,
  },
  replyPillButton: {
    marginTop: 8,
    marginBottom: 32,
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
});
