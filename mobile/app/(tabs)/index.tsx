import { useState, useCallback, useEffect, useRef, memo } from "react";
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
import { colors, spacing, typography } from "../../theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { pickPrompt, EMPTY_STATE_PROMPTS } from "../../constants/prompts";
import { Header } from "../../components/Header";
import { OnboardingWalkthrough } from "../../components/OnboardingWalkthrough";
import { getWalkthroughComplete, setWalkthroughComplete } from "../../lib/auth-store";
import { SwipeableThoughtCard } from "../../components/SwipeableThoughtCard";
import { CrossingCard } from "../../components/CrossingCard";
import { CardDeck } from "../../components/CardDeck";
import { NotificationPanel } from "../../components/NotificationPanel";
import {
  fetchFeed,
  fetchNotifications,
  acceptReply,
  ignoreReply,
  ApiError,
  getMyUserId,
  deleteThought,
  editThought,
  fetchThought,
  deleteCrossing,
  editCrossing,
  type FeedItem,
  type NotificationItem,
} from "../../lib/api";

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
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [acceptingReplyId, setAcceptingReplyId] = useState<string | null>(null);

  const [walkthroughVisible, setWalkthroughVisible] = useState(false);

  const inFlightFeed = useRef<Promise<void> | null>(null);
  const lastFocusRefreshAt = useRef(0);
  const postButtonRef = useRef<View>(null);
  const feedCardRef = useRef<View>(null);

  const walkthroughRefs = useRef<Record<string, React.RefObject<View | null>>>({
    "walkthrough-post-button": postButtonRef,
    "walkthrough-feed-card": feedCardRef,
  }).current;

  useEffect(() => {
    getMyUserId().then(setMyUserId).catch(() => setMyUserId(null));
  }, []);

  // Show walkthrough on first visit after onboarding
  useEffect(() => {
    getWalkthroughComplete().then((done) => {
      if (!done) setWalkthroughVisible(true);
    });
  }, []);

  const handleWalkthroughComplete = useCallback(() => {
    setWalkthroughVisible(false);
    setWalkthroughComplete();
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

      const openContextPrompt = (nextSentence: string, existingContext: string) => {
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
                  await editThought(thoughtId, {
                    sentence: nextSentence,
                    context: nextContext,
                  });
                  setFeed((prev) =>
                    prev.map((item) =>
                      item.type === "thought" && item.thought.id === thoughtId
                        ? {
                            ...item,
                            thought: {
                              ...item.thought,
                              sentence: nextSentence,
                              has_context: nextContext.length > 0,
                            },
                          }
                        : item
                    )
                  );
                } catch {
                  // keep the existing thought on failure
                }
              },
            },
          ],
          "plain-text",
          existingContext
        );
      };

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

              try {
                const thoughtDetail = await fetchThought(thoughtId);
                openContextPrompt(nextSentence, thoughtDetail.panel_2.context ?? "");
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

  const handleCrossingDelete = useCallback(async (crossingId: string) => {
    try {
      await deleteCrossing(crossingId);
      setFeed((prev) => prev.filter((f) => !(f.type === "crossing" && f.crossing.id === crossingId)));
    } catch {
      // silent
    }
  }, []);

  const handleCrossingEdit = useCallback(
    (crossingId: string) => {
      const item = feed.find((f) => f.type === "crossing" && f.crossing.id === crossingId);
      if (!item || item.type !== "crossing") return;

      Alert.prompt(
        "Edit crossing",
        "Update the sentence:",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Next",
            onPress: async (newSentence?: string) => {
              const nextSentence = newSentence?.trim();
              if (!nextSentence) return;

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
                        await editCrossing(crossingId, {
                          sentence: nextSentence,
                          context: nextContext || undefined,
                        });
                        setFeed((prev) =>
                          prev.map((f) =>
                            f.type === "crossing" && f.crossing.id === crossingId
                              ? {
                                  ...f,
                                  crossing: {
                                    ...f.crossing,
                                    sentence: nextSentence,
                                    context: nextContext || null,
                                  },
                                }
                              : f
                          )
                        );
                      } catch {
                        // keep existing on failure
                      }
                    },
                  },
                ],
                "plain-text",
                item.crossing.context ?? ""
              );
            },
          },
        ],
        "plain-text",
        item.crossing.sentence
      );
    },
    [feed]
  );

  const loadFeed = useCallback(
    async (cursor: string | null, append: boolean, opts: { isRefresh?: boolean } = {}) => {
      if (inFlightFeed.current) {
        return inFlightFeed.current;
      }
      const { isRefresh } = opts;
      if (append) setLoadingMore(true);
      else if (isRefresh) setRefreshing(true);
      else if (!cursor) setLoading(true);

      setError(null);

      const p = (async () => {
        try {
          const page = await fetchFeed(PAGE_SIZE, cursor);
          setFeed((prev) => (append ? prev.concat(page.items) : page.items));
          setNextCursor(page.next_cursor);
          setHasMore(Boolean(page.next_cursor));
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
    setNextCursor(null);
    loadNotifications();
    loadFeed(null, false, { isRefresh: true });
  }, [loadFeed, loadNotifications]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loadingMore || feed.length === 0 || !nextCursor) return;
    loadFeed(nextCursor, true);
  }, [hasMore, loadingMore, feed.length, nextCursor, loadFeed]);

  const openNotifications = useCallback(() => {
    setNotificationPanelOpen((prev) => {
      if (!prev) loadNotifications();
      return !prev;
    });
  }, [loadNotifications]);

  const handleAccept = useCallback(async (item: NotificationItem) => {
    if (acceptingReplyId) return;
    setAcceptingReplyId(item.reply_id);

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
      router.push(navParams);
    } catch (err) {
      console.error("[handleAccept] failed:", err);
      if (err instanceof ApiError) {
        if (err.status === 401) {
          Alert.alert("Session expired", "Please log in again.");
          router.replace("/login");
          return;
        }

        const message =
          err.code === "REPLY_FORBIDDEN" || err.status === 403
            ? "You can only accept replies to your own thoughts."
            : err.code === "REPLY_NOT_FOUND" || err.status === 404
              ? "This reply is no longer available."
              : err.code === "REPLY_ALREADY_HANDLED" || err.status === 409
                ? "This reply was already handled."
                : err.code === "ACCEPT_REPLY_FAILED" || err.status >= 500
                  ? "Couldn't open chat right now. Please try again."
                  : err.message || "Couldn't open chat right now. Please try again.";
        Alert.alert("Couldn't open chat", message);
        return;
      }

      const message =
        err instanceof Error && err.message.includes("timeout")
          ? "Network timeout — check your connection and try again."
          : err instanceof Error && err.message.includes("reachable")
            ? "Can't reach the server — check your connection."
            : "Couldn't open chat right now. Please try again.";
      Alert.alert("Couldn't connect", message);
    } finally {
      setAcceptingReplyId(null);
    }
  }, [router, acceptingReplyId]);

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

  const handleThoughtReplySent = useCallback((thoughtId: string) => {
    setFeed((prev) => prev.filter((f) => !(f.type === "thought" && f.thought.id === thoughtId)));
  }, []);

  const handleCrossingReplySent = useCallback((crossingId: string) => {
    setFeed((prev) => prev.filter((f) => !(f.type === "crossing" && f.crossing.id === crossingId)));
  }, []);

  const hasNotifications = notifications.length > 0;

  const keyExtractor = useCallback(
    (item: FeedItem) =>
      item.type === "thought"
        ? item.thought.id
        : item.type === "crossing"
          ? `crossing-${item.crossing.id}`
          : "hidden-crossing",
    []
  );

  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => (
      <View
        ref={index === 0 ? feedCardRef : undefined}
        collapsable={false}
        style={[styles.cardWrap, containerStyle]}
      >
        <CardDeck>
          {item.type === "thought" ? (
            <SwipeableThoughtCard
              item={item}
              visible
              isOwn={Boolean(myUserId && item.user?.id && myUserId === item.user.id)}
              onDelete={handleFeedDelete}
              onEdit={handleFeedEdit}
              onReplySent={handleThoughtReplySent}
            />
          ) : item.type === "crossing" ? (
            <CrossingCard
              item={item}
              visible
              myUserId={myUserId}
              isOwn={Boolean(
                myUserId &&
                  (myUserId === item.participant_a.id || myUserId === item.participant_b.id)
              )}
              onDelete={handleCrossingDelete}
              onEdit={handleCrossingEdit}
              onReplySent={handleCrossingReplySent}
            />
          ) : null}
        </CardDeck>
      </View>
    ),
    [containerStyle, myUserId, handleFeedDelete, handleFeedEdit, handleCrossingDelete, handleCrossingEdit, handleThoughtReplySent, handleCrossingReplySent]
  );

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const shouldRefresh =
        feed.length === 0 || now - lastFocusRefreshAt.current > FOCUS_REFRESH_INTERVAL_MS;

      if (shouldRefresh) {
        lastFocusRefreshAt.current = now;
        loadFeed(null, false);
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
          acceptingReplyId={acceptingReplyId}
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
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          removeClippedSubviews
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
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
    paddingTop: 16,
    paddingBottom: 48,
    alignItems: "center",
  },
  cardWrap: {
    marginBottom: spacing.cardGap + 6,
    paddingHorizontal: 12,
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
});
