import { useState, useCallback, useEffect, useRef } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing, typography } from "../../theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { pickPrompt, EMPTY_STATE_PROMPTS } from "../../constants/prompts";
import { Header } from "../../components/Header";
import { SwipeableThoughtCard } from "../../components/SwipeableThoughtCard";
import { CrossingCard } from "../../components/CrossingCard";
import { CardDeck } from "../../components/CardDeck";
import { NotificationPanel } from "../../components/NotificationPanel";
import { OnboardingWalkthrough } from "../../components/OnboardingWalkthrough";
import {
  fetchFeed,
  fetchNotifications,
  acceptReply,
  ignoreReply,
  getMyUserId,
  deleteThought,
  editThought,
  type FeedItem,
  type NotificationItem,
} from "../../lib/api";

const WALKTHROUGH_SEEN_KEY = "ohm_walkthrough_seen_v2";
const PAGE_SIZE = 20;
const FOCUS_REFRESH_INTERVAL_MS = 60_000;

export default function WorldsScreen() {
  const router = useRouter();
  const { containerStyle } = useResponsiveLayout();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // Connection moment — the felt move from stranger to thinking partner
  const connectionOpacity = useSharedValue(0);
  const [connectionVisible, setConnectionVisible] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);

  const connectionOverlayStyle = useAnimatedStyle(() => ({
    opacity: connectionOpacity.value,
    pointerEvents: connectionOpacity.value > 0 ? "auto" as const : "none" as const,
  }));

  const inFlightFeed = useRef<Promise<void> | null>(null);
  const lastFocusRefreshAt = useRef(0);
  const [walkthroughVisible, setWalkthroughVisible] = useState(false);
  const postButtonRef = useRef<View>(null);
  const feedCardRef = useRef<View>(null);
  const conversationsTabRef = useRef<View>(null);
  const walkthroughRefs = useRef<Record<string, React.RefObject<View | null>>>({
    "walkthrough-post-button": postButtonRef,
    "walkthrough-feed-card": feedCardRef,
    "walkthrough-conversations-tab": conversationsTabRef,
  }).current;

  useEffect(() => {
    getMyUserId().then(setMyUserId).catch(() => setMyUserId(null));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(WALKTHROUGH_SEEN_KEY).then((val) => {
      if (val !== "true") {
        setTimeout(() => setWalkthroughVisible(true), 800);
      }
    });
  }, []);

  const handleWalkthroughComplete = useCallback(() => {
    setWalkthroughVisible(false);
    AsyncStorage.setItem(WALKTHROUGH_SEEN_KEY, "true");
  }, []);

  const handleFeedDelete = useCallback(async (thoughtId: string) => {
    try {
      await deleteThought(thoughtId);
      setFeed((prev) => prev.filter((f) => !(f.type === "thought" && f.thought.id === thoughtId)));
    } catch {
      // silent
    }
  }, []);

  const handleFeedEdit = useCallback(
    (thoughtId: string) => {
      const thought = feed.find((item) => item.type === "thought" && item.thought.id === thoughtId);
      if (!thought || thought.type !== "thought") return;

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
                await editThought(thoughtId, { sentence: nextSentence });
                setFeed((prev) =>
                  prev.map((item) =>
                    item.type === "thought" && item.thought.id === thoughtId
                      ? { ...item, thought: { ...item.thought, sentence: nextSentence } }
                      : item
                  )
                );
              } catch {
                // keep the old sentence on failure
              }
            },
          },
        ],
        "plain-text",
        thought.thought.sentence
      );
    },
    [feed]
  );

  const loadFeed = useCallback(
    async (off: number, append: boolean, opts: { isRefresh?: boolean } = {}) => {
      if (inFlightFeed.current) {
        // ignore overlapping calls
      }
      const { isRefresh } = opts;
      if (append) setLoadingMore(true);
      else if (isRefresh) setRefreshing(true);
      else if (off === 0) setLoading(true);

      setError(null);

      const p = (async () => {
        try {
          const items = await fetchFeed(PAGE_SIZE, off);
          setFeed((prev) => (append ? prev.concat(items) : items));
          setOffset(off + items.length);
          setHasMore(items.length === PAGE_SIZE);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Something went wrong");
        } finally {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
          inFlightFeed.current = null;
        }
      })();

      inFlightFeed.current = p;
      await p;
    },
    []
  );

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const items = await fetchNotifications();
      setNotifications(items);
    } catch {
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setOffset(0);
    loadNotifications();
    loadFeed(0, false, { isRefresh: true });
  }, [loadFeed, loadNotifications]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loadingMore || feed.length === 0) return;
    loadFeed(offset, true);
  }, [hasMore, loadingMore, feed.length, offset, loadFeed]);

  const openNotifications = useCallback(() => {
    setNotificationPanelOpen((prev) => {
      if (!prev) loadNotifications();
      return !prev;
    });
  }, [loadNotifications]);

  const handleAccept = useCallback(async (item: NotificationItem) => {
    try {
      const result = await acceptReply(item.reply_id);
      setNotificationPanelOpen(false);
      setNotifications((prev) => prev.filter((n) => n.reply_id !== item.reply_id));

      // Store the navigation for after the moment
      const navParams = {
        pathname: "/conversation/[id]" as const,
        params: {
          id: result.conversation_id,
          otherName: item.replier?.name ?? "",
          otherPhoto: item.replier?.photo_url ?? "",
          otherId: item.replier?.id ?? "",
          thoughtSentence: item.thought?.sentence ?? "",
        },
      };

      // The connection moment — a felt crossing, not a celebration
      setConnectionVisible(true);
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

      // Fade in warmth, hold, then navigate on fade out
      connectionOpacity.value = withSequence(
        // Rise: warmth arrives
        withTiming(1, { duration: 350, easing: Easing.out(Easing.ease) }),
        // Hold: the felt moment
        withTiming(1, { duration: 400 }),
        // Dissolve: transition to what comes next
        withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) })
      );

      // Navigate during the dissolve phase
      pendingNavRef.current = () => {
        setConnectionVisible(false);
        router.push(navParams);
      };
      setTimeout(() => {
        pendingNavRef.current?.();
        pendingNavRef.current = null;
      }, 850);
    } catch {
      // keep in list; user can retry
    }
  }, [router, connectionOpacity]);

  const handleIgnore = useCallback(async (replyId: string) => {
    try {
      await ignoreReply(replyId);
      setNotifications((prev) => {
        const next = prev.filter((n) => n.reply_id !== replyId);
        if (next.length === 0) setNotificationPanelOpen(false);
        return next;
      });
    } catch {
      // keep in list
    }
  }, []);

  const hasNotifications = notifications.length > 0;

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const shouldRefresh =
        feed.length === 0 || now - lastFocusRefreshAt.current > FOCUS_REFRESH_INTERVAL_MS;

      if (shouldRefresh) {
        lastFocusRefreshAt.current = now;
        loadFeed(0, false);
        loadNotifications();
      }
    }, [feed.length, loadFeed, loadNotifications])
  );

  return (
    <View style={styles.container}>
      <Header
        hasNotifications={hasNotifications}
        onNotificationPress={openNotifications}
        postButtonRef={postButtonRef}
      />
      {notificationPanelOpen && (
        <NotificationPanel
          items={notifications}
          loading={notificationsLoading}
          onAccept={handleAccept}
          onIgnore={handleIgnore}
        />
      )}
      {loading && feed.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.TYPE_MUTED} />
        </View>
      ) : error && feed.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.hint}>Pull down to retry</Text>
        </View>
      ) : feed.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{pickPrompt(EMPTY_STATE_PROMPTS)}</Text>
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) =>
            item.type === "thought"
              ? item.thought.id
              : item.type === "crossing"
                ? `crossing-${item.crossing.id}`
                : "hidden-crossing"
          }
          renderItem={({ item, index }) => (
            <View
              ref={index === 0 ? feedCardRef : undefined}
              collapsable={false}
              style={[styles.cardWrap, containerStyle]}
            >
              <CardDeck layers={3}>
                {item.type === "thought" ? (
                  <SwipeableThoughtCard
                    item={item}
                    visible
                    isOwn={myUserId === item.user.id}
                    onDelete={handleFeedDelete}
                    onEdit={handleFeedEdit}
                  />
                ) : item.type === "crossing" ? (
                  <CrossingCard item={item} visible myUserId={myUserId} />
                ) : null}
              </CardDeck>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.TYPE_MUTED}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={colors.TYPE_MUTED} />
              </View>
            ) : null
          }
        />
      )}

      <View
        ref={conversationsTabRef}
        collapsable={false}
        style={styles.conversationsTabAnchor}
        pointerEvents="none"
      />

      <OnboardingWalkthrough
        visible={walkthroughVisible}
        onComplete={handleWalkthroughComplete}
        targetRefs={walkthroughRefs}
      />

      {/* Connection moment — the felt crossing from stranger to thinking partner */}
      {connectionVisible && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.connectionOverlay, connectionOverlayStyle]}>
          <LinearGradient
            colors={[colors.VERMILLION, colors.PANEL_DEEP]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WARM_GROUND,
  },
  list: { flex: 1 },
  listContent: {
    paddingTop: 16,
    paddingBottom: 48,
    alignItems: "center",
  },
  cardWrap: {
    marginBottom: spacing.cardGap + 4,
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 6,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyText: {
    ...typography.thoughtSentence,
    color: colors.TYPE_MUTED,
    fontSize: 12,
    textAlign: "center",
  },
  errorText: {
    ...typography.context,
    color: colors.TYPE_MUTED,
    fontSize: 10,
    textAlign: "center",
    lineHeight: 16,
  },
  hint: {
    ...typography.metadata,
    marginTop: 8,
    color: colors.TYPE_MUTED,
  },
  footer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  conversationsTabAnchor: {
    position: "absolute",
    bottom: 0,
    left: "33%",
    width: "34%",
    height: 56,
  },
  connectionOverlay: {
    zIndex: 100,
  },
});
