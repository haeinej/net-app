import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
// SVG removed — using simple round photo with border
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, fontFamily } from "../../theme";
import { SwipeableThoughtCard } from "../../components/SwipeableThoughtCard";
import { CrossingCard } from "../../components/CrossingCard";
import { ShiftCard } from "../../components/ShiftCard";
import {
  getMyUserId,
  fetchProfile,
  isSessionInvalidError,
  setCachedUserId,
  updateProfile,
  deleteThought,
  editThought,
  type ProfileResponse,
  type FeedItemThought,
  type FeedItemCrossing,
  type FeedItemShift,
} from "../../lib/api";
import { clearAuth } from "../../lib/auth-store";

export default function MeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const photoSize = 170;
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const resetBrokenSession = useCallback(async () => {
    await clearAuth();
    setCachedUserId(null);
    setMyUserId(null);
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    getMyUserId().then(setMyUserId);
  }, []);

  const load = useCallback(async () => {
    const uid = await getMyUserId();
    if (!uid) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchProfile(uid);
      setProfile(data);
      setEditName(data.name ?? "");
      setEditPhotoUrl(data.photo_url ?? "");
    } catch (error) {
      if (isSessionInvalidError(error)) {
        await resetBrokenSession();
        return;
      }
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [resetBrokenSession]);

  useEffect(() => {
    if (myUserId) load();
  }, [myUserId, load]);

  const startEdit = useCallback(() => {
    if (profile) {
      setEditName(profile.name ?? "");
      setEditPhotoUrl(profile.photo_url ?? "");
      setEditing(true);
    }
  }, [profile]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const pickPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setEditPhotoUrl(result.assets[0].uri);
    }
  }, []);

  const saveEdit = useCallback(async () => {
    if (!profile || saving) return;
    setSaving(true);
    try {
      await updateProfile({
        name: editName.trim() || undefined,
        photo_url: editPhotoUrl.trim() || undefined,
      });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              name: editName.trim() || prev.name,
              photo_url: editPhotoUrl.trim() || prev.photo_url,
            }
          : null
      );
      setEditing(false);
    } catch {
      Alert.alert("Error", "Could not save profile");
    } finally {
      setSaving(false);
    }
  }, [profile, editName, editPhotoUrl, saving]);

  const handleDeleteThought = useCallback(
    async (thoughtId: string) => {
      try {
        await deleteThought(thoughtId);
        setProfile((prev) =>
          prev
            ? { ...prev, thoughts: prev.thoughts.filter((t) => t.id !== thoughtId) }
            : null
        );
      } catch {
        Alert.alert("Error", "Could not delete thought");
      }
    },
    []
  );

  const handleEditThought = useCallback(
    (thoughtId: string) => {
      const thought = profile?.thoughts.find((t) => t.id === thoughtId);
      if (!thought) return;
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
                setProfile((prev) =>
                  prev
                    ? {
                        ...prev,
                        thoughts: prev.thoughts.map((t) =>
                          t.id === thoughtId ? { ...t, sentence: s } : t
                        ),
                      }
                    : null
                );
              } catch {
                Alert.alert("Error", "Could not edit thought");
              }
            },
          },
        ],
        "plain-text",
        thought.sentence
      );
    },
    [profile]
  );

  if (!myUserId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.centered}>
          <Text style={styles.hint}>
            Your session has ended. Log in again to manage your profile.
          </Text>
          <TouchableOpacity
            style={styles.reauthButton}
            onPress={() => router.replace("/login")}
          >
            <Text style={styles.reauthButtonText}>Go to login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading && !profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.skeletonPhoto} />
        <View style={styles.skeletonName} />
        <ActivityIndicator size="small" color={colors.TYPE_MUTED} style={styles.loader} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
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
    (profile.shifts?.length ?? 0) > 0 ||
    (profile.crossings?.length ?? 0) > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile photo — clean round with warm white border */}
      <View style={[styles.photoCircle, { width: photoSize, height: photoSize, borderRadius: photoSize / 2 }]}>
        {profile.photo_url ? (
          <Image source={{ uri: profile.photo_url }} style={{ width: photoSize - 8, height: photoSize - 8, borderRadius: (photoSize - 8) / 2 }} contentFit="cover" />
        ) : (
          <View style={{ width: photoSize - 8, height: photoSize - 8, borderRadius: (photoSize - 8) / 2, backgroundColor: "rgba(245,240,234,0.08)" }} />
        )}
      </View>

      {/* Name */}
      <Text style={styles.name}>{profile.name || "—"}</Text>

      {/* Action buttons */}
      {editing ? (
        <View style={styles.editSection}>
          <TouchableOpacity onPress={pickPhoto} style={styles.editPhotoWrap} activeOpacity={0.7}>
            <View style={[styles.editPhotoCircle]}>
              {editPhotoUrl ? (
                <Image source={{ uri: editPhotoUrl }} style={styles.editPhotoImage} contentFit="cover" />
              ) : (
                <View style={[styles.editPhotoImage, styles.photoEmpty]} />
              )}
            </View>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.nameInput}
            placeholder="Name"
            placeholderTextColor="rgba(245,240,234,0.3)"
            value={editName}
            onChangeText={setEditName}
          />
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.glassBtn} onPress={cancelEdit}>
              <Text style={styles.glassBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={saveEdit}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.glassBtn} onPress={startEdit}>
            <Text style={styles.glassBtnText}>Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.glassBtn}
            onPress={() => router.push("/settings" as Href)}
          >
            <Text style={styles.glassBtnText}>Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {!hasDeckContent ? (
        <Text style={styles.emptyDeck}>Your deck will appear here.</Text>
      ) : (
        profile.thoughts.map((t) => {
          const feedItem: FeedItemThought = {
            type: "thought",
            thought: {
              id: t.id,
              sentence: t.sentence,
              photo_url: t.photo_url,
              image_url: t.image_url,
              created_at: t.created_at ?? new Date().toISOString(),
              has_context: false,
            },
            user: {
              id: myUserId ?? "",
              name: profile.name,
              photo_url: profile.photo_url,
            },
            warmth_level: t.warmth_level,
          };
          return (
            <View key={t.id} style={styles.thoughtWrap}>
              <SwipeableThoughtCard
                item={feedItem}
                visible
                isOwn
                onDelete={handleDeleteThought}
                onEdit={handleEditThought}
              />
            </View>
          );
        })
      )}

      {profile.shifts && profile.shifts.length > 0 && (
        profile.shifts.map((s) => {
          const shiftItem: FeedItemShift = {
            type: "shift",
            id: s.id,
            created_at: s.created_at ?? new Date().toISOString(),
            participant_a: s.participant_a,
            participant_b: s.participant_b,
          };
          return (
            <View key={s.id} style={styles.thoughtWrap}>
              <ShiftCard item={shiftItem} />
            </View>
          );
        })
      )}

      {/* Crossings */}
      {profile.crossings && profile.crossings.length > 0 && (
        profile.crossings.map((c) => {
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
            <View key={c.id} style={styles.thoughtWrap}>
              <CrossingCard item={crossingItem} visible />
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
    backgroundColor: colors.OLIVE,
  },
  content: {
    paddingBottom: 48,
    alignItems: "center",
    paddingTop: 16,
  },

  /* ── Photo ── */
  photoCircle: {
    alignSelf: "center",
    marginBottom: 10,
    backgroundColor: "rgba(245,240,234,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── Name ── */
  name: {
    fontFamily: fontFamily.comico,
    fontSize: 32,
    color: colors.WARM_GROUND,
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: -0.5,
  },

  /* ── Action pills ── */
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 36,
  },
  glassBtn: {
    backgroundColor: "rgba(245,240,234,0.08)",
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 24,
  },
  glassBtnText: {
    fontFamily: fontFamily.comico,
    fontSize: 8,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(245,240,234,0.45)",
  },

  /* ── Edit mode ── */
  editSection: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 32,
    alignItems: "center",
  },
  nameInput: {
    fontFamily: fontFamily.sentient,
    fontSize: 15,
    color: colors.WARM_GROUND,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "rgba(245,240,234,0.15)",
    borderRadius: 999,
    width: "100%",
    maxWidth: 260,
  },
  editPhotoWrap: {
    alignItems: "center",
    marginBottom: 18,
  },
  editPhotoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
    backgroundColor: "rgba(245,240,234,0.06)",
  },
  editPhotoImage: {
    width: "100%",
    height: "100%",
    borderRadius: 40,
  },
  changePhotoText: {
    fontFamily: fontFamily.sentient,
    fontSize: 11,
    letterSpacing: 0.2,
    color: "rgba(245,240,234,0.5)",
    marginTop: 8,
  },
  editActions: {
    flexDirection: "row",
    gap: 10,
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: "rgba(245,240,234,0.15)",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    fontFamily: fontFamily.comico,
    fontSize: 8,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.WARM_GROUND,
  },

  /* ── Deck ── */
  deckTitle: {
    fontFamily: fontFamily.comico,
    fontSize: 7,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "rgba(245,240,234,0.35)",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 12,
  },
  thoughtWrap: {
    marginBottom: spacing.cardGap,
    paddingHorizontal: spacing.screenPadding,
  },
  emptyDeck: {
    fontFamily: fontFamily.sentient,
    fontSize: 12,
    color: "rgba(245,240,234,0.35)",
    textAlign: "center",
    marginTop: 12,
  },

  /* ── Loading skeleton ── */
  skeletonPhoto: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignSelf: "center",
    backgroundColor: "rgba(245,240,234,0.04)",
  },
  skeletonName: {
    width: 100,
    height: 20,
    backgroundColor: "rgba(245,240,234,0.06)",
    borderRadius: 999,
    alignSelf: "center",
    marginTop: 18,
    marginBottom: 16,
  },
  loader: { marginTop: 16, alignSelf: "center" },

  /* ── States ── */
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  hint: {
    fontFamily: fontFamily.sentient,
    fontSize: 12,
    color: "rgba(245,240,234,0.4)",
    textAlign: "center",
  },
  reauthButton: {
    marginTop: 14,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.WARM_GROUND,
  },
  reauthButtonText: {
    color: colors.PANEL_DEEP,
    fontFamily: fontFamily.comico,
    fontSize: 8,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  errorText: {
    fontFamily: fontFamily.sentient,
    fontSize: 12,
    color: "rgba(245,240,234,0.6)",
    marginBottom: 12,
  },
  retryText: {
    color: colors.WARM_GROUND,
    fontFamily: fontFamily.comico,
    fontSize: 8,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  photoEmpty: {},
});
