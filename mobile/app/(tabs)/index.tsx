import { useState, useCallback, useEffect, useRef, memo } from "react";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
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
import { CardDeck } from "../../components/CardDeck";
import {
  fetchFeed,
  ApiError,
  getMyUserId,
  deleteThought,
  editThought,
  fetchThought,
  type FeedItem,
} from "../../lib/api";

const PAGE_SIZE = 3;
/** Refresh feed once per day (24 h). The API snapshot also uses a 24-hour TTL,
 *  so pulling fresh data more often wouldn't change the result. */
const FOCUS_REFRESH_INTERVAL_MS = 24 * 60 * 60_000;

export default function WorldsScreen() {
  const router = useRouter();
  const { containerStyle } = useResponsiveLayout();
  const params = useLocalSearchParams<{ anchor?: string }>();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

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

  const anchorRef = useRef<string | null>(null);

  // Pick up anchor from post screen navigation
  useEffect(() => {
    if (params.anchor) {
      anchorRef.current = params.anchor;
    }
  }, [params.anchor]);

  const loadFeed = useCallback(
    async (opts: { isRefresh?: boolean } = {}) => {
      if (inFlightFeed.current) {
        return inFlightFeed.current;
      }
      const { isRefresh } = opts;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);
      const anchor = anchorRef.current;
      anchorRef.current = null;

      const p = (async () => {
        try {
          const page = await fetchFeed(PAGE_SIZE, null, anchor);
          setFeed(page.items.slice(0, PAGE_SIZE));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Something went wrong");
        } finally {
          setLoading(false);
          setRefreshing(false);
          inFlightFeed.current = null;
        }
      })();

      inFlightFeed.current = p;
      await p;
    },
    []
  );

  const onRefresh = useCallback(() => {
    loadFeed({ isRefresh: true });
  }, [loadFeed]);

  const keyExtractor = useCallback(
    (item: FeedItem) =>
      item.type === "thought"
        ? item.thought.id
        : "unknown",
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
            />
          ) : null}
        </CardDeck>
      </View>
    ),
    [containerStyle, myUserId, handleFeedDelete, handleFeedEdit]
  );

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const shouldRefresh =
        feed.length === 0 || now - lastFocusRefreshAt.current > FOCUS_REFRESH_INTERVAL_MS;

      if (shouldRefresh) {
        lastFocusRefreshAt.current = now;
        loadFeed();
      }
    }, [feed.length, loadFeed])
  );

  return (
    <View style={styles.container}>
      <Header
        postButtonRef={postButtonRef}
      />
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
          scrollEnabled
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.TYPE_MUTED}
            />
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
});
