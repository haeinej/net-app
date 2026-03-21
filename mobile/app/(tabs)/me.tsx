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
  Share,
  Modal,
  Pressable,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
// SVG removed — using simple round photo with border
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, fontFamily, shadows, typography, primitives, radii, opacity } from "../../theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { SwipeableThoughtCard } from "../../components/SwipeableThoughtCard";
import { CrossingCard } from "../../components/CrossingCard";
import { CardDeck } from "../../components/CardDeck";
import {
  getMyUserId,
  fetchProfile,
  fetchThought,
  isSessionInvalidError,
  setCachedUserId,
  updateProfile,
  deleteThought,
  editThought,
  fetchMyInvites,
  generateInvite,
  type ProfileResponse,
  type FeedItemThought,
  type FeedItemCrossing,
} from "../../lib/api";
import { clearAuth } from "../../lib/auth-store";

export default function MeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { containerStyle } = useResponsiveLayout();
  const photoSize = 170;
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [inviteRemaining, setInviteRemaining] = useState<number | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const menuSlide = useState(() => new Animated.Value(0))[0];

  const openMenu = useCallback(() => {
    setMenuVisible(true);
    Animated.spring(menuSlide, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
  }, [menuSlide]);

  const closeMenu = useCallback((cb?: () => void) => {
    Animated.timing(menuSlide, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setMenuVisible(false);
      if (cb) cb();
    });
  }, [menuSlide]);

  const resetBrokenSession = useCallback(async () => {
    await clearAuth();
    setCachedUserId(null);
    setMyUserId(null);
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    getMyUserId().then(setMyUserId).catch(() => setMyUserId(null));
  }, []);

  const load = useCallback(async () => {
    const uid = await getMyUserId();
    if (!uid) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [data, invites] = await Promise.all([
        fetchProfile(uid),
        fetchMyInvites().catch(() => ({ remaining: 0 })),
      ]);
      setProfile(data);
      setEditName(data.name ?? "");
      setEditPhotoUrl(data.photo_url ?? "");
      setInviteRemaining(invites.remaining);
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

  const handleInvite = useCallback(async () => {
    if (inviteRemaining === 0) {
      Alert.alert("No invites left", "You've used all your invite codes.");
      return;
    }
    try {
      const { code, remaining } = await generateInvite();
      setInviteRemaining(remaining);
      await Share.share({
        message: `Join me on ohm. — an app for honest, async conversation.\n\nUse my invite code: ${code}\n\nohm://invite/${code}`,
      });
    } catch (err) {
      if (err instanceof Error && err.message !== "User did not share") {
        Alert.alert("Error", err.message);
      }
    }
  }, [inviteRemaining]);

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
                  setProfile((prev) =>
                    prev
                      ? {
                          ...prev,
                          thoughts: prev.thoughts.map((t) =>
                            t.id === thoughtId ? { ...t, sentence: nextSentence } : t
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
                Alert.alert("Error", "Could not load the current context");
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

  // Merge thoughts + crossings into a single deck sorted by most recent
  const deckItems: Array<
    | { kind: "thought"; date: string; data: (typeof profile.thoughts)[number] }
    | { kind: "crossing"; date: string; data: NonNullable<typeof profile.crossings>[number] }
  > = [];

  for (const t of profile.thoughts) {
    deckItems.push({ kind: "thought", date: t.created_at ?? new Date(0).toISOString(), data: t });
  }
  for (const c of profile.crossings ?? []) {
    deckItems.push({ kind: "crossing", date: c.created_at ?? new Date(0).toISOString(), data: c });
  }

  deckItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const sheetTranslateY = menuSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={["rgba(255,252,245,0.035)", "rgba(255,252,245,0.015)", "transparent", "rgba(0,0,0,0.08)"]}
        locations={[0, 0.15, 0.4, 1]}
        style={styles.backgroundGlow}
        pointerEvents="none"
      />

      {/* ☰ Hamburger menu — top right */}
      <TouchableOpacity
        style={[styles.hamburger, { top: insets.top + 12 }]}
        onPress={openMenu}
        activeOpacity={0.6}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={styles.hamburgerLine} />
        <View style={styles.hamburgerLine} />
        <View style={styles.hamburgerLine} />
      </TouchableOpacity>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile photo — organic asymmetric round shape */}
        <View style={styles.photoOuter}>
          <View style={styles.photoInner}>
            {profile.photo_url ? (
              <Image source={{ uri: profile.photo_url }} style={styles.photoImage} contentFit="cover" />
            ) : (
              <View style={styles.photoEmpty} />
            )}
          </View>
        </View>

        {/* Name */}
        <Text style={styles.name}>{profile.name || "—"}</Text>

        {/* Edit mode (inline) */}
        {editing && (
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
        )}

        {deckItems.length === 0 ? (
          <Text style={styles.emptyDeck}>Your deck will appear here.</Text>
        ) : (
          deckItems.map((item) => {
            if (item.kind === "thought") {
              const t = item.data;
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
              };
              return (
                <View key={`t-${t.id}`} style={[styles.thoughtWrap, containerStyle]}>
                  <CardDeck>
                    <SwipeableThoughtCard
                      item={feedItem}
                      visible
                      isOwn
                      onDelete={handleDeleteThought}
                      onEdit={handleEditThought}
                    />
                  </CardDeck>
                </View>
              );
            }
            if (item.kind === "crossing") {
              const c = item.data;
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
              };
              return (
                <View key={`c-${c.id}`} style={[styles.thoughtWrap, containerStyle]}>
                  <CardDeck>
                    <CrossingCard item={crossingItem} visible myUserId={myUserId} />
                  </CardDeck>
                </View>
              );
            }
          })
        )}
      </ScrollView>

      {/* ─── Bottom sheet menu ─── */}
      <Modal visible={menuVisible} transparent animationType="none" onRequestClose={() => closeMenu()}>
        <Pressable style={styles.menuOverlay} onPress={() => closeMenu()}>
          <Animated.View
            style={[styles.menuSheet, { transform: [{ translateY: sheetTranslateY }] }]}
            onStartShouldSetResponder={() => true}
          >
            {/* Drag handle */}
            <View style={styles.menuHandle} />

            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.6}
              onPress={() => closeMenu(() => startEdit())}
            >
              <Text style={styles.menuRowText}>Edit Profile</Text>
            </TouchableOpacity>

            <View style={styles.menuSep} />

            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.6}
              onPress={() => closeMenu(() => handleInvite())}
            >
              <Text style={styles.menuRowText}>Invite Friends</Text>
              {inviteRemaining !== null && inviteRemaining > 0 && (
                <View style={styles.menuBadge}>
                  <Text style={styles.menuBadgeText}>{inviteRemaining}</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.menuSep} />

            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.6}
              onPress={() => closeMenu(() => router.push("/settings" as Href))}
            >
              <Text style={styles.menuRowText}>Settings</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ── Dark surface palette helpers ── */
