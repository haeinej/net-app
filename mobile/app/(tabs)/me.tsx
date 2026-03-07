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
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, spacing, typography } from "../../theme";
import { ProfileThoughtCard } from "../../components/ProfileThoughtCard";
import {
  getMyUserId,
  fetchProfile,
  updateProfile,
  deleteThought,
  type ProfileResponse,
  type ProfileThought,
} from "../../lib/api";

const INTERESTS_MAX = 3;

export default function MeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [editInterests, setEditInterests] = useState<string[]>(["", "", ""]);
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
      setEditInterests(
        (data.interests ?? []).length > 0
          ? [...(data.interests ?? []).slice(0, 3), "", "", ""].slice(0, 3)
          : ["", "", ""]
      );
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
      const i = (profile.interests ?? []).slice(0, 3);
      setEditInterests([i[0] ?? "", i[1] ?? "", i[2] ?? ""]);
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
      const interests = editInterests.map((s) => s.trim()).filter(Boolean);
      await updateProfile({
        name: editName.trim() || undefined,
        photo_url: editPhotoUrl.trim() || undefined,
        interests: interests.length > 0 ? interests : undefined,
      });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              name: editName.trim() || prev.name,
              photo_url: editPhotoUrl.trim() || prev.photo_url,
              interests: interests,
            }
          : null
      );
      setEditing(false);
    } catch {
      Alert.alert("Error", "Could not save profile");
    } finally {
      setSaving(false);
    }
  }, [profile, editName, editPhotoUrl, editInterests, saving]);

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
        <View style={[styles.photoWrap, styles.skeletonPhoto]} />
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
      <View style={styles.card}>
        <View style={styles.photoWrap}>
          {profile.photo_url && !editing ? (
            <Image
              source={{ uri: profile.photo_url }}
              style={styles.photo}
            />
          ) : editing ? (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>Photo URL</Text>
              <TextInput
                style={styles.photoUrlInput}
                placeholder="https://..."
                placeholderTextColor={colors.TYPE_MUTED}
                value={editPhotoUrl}
                onChangeText={setEditPhotoUrl}
              />
            </View>
          ) : (
            <View style={[styles.photo, styles.photoEmpty]} />
          )}
        </View>
        {editing ? (
          <>
            <TextInput
              style={styles.nameInput}
              placeholder="Name"
              placeholderTextColor={colors.TYPE_MUTED}
              value={editName}
              onChangeText={setEditName}
            />
            {editInterests.map((val, i) => (
              <TextInput
                key={i}
                style={styles.interestInput}
                placeholder={i === 0 ? "what you are into right now" : ""}
                placeholderTextColor={colors.TYPE_MUTED}
                value={val}
                onChangeText={(t) => {
                  const next = [...editInterests];
                  next[i] = t;
                  setEditInterests(next);
                }}
              />
            ))}
            <View style={styles.editActions}>
              <TouchableOpacity onPress={cancelEdit}>
                <Text style={styles.cancelBtn}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={saveEdit}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
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
            <TouchableOpacity style={styles.editBtn} onPress={startEdit}>
              <Text style={styles.editBtnText}>Edit profile</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={styles.deckTitle}>Thoughts</Text>
      {profile.thoughts.length === 0 ? (
        <Text style={styles.emptyDeck}>Your thoughts will appear here.</Text>
      ) : (
        profile.thoughts.map((t) => (
          <View key={t.id} style={[styles.thoughtWrap, { width: width - spacing.screenPadding * 2 }]}>
            <ProfileThoughtCard
              thought={t}
              onLongPress={() => handleDeleteThought(t)}
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
    backgroundColor: colors.WARM_GROUND,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.belowHeader,
    paddingBottom: 40,
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
  photoPlaceholder: {
    width: 80,
    alignItems: "center",
  },
  photoPlaceholderText: {
    ...typography.metadata,
    marginBottom: 4,
  },
  photoUrlInput: {
    ...typography.context,
    fontSize: 10,
    color: colors.TYPE_DARK,
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 6,
    width: "100%",
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
  nameInput: {
    ...typography.label,
    fontSize: 14,
    color: colors.TYPE_DARK,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 6,
    width: "100%",
    maxWidth: 240,
  },
  interestsWrap: {
    alignSelf: "stretch",
    marginBottom: 16,
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
  interestInput: {
    ...typography.context,
    fontSize: 10,
    color: colors.TYPE_DARK,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 6,
    marginBottom: 6,
    width: "100%",
    maxWidth: 280,
    alignSelf: "center",
  },
  editBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  editBtnText: {
    ...typography.label,
    fontSize: 8,
    color: colors.ACCENT_ORANGE,
  },
  editActions: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
  },
  cancelBtn: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
  },
  saveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: colors.ACCENT_ORANGE,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    ...typography.label,
    fontSize: 8,
    color: colors.TYPE_WHITE,
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
    textAlign: "center",
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
