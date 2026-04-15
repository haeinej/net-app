import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchFeed, type FeedItem } from "../../lib/api";

const FEED_CACHE_KEY = "ohm.feed.cache";
const PREFETCH_THRESHOLD = 3;
const BATCH_SIZE = 20;

interface CardData {
  id: string;
  sentence: string;
  context?: string;
  keywords?: string[];
  background: "white" | "black" | { photo: string };
  authorName?: string;
  authorPhotoUrl?: string;
  authorId?: string;
  hasContext: boolean;
  createdAt?: string;
}

interface CardDeckState {
  cards: CardData[];
  loading: boolean;
  initialized: boolean;
  cursor: string | null;

  // Actions
  init: () => Promise<void>;
  fetchMore: () => Promise<void>;
  like: () => CardData | undefined;
  dismiss: () => CardData | undefined;
  currentCard: () => CardData | undefined;
  remaining: () => number;
}

/** Convert API feed item to card data.
 * Handles both v1 data (no keywords, image_url from fal.ai) and v2 data.
 * Cards with photo_url or image_url get photo background.
 * Text-only cards alternate black/white based on sentence hash.
 */
function feedItemToCard(item: FeedItem): CardData {
  const thought = item.thought;

  // Photo: prefer photo_url (user uploaded), fallback to image_url (legacy generated)
  const photoUri = thought.photo_url || thought.image_url;

  // Text-only cards: deterministic B&W based on id hash (not random, so cache is stable)
  const bgChoice = thought.id.charCodeAt(0) % 2 === 0 ? "black" : "white";

  // Keywords from v2 API, or empty for v1 thoughts
  const keywords = (thought as any).keywords ?? [];

  // Synced card detection (has in_response_to = it's a reply/sync)
  const isSynced = !!(thought as any).in_response_to;

  return {
    id: thought.id,
    sentence: thought.sentence,
    keywords,
    background: photoUri ? { photo: photoUri } : bgChoice,
    authorName: item.user.name ?? undefined,
    authorPhotoUrl: item.user.photo_url ?? undefined,
    authorId: item.user.id,
    hasContext: thought.has_context,
    createdAt: thought.created_at,
  };
}

/** Save feed to AsyncStorage for instant load next time */
async function cacheFeed(cards: CardData[]): Promise<void> {
  try {
    const toCache = cards.slice(0, 30); // Cache max 30 cards
    await AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(toCache));
  } catch {}
}

/** Load cached feed from AsyncStorage */
async function loadCachedFeed(): Promise<CardData[]> {
  try {
    const raw = await AsyncStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CardData[];
  } catch {
    return [];
  }
}

export const useCardDeckStore = create<CardDeckState>((set, get) => ({
  cards: [],
  loading: false,
  initialized: false,
  cursor: null,

  /**
   * Initialize: load cached feed instantly, then fetch fresh in background.
   * User sees cards in <100ms from cache, then fresh data replaces it.
   */
  init: async () => {
    if (get().initialized) return;

    // Step 1: Load from cache instantly
    const cached = await loadCachedFeed();
    if (cached.length > 0) {
      set({ cards: cached, initialized: true });
    }

    // Step 2: Fetch fresh from API in background
    set({ loading: true });
    try {
      const response = await fetchFeed(BATCH_SIZE);
      const freshCards = response.items.map(feedItemToCard);

      if (freshCards.length > 0) {
        set({
          cards: freshCards,
          cursor: response.next_cursor,
          initialized: true,
          loading: false,
        });
        cacheFeed(freshCards);
      } else if (cached.length === 0) {
        // No cache, no API data = truly empty
        set({ initialized: true, loading: false });
      } else {
        set({ loading: false });
      }
    } catch {
      // API failed, but we still have cache
      set({ initialized: true, loading: false });
    }
  },

  /**
   * Prefetch next batch when queue runs low.
   * Called automatically after like/dismiss.
   */
  fetchMore: async () => {
    const { loading, cursor } = get();
    if (loading) return;

    set({ loading: true });
    try {
      const response = await fetchFeed(BATCH_SIZE, cursor);
      const newCards = response.items.map(feedItemToCard);

      set((state) => ({
        cards: [...state.cards, ...newCards],
        cursor: response.next_cursor,
        loading: false,
      }));

      // Update cache with current deck
      cacheFeed(get().cards);
    } catch {
      set({ loading: false });
    }
  },

  like: () => {
    const { cards, remaining, fetchMore } = get();
    if (cards.length === 0) return undefined;

    const liked = cards[0];
    const newCards = cards.slice(1);
    set({ cards: newCards });

    // Optimistic save — fire and forget
    import("../../lib/api").then(({ saveCard }) => {
      saveCard?.(liked.id).catch(() => {});
    });

    // Prefetch when running low
    if (newCards.length < PREFETCH_THRESHOLD) {
      fetchMore();
    }

    return liked;
  },

  dismiss: () => {
    const { cards, fetchMore } = get();
    if (cards.length === 0) return undefined;

    const dismissed = cards[0];
    const newCards = cards.slice(1);
    set({ cards: newCards });

    // Prefetch when running low
    if (newCards.length < PREFETCH_THRESHOLD) {
      fetchMore();
    }

    return dismissed;
  },

  currentCard: () => get().cards[0],
  remaining: () => get().cards.length,
}));
