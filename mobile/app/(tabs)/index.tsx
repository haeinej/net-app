import { useState, useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing, typography } from "../../theme";
import { Header } from "../../components/Header";
import { SwipeableThoughtCard } from "../../components/SwipeableThoughtCard";
import { ShiftCard } from "../../components/ShiftCard";
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

const WALKTHROUGH_SEEN_KEY = "ohm_walkthrough_seen";

const PAGE_SIZE = 20;

export default function WorldsScreen() {
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

  useEffect(() => {
    getMyUserId().then(setMyUserId);
  }, []);

  const handleFeedDelete = useCallback(async (thoughtId: string) => {
    try {
      await deleteThought(thoughtId);
      setFeed((prev) => prev.filter((f) => !(f.type === "thought" && f.thought.id === thoughtId)));
    } catch {
      // silent
    }
  }, []);

  const handleFeedEdit = useCallback((thoughtId: string) => {
    const item = feed.find((f) => f.type === "thought" && f.thought.id === thoughtId);
    if (!item || item.type !== "thought") return;
    // Alert.prompt is iOS-only but fits ohm's target
    const { Alert } = require("react-native");
    Alert.prompt(
      "Edit thought",
      "Update your sentence:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: async (newSentence?: string) => {
            const s = newSentence?.trim();
            if (!s) return;
            try {
              await editThought(thoughtId, { sentence: s });
              setFeed((prev) =>
                prev.map((f) =>
                  f.type === "thought" && f.thought.id === thoughtId
                    ? { ...f, thought: { ...f.thought, sentence: s } }
                    : f
                )
              );
            } catch {
              Alert.alert("Error", "Could not edit thought");
            }
          },
        },
      ],
      "plain-text",
      item.thought.sentence
    );
  }, [feed]);

  // Walkthrough state
  const [walkthroughVisible, setWalkthroughVisible] = useState(false);
  const postButtonRef = useRef<View>(null);
  const feedCardRef = useRef<View>(null);
  const conversationsTabRef = useRef<View>(null);

  const walkthroughRefs = useRef<Record<string, React.RefObject<View | null>>>({
    "walkthrough-post-button": postButtonRef,
    "walkthrough-feed-card": feedCardRef,
    "walkthrough-conversations-tab": conversationsTabRef,
  }).current;

  // Check if walkthrough has been seen
  useEffect(() => {
    AsyncStorage.getItem(WALKTHROUGH_SEEN_KEY).then((val) => {
      if (val !== "true") {
        // Small delay to let the feed render first
        setTimeout(() => setWalkthroughVisible(true), 800);
      }
    });
  }, []);

  const handleWalkthroughComplete = useCallback(() => {
    setWalkthroughVisible(false);
    AsyncStorage.setItem(WALKTHROUGH_SEEN_KEY, "true");
  }, []);

  const loadFeed = useCallback(async (off: number, append: boolean) => {
    try {
      if (append) setLoadingMore(true);
      else if (off === 0) setLoading(true);
      setError(null);
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
    }
  }, []);

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
    setRefreshing(true);
    setOffset(0);
    loadFeed(0, false);
    loadNotifications();
  }, [loadFeed, loadNotifications]);

  const onMomentumScrollEnd = useCallback(() => {
    if (!hasMore || loadingMore || feed.length === 0) return;
    loadFeed(offset, true);
  }, [hasMore, loadingMore, feed.length, offset, loadFeed]);

  const openNotifications = useCallback(() => {
    setNotificationPanelOpen(true);
    loadNotifications();
  }, [loadNotifications]);

  const handleAccept = useCallback(async (replyId: string) => {
    try {
      await acceptReply(replyId);
      setNotifications((prev) => {
        const next = prev.filter((n) => n.reply_id !== replyId);
        if (next.length === 0) setNotificationPanelOpen(false);
        return next;
      });
    } catch {
      // keep in list; user can retry
    }
  }, []);

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

  useEffect(() => {
    loadFeed(0, false);
  }, [loadFeed]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      loadFeed(0, false);
      loadNotifications();
    }, [loadFeed, loadNotifications])
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
          <Text style={styles.emptyText}>Post your first thought.</Text>
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => (item.type === "thought" ? item.thought.id : `shift-${item.id}`)}
          renderItem={({ item, index }) => (
            <View
              ref={index === 0 ? feedCardRef : undefined}
              collapsable={false}
              style={styles.cardWrap}
            >
              {item.type === "thought" ? (
                <SwipeableThoughtCard
                  item={item}
                  isOwn={myUserId === item.user.id}
                  onDelete={handleFeedDelete}
                  onEdit={handleFeedEdit}
                />
              ) : (
                <ShiftCard item={item} />
              )}
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
          onEndReached={onMomentumScrollEnd}
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

      {/* Conversations tab ref anchor — positioned over the tab bar area */}
      <View
        ref={conversationsTabRef}
        collapsable={false}
        style={styles.conversationsTabAnchor}
        pointerEvents="none"
      />

      {/* Onboarding walkthrough overlay */}
      <OnboardingWalkthrough
        visible={walkthroughVisible}
        onComplete={handleWalkthroughComplete}
        targetRefs={walkthroughRefs}
      />
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
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.belowHeader,
    paddingBottom: spacing.cardGap,
  },
  cardWrap: {
    marginBottom: spacing.cardGap,
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
});
