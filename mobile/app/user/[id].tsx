import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  colors,
  spacing,
  typography,
  primitives,
  radii,
} from "../../theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { ProfileThoughtCard } from "../../components/ProfileThoughtCard";
import { CrossingCard } from "../../components/CrossingCard";
import { CardDeck } from "../../components/CardDeck";
import {
  fetchProfile,
  ApiError,
  isSessionInvalidError,
  setCachedUserId,
  blockUser,
  unblockUser,
  checkBlockStatus,
  getMyUserId,
  type ProfileResponse,
  type FeedItemCrossing,
} from "../../lib/api";
import { clearAuth } from "../../lib/auth-store";
import { ReportModal } from "../../components/ReportModal";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("Could not load profile");
  const [isBlocked, setIsBlocked] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const { containerStyle } = useResponsiveLayout();
  const targetId = Array.isArray(id) ? id[0] : id;

  const resetBrokenSession = useCallback(async () => {
    await clearAuth();
    setCachedUserId(null);
    router.replace("/login");
  }, [router]);

  const load = useCallback(async () => {
    if (!targetId) {
      setProfile(null);
      setErrorMessage("Missing user");
      setLoading(false);
      return;
    }
    if (!UUID_PATTERN.test(targetId)) {
      setProfile(null);
      setErrorMessage("Profile not found");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setErrorMessage("Could not load profile");
      const [data, myId] = await Promise.all([
        fetchProfile(targetId),
        getMyUserId(),
      ]);
      setProfile(data);
      setIsOwnProfile(myId === targetId);
      if (myId !== targetId) {
        checkBlockStatus(targetId).then(setIsBlocked).catch(() => {});
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setProfile(null);
        setErrorMessage("Profile not found");
        return;
      }
      if (isSessionInvalidError(error)) {
        await resetBrokenSession();
        return;
      }
      setProfile(null);
      setErrorMessage(error instanceof Error ? error.message : "Could not load profile");
    } finally {
      setLoading(false);
    }
  }, [resetBrokenSession, targetId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBlock = useCallback(async () => {
    if (!targetId) return;
    if (isBlocked) {
      Alert.alert("Unblock user?", "You will see their content again.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            try {
              await unblockUser(targetId);
              setIsBlocked(false);
            } catch {}
          },
        },
      ]);
    } else {
      Alert.alert(
        "Block user?",
        "Their content will be removed from your feed immediately. The ohm. team will be notified and will review the account.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Block",
            style: "destructive",
            onPress: async () => {
              try {
                await blockUser(targetId);
                setIsBlocked(true);
              } catch {}
            },
          },
        ]
      );
    }
  }, [targetId, isBlocked]);

  if (!targetId) {
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.skeletonPhoto} />
        <View style={styles.skeletonName} />
        <ActivityIndicator size="small" color={colors.TYPE_MUTED} style={styles.loader} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const deckItems: Array<
    | { kind: "thought"; date: string; data: (typeof profile.thoughts)[number] }
    | { kind: "crossing"; date: string; data: NonNullable<typeof profile.crossings>[number] }
  > = [];

  for (const thought of profile.thoughts) {
    deckItems.push({
      kind: "thought",
      date: thought.created_at ?? new Date(0).toISOString(),
      data: thought,
    });
  }

  for (const crossing of profile.crossings ?? []) {
    deckItems.push({
      kind: "crossing",
      date: crossing.created_at ?? new Date(0).toISOString(),
      data: crossing,
    });
  }

  deckItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[
          "rgba(255,252,245,0.035)",
          "rgba(255,252,245,0.015)",
          "transparent",
          "rgba(0,0,0,0.08)",
        ]}
        locations={[0, 0.15, 0.4, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>

      <View style={styles.photoOuter}>
        <View style={styles.photoInner}>
          {profile.photo_url ? (
            <Image source={{ uri: profile.photo_url }} style={styles.photoImage} contentFit="cover" />
          ) : (
            <View style={styles.photoEmpty} />
          )}
        </View>
      </View>

      <Text style={styles.name}>{profile.name || "—"}</Text>

      <View style={styles.actionRow}>
        {!isOwnProfile && (
          <>
            <TouchableOpacity
              style={styles.glassBtn}
              onPress={() => setReportVisible(true)}
            >
              <Text style={styles.glassBtnText}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.glassBtn, isBlocked && styles.glassBtnActive]}
              onPress={handleBlock}
            >
              <Text
                style={[
                  styles.glassBtnText,
                  isBlocked && styles.glassBtnActiveText,
                ]}
              >
                {isBlocked ? "Blocked" : "Block"}
              </Text>
            </TouchableOpacity>
          </>
        )}
        {isOwnProfile && (
          <View style={styles.glassBtn}>
            <Text style={styles.glassBtnText}>Your profile</Text>
          </View>
        )}
      </View>

      {targetId && (
        <ReportModal
          visible={reportVisible}
          onClose={() => setReportVisible(false)}
          targetType="user"
          targetId={targetId}
          targetUserId={targetId}
          onBlocked={() => setIsBlocked(true)}
        />
      )}

      {deckItems.length === 0 ? (
        <Text style={styles.emptyDeck}>No deck yet.</Text>
      ) : (
        deckItems.map((item) => {
          if (item.kind === "thought") {
            const thought = item.data;
            return (
              <View key={`t-${thought.id}`} style={[styles.thoughtWrap, containerStyle]}>
                <CardDeck layers={3}>
                  <ProfileThoughtCard
                    thought={thought}
                    authorName={profile.name ?? undefined}
                    authorPhotoUrl={profile.photo_url}
                    authorUserId={null}
                  />
                </CardDeck>
              </View>
            );
          }

          const crossing = item.data;
          const crossingItem: FeedItemCrossing = {
            type: "crossing",
            crossing: {
              id: crossing.id,
              sentence: crossing.sentence,
              context: crossing.context,
              created_at: crossing.created_at ?? new Date().toISOString(),
            },
            participant_a: crossing.participant_a ?? { id: "", name: null, photo_url: null },
            participant_b: crossing.participant_b ?? { id: "", name: null, photo_url: null },
          };

          return (
            <View key={`c-${crossing.id}`} style={[styles.thoughtWrap, containerStyle]}>
              <CardDeck layers={3}>
                <CrossingCard item={crossingItem} visible ignoreUserId={profile.id} />
              </CardDeck>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.TYPE_DARK,
  },
  content: {
    paddingBottom: 48,
    alignItems: "center",
  },
  backBtn: {
    alignSelf: "flex-start",
    padding: 10,
    marginLeft: spacing.screenPadding,
    marginBottom: 8,
  },
  backArrow: {
    fontSize: 36,
    color: colors.WARM_GROUND,
  },
  photoOuter: {
    alignSelf: "center",
    marginBottom: 12,
    width: 164,
    height: 164,
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: 74,
    borderTopRightRadius: 90,
    borderBottomRightRadius: 78,
    borderBottomLeftRadius: 86,
    transform: [{ rotate: "-2deg" }],
    shadowColor: colors.PANEL_DEEP,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
    backgroundColor: colors.TYPE_DARK,
  },
  photoInner: {
    width: 164,
    height: 164,
    overflow: "hidden",
    borderTopLeftRadius: 74,
    borderTopRightRadius: 90,
    borderBottomRightRadius: 78,
    borderBottomLeftRadius: 86,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoEmpty: {
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(245,240,234,0.06)",
  },
  name: {
    ...typography.headingLg,
    color: colors.WARM_GROUND,
    textAlign: "center",
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 36,
  },
  glassBtn: {
    ...primitives.buttonGlass,
  },
  glassBtnText: {
    ...primitives.buttonGlassText,
  },
  glassBtnActive: {
    backgroundColor: "rgba(235, 65, 1, 0.15)",
  },
  glassBtnActiveText: {
    color: "rgba(235, 65, 1, 0.7)",
  },
  thoughtWrap: {
    marginBottom: spacing.cardGap + 4,
    paddingHorizontal: spacing.screenPadding,
  },
  emptyDeck: {
    ...typography.body,
    color: "rgba(245,240,234,0.35)",
    textAlign: "center",
    marginTop: 12,
  },
  skeletonPhoto: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignSelf: "center",
    backgroundColor: "rgba(245,240,234,0.04)",
  },
  skeletonName: {
    width: 120,
    height: 20,
    backgroundColor: "rgba(245,240,234,0.06)",
    borderRadius: radii.pill,
    alignSelf: "center",
    marginTop: 18,
    marginBottom: 16,
  },
  loader: {
    marginTop: 16,
    alignSelf: "center",
  },
  centered: {
    ...primitives.centered,
  },
  hint: {
    ...typography.body,
    color: "rgba(245,240,234,0.4)",
    textAlign: "center",
  },
  errorText: {
    ...typography.body,
    color: "rgba(245,240,234,0.6)",
    marginBottom: 12,
  },
  retryText: {
    ...typography.label,
    textTransform: "uppercase",
    color: colors.WARM_GROUND,
  },
});