const WARM = colors.WARM_GROUND; // #F5F0EA
const warmAlpha = (a: number) => `rgba(245,240,234,${a})`;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.TYPE_DARK,
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  backgroundGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    paddingBottom: 64,
    alignItems: "center",
    paddingTop: 16,
    flexGrow: 1,
  },

  /* ── Photo — organic asymmetric shape ── */
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

  /* ── Name ── */
  name: {
    ...typography.headingLg,
    color: WARM,
    textAlign: "center",
    marginBottom: 20,
  },

  /* ── Hamburger icon ── */
  hamburger: {
    position: "absolute",
    right: 20,
    zIndex: 20,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  hamburgerLine: {
    width: 22,
    height: 2,
    backgroundColor: warmAlpha(0.5),
    borderRadius: 1,
    marginVertical: 2.5,
  },

  /* ── Bottom sheet menu ── */
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: colors.WARM_GROUND,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 40,
    paddingTop: 12,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.12)",
    alignSelf: "center",
    marginBottom: 16,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  menuRowText: {
    ...typography.body,
    color: colors.TYPE_DARK,
    flex: 1,
  },
  menuSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0,0,0,0.08)",
    marginHorizontal: 24,
  },
  menuBadge: {
    backgroundColor: colors.VERMILLION,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  menuBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },

  /* ── Glass buttons (edit mode) ── */
  glassBtn: {
    ...primitives.buttonGlass,
  },
  glassBtnText: {
    ...primitives.buttonGlassText,
  },

  /* ── Edit mode ── */
  editSection: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 32,
    alignItems: "center",
  },
  nameInput: {
    ...primitives.inputDark,
    marginBottom: 12,
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
    backgroundColor: warmAlpha(0.06),
  },
  editPhotoImage: {
    width: "100%",
    height: "100%",
    borderRadius: 40,
  },
  changePhotoText: {
    ...typography.bodySmall,
    color: warmAlpha(0.5),
    marginTop: 8,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: radii.pill,
    backgroundColor: warmAlpha(0.15),
  },
  saveBtnDisabled: { opacity: opacity.disabled },
  saveBtnText: {
    ...typography.label,
    textTransform: "uppercase",
    color: WARM,
  },

  /* ── Deck ── */
  deckTitle: {
    ...typography.label,
    textTransform: "uppercase",
    color: warmAlpha(0.35),
    alignSelf: "flex-start",
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 12,
  },
  thoughtWrap: {
    marginBottom: spacing.cardGap + 6,
    width: "100%",
    alignItems: "center",
  },
  emptyDeck: {
    ...typography.body,
    color: warmAlpha(0.35),
    textAlign: "center",
    marginTop: 12,
  },

  /* ── Loading skeleton ── */
  skeletonPhoto: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignSelf: "center",
    backgroundColor: warmAlpha(0.04),
  },
  skeletonName: {
    width: 100,
    height: 20,
    backgroundColor: warmAlpha(0.06),
    borderRadius: radii.pill,
    alignSelf: "center",
    marginTop: 18,
    marginBottom: 16,
  },
  loader: { marginTop: 16, alignSelf: "center" },

  /* ── States ── */
  centered: {
    ...primitives.centered,
  },
  hint: {
    ...typography.body,
    color: warmAlpha(0.4),
    textAlign: "center",
  },
  reauthButton: {
    marginTop: 14,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: WARM,
  },
  reauthButtonText: {
    ...typography.label,
    textTransform: "uppercase",
    color: colors.PANEL_DEEP,
  },
  errorText: {
    ...typography.body,
    color: warmAlpha(0.6),
    marginBottom: 12,
  },
  retryText: {
    ...typography.label,
    textTransform: "uppercase",
    color: WARM,
  },
  photoEmpty: {
    width: "100%",
    height: "100%",
    backgroundColor: warmAlpha(0.06),
  },
});
