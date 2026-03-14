import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../../theme";
import { ProfileThoughtCard } from "../../components/ProfileThoughtCard";
import { CrossingCard } from "../../components/CrossingCard";
import { CollaborativeCard } from "../../components/CollaborativeCard";
import { ScreenExitButton } from "../../components/ScreenExitButton";
import {
  fetchProfile,
  type ProfileResponse,
  type FeedItemCrossing,
  type FeedItemCollaborative,
} from "../../lib/api";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await fetchProfile(id);
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const navigationHeader = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>
      <ScreenExitButton onPress={() => router.back()} style={styles.headerExit} />
    </View>
  );

  if (!id) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.centered}>
          <Text style={styles.hint}>Missing user</Text>
        </View>
      </View>
    );
  }

  if (loading && !profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        {navigationHeader}
        <View style={[styles.photoWrap, styles.skeletonPhoto]} />
        <View style={styles.skeletonName} />
        <ActivityIndicator size="small" color={colors.TYPE_MUTED} style={styles.loader} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        {navigationHeader}
        <View style={styles.centered}>
          <Text style={styles.errorText}>Could not load profile</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const hasDeckContent =
    profile.thoughts.length > 0 ||
    (profile.collaborative_cards?.length ?? 0) > 0 ||
    (profile.crossings?.length ?? 0) > 0;

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {navigationHeader}

      <View style={styles.card}>
        <View style={styles.photoWrap}>
          {profile.photo_url ? (
            <Image source={{ uri: profile.photo_url }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]} />
          )}
        </View>
        <Text style={styles.name}>{profile.name || "—"}</Text>
      </View>

      <Text style={styles.deckTitle}>Deck</Text>
      {!hasDeckContent ? (
        <Text style={styles.emptyDeck}>No deck yet.</Text>
      ) : (
        profile.thoughts.map((t) => (
          <View key={t.id} style={[styles.thoughtWrap, { width: width - spacing.screenPadding * 2 }]}>
            <ProfileThoughtCard
              thought={t}
              authorName={profile.name ?? undefined}
              authorPhotoUrl={profile.photo_url}
              authorUserId={profile.id}
            />
          </View>
        ))
      )}
      {profile.collaborative_cards?.map((c) => {
        const collaborativeItem: FeedItemCollaborative = {
          type: "collaborative",
          collaborative: {
            id: c.id,
            created_at: c.created_at ?? new Date().toISOString(),
          },
          participant_a: c.participant_a ?? {
            id: "",
            name: null,
            photo_url: null,
            before: "",
            after: "",
          },
          participant_b: c.participant_b ?? {
            id: "",
            name: null,
            photo_url: null,
            before: "",
            after: "",
          },
        };
        return (
          <View key={`cc-${c.id}`} style={[styles.thoughtWrap, { width: width - spacing.screenPadding * 2 }]}>
            <CollaborativeCard item={collaborativeItem} />
          </View>
        );
      })}
      {profile.crossings?.map((c) => {
        const crossingItem: FeedItemCrossing = {
          type: "crossing",
          crossing: {
            id: c.id,
            sentence: c.sentence,
            context: c.context,
            created_at: c.created_at ?? new Date().toISOString(),
          },
          participant_a: c.participant_a ?? { id: "", name: null, photo_url: null },
          participant_b: c.participant_b ?? { id: "", name: null, photo_url: null },
          warmth_level: "none",
        };
        return (
          <View key={c.id} style={[styles.thoughtWrap, { width: width - spacing.screenPadding * 2 }]}>
            <CrossingCard item={crossingItem} visible />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WARM_GROUND,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 8,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 8,
  },
  backBtn: {
    padding: 10,
  },
  backArrow: {
    fontSize: 36,
    color: colors.TYPE_DARK,
  },
  headerExit: {
    marginLeft: 12,
  },
  card: {
    backgroundColor: colors.CARD_GROUND,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    alignItems: "center",
  },
  photoWrap: {
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
  },
  photoEmpty: {
    backgroundColor: colors.TYPE_MUTED,
    opacity: 0.5,
  },
  skeletonPhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.CARD_GROUND,
    opacity: 0.6,
  },
  skeletonName: {
    width: 120,
    height: 18,
    backgroundColor: colors.CARD_GROUND,
    opacity: 0.6,
    marginBottom: 16,
  },
  loader: { marginTop: 16 },
  name: {
    ...typography.label,
    fontSize: 14,
    color: colors.TYPE_DARK,
    marginBottom: 8,
  },
  deckTitle: {
    ...typography.label,
    fontSize: 8,
    color: colors.TYPE_MUTED,
    marginBottom: 12,
  },
  thoughtWrap: {
    marginBottom: spacing.cardGap,
  },
  emptyDeck: {
    ...typography.replyInput,
    fontSize: 11,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    marginTop: 8,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  hint: {
    ...typography.context,
    color: colors.TYPE_MUTED,
  },
  errorText: {
    ...typography.context,
    color: colors.TYPE_DARK,
    marginBottom: 12,
  },
  retryText: {
    color: colors.OLIVE,
    ...typography.label,
  },
});
