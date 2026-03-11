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
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { colors, spacing, fontFamily } from "../../theme";
import { ProfileThoughtCard } from "../../components/ProfileThoughtCard";
import {
  getMyUserId,
  fetchProfile,
  updateProfile,
  deleteThought,
  type ProfileResponse,
  type ProfileThought,
} from "../../lib/api";

export default function MeScreen() {
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

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
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
    (thought: ProfileThought) => {
      Alert.alert(
        "Delete thought",
        "This will remove the thought from your profile. Conversations that started from it are not affected.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteThought(thought.id);
                setProfile((prev) =>
                  prev
                    ? { ...prev, thoughts: prev.thoughts.filter((t) => t.id !== thought.id) }
                    : null
                );
              } catch {
                Alert.alert("Error", "Could not delete thought");
              }
            },
          },
        ]
      );
    },
    []
  );

  if (!myUserId) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.hint}>
            Set EXPO_PUBLIC_MOCK_USER_ID to your user id to see your profile.
          </Text>
        </View>
      </View>
    );
  }

  if (loading && !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonPhoto} />
        <View style={styles.skeletonName} />
        <ActivityIndicator size="small" color={colors.TYPE_MUTED} style={styles.loader} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
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
      {/* Hero photo with gradient */}
      <View style={styles.heroWrap}>
        {profile.photo_url ? (
          <Image
            source={{ uri: profile.photo_url }}
            style={styles.heroPhoto}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.heroPhoto, styles.heroPhotoEmpty]} />
        )}
        <LinearGradient
          colors={["transparent", colors.PANEL_DEEP]}
          style={styles.heroGradient}
          start={{ x: 0.5, y: 0.1 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>

      {/* Name */}
      <Text style={styles.name}>{profile.name || "—"}</Text>

      {/* Action buttons */}
      {editing ? (
        <View style={styles.editSection}>
          <TextInput
            style={styles.nameInput}
            placeholder="Name"
            placeholderTextColor="rgba(245,240,234,0.3)"
            value={editName}
            onChangeText={setEditName}
          />
          <TextInput
            style={styles.photoUrlInput}
            placeholder="Photo URL (https://...)"
            placeholderTextColor="rgba(245,240,234,0.3)"
            value={editPhotoUrl}
            onChangeText={setEditPhotoUrl}
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
          <TouchableOpacity style={styles.glassBtn}>
            <Text style={styles.glassBtnText}>Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Deck */}
      <Text style={styles.deckTitle}>DECK</Text>
      {profile.thoughts.length === 0 ? (
        <Text style={styles.emptyDeck}>Your deck will appear here.</Text>
      ) : (
        profile.thoughts.map((t) => (
          <View key={t.id} style={[styles.thoughtWrap, { width: width - spacing.screenPadding * 2 }]}>
            <ProfileThoughtCard
              thought={t}
              onLongPress={() => handleDeleteThought(t)}
              dark
              authorName={profile.name ?? undefined}
            />
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.PANEL_DEEP,
  },
  content: {
    paddingBottom: 40,
  },
  heroWrap: {
    width: "100%",
    height: 140,
    marginBottom: -20,
  },
  heroPhoto: {
    width: "100%",
    height: "100%",
  },
  heroPhotoEmpty: {
    backgroundColor: "rgba(245,240,234,0.06)",
  },
  heroGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
  },
  name: {
    fontFamily: fontFamily.comico,
    fontSize: 16,
    color: colors.WARM_GROUND,
    textAlign: "center",
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 28,
  },
  glassBtn: {
    backgroundColor: "rgba(245,240,234,0.08)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  glassBtnText: {
    fontFamily: fontFamily.comico,
    fontSize: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "rgba(245,240,234,0.6)",
  },
  editSection: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 28,
    alignItems: "center",
  },
  nameInput: {
    fontFamily: fontFamily.sentient,
    fontSize: 14,
    color: colors.WARM_GROUND,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(245,240,234,0.15)",
    borderRadius: 8,
    width: "100%",
    maxWidth: 260,
  },
  photoUrlInput: {
    fontFamily: fontFamily.sentient,
    fontSize: 10,
    color: colors.WARM_GROUND,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(245,240,234,0.15)",
    borderRadius: 8,
    width: "100%",
    maxWidth: 260,
    marginBottom: 12,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
  },
  saveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: colors.OLIVE,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    fontFamily: fontFamily.comico,
    fontSize: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.TYPE_WHITE,
  },
  deckTitle: {
    fontFamily: fontFamily.comico,
    fontSize: 7,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "rgba(245,240,234,0.35)",
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 12,
  },
  thoughtWrap: {
    marginBottom: spacing.cardGap,
    paddingHorizontal: spacing.screenPadding,
  },
  emptyDeck: {
    fontFamily: fontFamily.sentient,
    fontSize: 11,
    color: "rgba(245,240,234,0.35)",
    textAlign: "center",
    marginTop: 8,
  },
  skeletonPhoto: {
    width: "100%",
    height: 140,
    backgroundColor: "rgba(245,240,234,0.04)",
  },
  skeletonName: {
    width: 120,
    height: 18,
    backgroundColor: "rgba(245,240,234,0.06)",
    borderRadius: 4,
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 16,
  },
  loader: { marginTop: 16, alignSelf: "center" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  hint: {
    fontFamily: fontFamily.sentient,
    fontSize: 11,
    color: "rgba(245,240,234,0.4)",
    textAlign: "center",
  },
  errorText: {
    fontFamily: fontFamily.sentient,
    fontSize: 11,
    color: "rgba(245,240,234,0.6)",
    marginBottom: 12,
  },
  retryText: {
    color: colors.OLIVE,
    fontFamily: fontFamily.comico,
    fontSize: 7,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
