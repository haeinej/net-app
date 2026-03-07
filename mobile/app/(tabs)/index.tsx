import { useState, useCallback, useEffect } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { colors, spacing, typography } from "../../theme";
import { Header } from "../../components/Header";
import { ThoughtCard } from "../../components/ThoughtCard";
import { ShiftCard } from "../../components/ShiftCard";
import { NotificationPanel } from "../../components/NotificationPanel";
import {
  fetchFeed,
  fetchNotifications,
  acceptReply,
  deleteReply,
  type FeedItem,
  type NotificationItem,
} from "../../lib/api";

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
  const { width } = useWindowDimensions();

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
      await deleteReply(replyId);
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
          renderItem={({ item }) => (
            <View style={[styles.cardWrap, { width: width - spacing.screenPadding * 2 }]}>
              {item.type === "thought" ? (
                <ThoughtCard item={item} />
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
    fontSize: 14,
  },
  errorText: {
    ...typography.context,
    color: colors.TYPE_DARK,
    fontSize: 12,
    textAlign: "center",
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
});
