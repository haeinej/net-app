import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import Animated, { FadeInUp } from "react-native-reanimated";
import { colors, shared, typography, computeCardFontSize } from "../../theme";
import { useCardDeckStore } from "../../hooks/stores/cardDeckStore";
import { SkeletonCard, SkeletonGrid } from "../../components/ui/Skeleton";
import { TopBar } from "../../components/ui/TopBar";
import { PuzzleGrid } from "../../components/feed/PuzzleGrid";
import { CardGestures } from "../../components/card/CardGestures";
import { ContextOverlay } from "../../components/card/ContextOverlay";
import { AnimatedPressable } from "../../components/ui/AnimatedPressable";
import { useEngagementTracking } from "../../hooks/useEngagementTracking";
import * as api from "../../lib/api";
import { formatRelativeTime } from "../../lib/format";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../../assets/images/ohm-logo.png");

type Segment = "explore" | "friends";

// ── Keyword text component ──────────────────────────
function KeywordText({ sentence, keywords, style }: { sentence: string; keywords: string[]; style: any }) {
  if (!keywords?.length) return <Text style={style}>{sentence}</Text>;
  const lk = keywords.map(k => k.toLowerCase());
  const words = sentence.split(/(\s+)/);
  return (
    <Text style={style}>
      {words.map((w, i) => {
        const isKw = lk.includes(w.toLowerCase().replace(/[.,!?;:'"]/g, ""));
        return isKw ? <Text key={i} style={{ color: shared.WARM_ORANGE }}>{w}</Text> : w;
      })}
    </Text>
  );
}

// ── Explore Card (immersive) ────────────────────────
function ExploreCard({ card, onNext }: { card: any; onNext: () => void }) {
  const isDark = card.background === "black" || typeof card.background === "object";
  const isPhoto = typeof card.background === "object";
  const textColor = isDark ? "#F0EBE5" : "#1A1A16";
  const fontSize = computeCardFontSize(card.sentence.length);

  return (
    <Animated.View
      entering={FadeInUp.duration(250).springify().damping(20)}
      style={[styles.immersiveCard, {
        backgroundColor: isPhoto ? "#0A0A0A" : card.background === "black" ? "#0A0A0A" : "#FFFFFF",
      }]}
    >
      {isPhoto && card.background.photo && (
        <>
          <Image source={{ uri: card.background.photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.photoOverlay} />
        </>
      )}
      <View style={[styles.topFade, !isDark && styles.topFadeLight]} />
      <View style={styles.cardContent}>
        <KeywordText
          sentence={card.sentence}
          keywords={card.keywords ?? []}
          style={[typography.cardSentence(fontSize), { color: textColor }]}
        />
      </View>
      <View style={styles.authorBar}>
        {card.authorPhotoUrl && (
          <Image source={{ uri: card.authorPhotoUrl }} style={styles.authorDot} />
        )}
        {!card.authorPhotoUrl && <View style={[styles.authorDot, { backgroundColor: "#666" }]} />}
        <Text style={[styles.authorName, { color: isDark ? "rgba(240,235,229,0.3)" : "rgba(26,26,22,0.25)" }]}>
          {card.authorName ?? ""}
        </Text>
      </View>
      <View style={styles.bottomFade} />

      {/* Web: click to advance (native uses gestures) */}
      {Platform.OS === "web" && (
        <View style={styles.webSwipeHint}>
          <Pressable style={styles.webBtn} onPress={onNext}>
            <Text style={styles.webBtnText}>Next →</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

// ── Friends Feed Hook ───────────────────────────────
function useFriendsFeed() {
  const [items, setItems] = useState<api.FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const data = await api.fetchFriendsFeed(40);
      setItems(data.items);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetch();
  }, [fetch]);

  return { items, loading, refreshing, refresh };
}

// ── Map FeedItem → GridItem ─────────────────────────
function toGridItem(item: api.FeedItem) {
  const t = item.thought;
  let bg: "warm" | "black" | "white" | { photo: string } = "black";
  if (t.photo_url) bg = { photo: t.photo_url };
  else if (t.id.charCodeAt(0) % 2 === 0) bg = "white";
  return {
    id: t.id,
    sentence: t.sentence,
    keywords: t.keywords ?? [],
    background: bg,
    authorName: item.user.name ?? undefined,
  };
}

// ── Main Screen ─────────────────────────────────────
export default function ExploreScreen() {
  const [segment, setSegment] = useState<Segment>("explore");
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [contextVisible, setContextVisible] = useState(false);
  const [contextText, setContextText] = useState("");

  // Connect to the real store (cache + API)
  const { cards, loading, initialized, init, like, dismiss } = useCardDeckStore();
  const friendsFeed = useFriendsFeed();

  useEffect(() => {
    init();
  }, []);

  const currentCard = cards[0];

  // Track engagement events
  const { recordSwipeP2, recordSwipeP3 } = useEngagementTracking({
    thoughtId: currentCard?.id ?? "",
    visible: !!currentCard && segment === "explore",
  });

  const handleNext = useCallback(() => {
    recordSwipeP2();
    dismiss();
  }, [dismiss, recordSwipeP2]);

  const handleLike = useCallback(() => {
    recordSwipeP3();
    like();
  }, [like, recordSwipeP3]);

  const handleLongPress = useCallback(() => {
    if (!currentCard?.id) return;
    setContextText("");
    setContextVisible(true);
    // Fetch full context from API (not in feed cache)
    api.fetchThought(currentCard.id).then((detail) => {
      setContextText(detail.panel_2.context);
    }).catch(() => {});
  }, [currentCard]);

  // ── Friends segment ────────────────────────────────
  if (segment === "friends") {
    const gridItems = friendsFeed.items.map(toGridItem);
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopBar hasNotification={false} />
        <View style={styles.segmentBar}>
          <AnimatedPressable onPress={() => setSegment("explore")}>
            <Text style={styles.segmentText}>Explore</Text>
          </AnimatedPressable>
          <AnimatedPressable onPress={() => setSegment("friends")}>
            <Text style={[styles.segmentText, styles.segmentActive]}>Friends</Text>
          </AnimatedPressable>
        </View>
        {friendsFeed.loading ? (
          <SkeletonGrid count={6} />
        ) : gridItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Add friends to see how they think.</Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={friendsFeed.refreshing}
                onRefresh={friendsFeed.refresh}
                tintColor={shared.VERMILLION}
                colors={[shared.VERMILLION]}
                progressViewOffset={-10}
              />
            }
          >
            <PuzzleGrid items={gridItems} showAuthors />
            <View style={{ height: 100 }} />
          </ScrollView>
        )}
      </View>
    );
  }

  // ── Explore segment (immersive card deck) ──────────
  return (
    <View style={styles.immersive}>
      {/* Show skeleton while loading, or the real card */}
      {!initialized || (!currentCard && loading) ? (
        <SkeletonCard />
      ) : currentCard ? (
        <CardGestures
          onSwipeLeft={handleNext}
          onSwipeRight={handleLike}
          onLongPress={handleLongPress}
        >
          <ExploreCard card={currentCard} onNext={handleNext} />
        </CardGestures>
      ) : (
        <View style={[styles.container, styles.emptyState]}>
          <Text style={styles.emptyText}>You've seen everything. Come back later.</Text>
        </View>
      )}

      {/* Floating UI on top */}
      <StatusBar style="light" />
      <View style={[styles.floatingUI, { paddingTop: insets.top }]} pointerEvents="box-none">
        <TopBar hasNotification={true} />
        <View style={styles.segmentBar}>
          <AnimatedPressable onPress={() => setSegment("explore")}>
            <Text style={[styles.segmentText, styles.segmentActiveLight]}>Explore</Text>
          </AnimatedPressable>
          <AnimatedPressable onPress={() => setSegment("friends")}>
            <Text style={[styles.segmentText, { color: "rgba(255,255,255,0.3)" }]}>Friends</Text>
          </AnimatedPressable>
        </View>
      </View>

      {/* Context overlay (long-press) */}
      {currentCard && (
        <ContextOverlay
          visible={contextVisible}
          thoughtId={currentCard.id}
          sentence={currentCard.sentence ?? ""}
          context={contextText}
          authorId={currentCard.authorId ?? ""}
          authorName={currentCard.authorName ?? ""}
          authorPhotoUrl={currentCard.authorPhotoUrl}
          timeAgo={currentCard.createdAt ? formatRelativeTime(currentCard.createdAt) : ""}
          onClose={() => setContextVisible(false)}
          onSync={(replyText) => {
            setContextVisible(false);
            if (currentCard.authorId) {
              api.sendFriendRequest(currentCard.authorId, currentCard.id, replyText || undefined).catch(() => {});
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.BG },
  immersive: { flex: 1, position: "relative" },
  floatingUI: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  segmentBar: { flexDirection: "row", justifyContent: "center", gap: 16, paddingTop: 20 },
  segmentText: { fontSize: 11, fontWeight: "500" as const, color: colors.TYPE_MUTED, paddingBottom: 5 },
  segmentActive: { color: colors.TYPE_PRIMARY, borderBottomWidth: 1.5, borderBottomColor: colors.TYPE_PRIMARY },
  segmentActiveLight: { color: "rgba(255,255,255,0.85)", borderBottomWidth: 1.5, borderBottomColor: "rgba(255,255,255,0.7)" },

  // Immersive card
  immersiveCard: { flex: 1, position: "relative" },
  photoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  topFade: { position: "absolute", top: 0, left: 0, right: 0, height: 160, zIndex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  topFadeLight: { backgroundColor: "rgba(0,0,0,0.06)" },
  cardContent: { flex: 1, paddingHorizontal: 24, paddingTop: 140, zIndex: 2 },
  authorBar: { position: "absolute", bottom: 110, left: 20, flexDirection: "row", alignItems: "center", gap: 5, zIndex: 2 },
  authorDot: { width: 16, height: 16, borderRadius: 8 },
  authorName: { fontSize: 9, fontWeight: "400" as const },
  bottomFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 100, backgroundColor: "rgba(0,0,0,0.3)", zIndex: 1 },

  // Web
  webSwipeHint: { position: "absolute", bottom: 140, alignSelf: "center", zIndex: 10 },
  webBtn: { backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  webBtnText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "500" as const },

  // Empty
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.TYPE_MUTED, fontSize: 14, fontWeight: "300" as const },
});
