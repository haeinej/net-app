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
import { colors, spacing, typography } from "../../theme";
import { ProfileThoughtCard } from "../../components/ProfileThoughtCard";
import { fetchProfile, type ProfileResponse } from "../../lib/api";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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

  if (!id) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.hint}>Missing user</Text>
        </View>
      </View>
    );
  }

  if (loading && !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.photoWrap, styles.skeletonPhoto]} />
        <View style={styles.skeletonName} />
        <ActivityIndicator size="small" color={colors.TYPE_MUTED} style={styles.loader} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Could not load profile</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.photoWrap}>
          {profile.photo_url ? (
            <Image source={{ uri: profile.photo_url }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]} />
          )}
        </View>
        <Text style={styles.name}>{profile.name || "—"}</Text>
        <View style={styles.interestsWrap}>
          {(profile.interests ?? []).length > 0
            ? (profile.interests ?? []).map((s, i) => (
                <Text key={i} style={styles.interest}>
                  {s}
                </Text>
              ))
            : (
                <Text style={styles.interestPlaceholder}>
                  what you are into right now
                </Text>
              )}
        </View>
      </View>

      <Text style={styles.deckTitle}>Thoughts</Text>
      {profile.thoughts.length === 0 ? (
        <Text style={styles.emptyDeck}>No thoughts yet.</Text>
      ) : (
        profile.thoughts.map((t) => (
          <View key={t.id} style={[styles.thoughtWrap, { width: width - spacing.screenPadding * 2 }]}>
            <ProfileThoughtCard thought={t} />
          </View>
        ))
      )}
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
    paddingVertical: 8,
    marginBottom: 8,
  },
  backBtn: {
    padding: 8,
  },
  backArrow: {
    fontSize: 24,
    color: colors.TYPE_DARK,
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
  interestsWrap: {
    alignSelf: "stretch",
  },
  interest: {
    ...typography.context,
    fontSize: 10,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    marginBottom: 4,
  },
  interestPlaceholder: {
    ...typography.context,
    fontSize: 10,
    color: colors.TYPE_MUTED,
    fontStyle: "italic",
    textAlign: "center",
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
    color: colors.ACCENT_ORANGE,
    ...typography.label,
  },
});
