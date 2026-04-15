import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { colors, shared, computeGridFontSize } from "../../theme";
import { fetchProfile, fetchFriends, fetchSavedCards } from "../../lib/api";
import type { ProfileResponse, ProfileThought, FeedItem, FriendUser } from "../../lib/api";
import { getStoredUserId } from "../../lib/auth-store";
import { SkeletonGrid } from "../../components/ui/Skeleton";

// ── Grid Card ────────────────────────────────────────
function ProfileGridCard({ thought }: { thought: ProfileThought }) {
  const hasPhoto = !!thought.photo_url || !!thought.image_url;
  const photoUri = thought.photo_url || thought.image_url;
  const isDark = !hasPhoto || true; // photo cards are always dark overlay
  const textColor = hasPhoto ? "#F0EBE5" : thought.id.charCodeAt(0) % 2 === 0 ? "#F0EBE5" : "#1A1A16";
  const bgColor = hasPhoto ? "#0A0A0A" : thought.id.charCodeAt(0) % 2 === 0 ? "#0A0A0A" : "#FFFFFF";
  const wc = thought.sentence.split(/\s+/).length;
  const fs = computeGridFontSize(wc);

  // Puzzle ratio based on word count
  const ratio = wc <= 2 ? 1 : wc <= 5 ? 4 / 3 : 3 / 4;

  return (
    <View style={[styles.gc, { aspectRatio: ratio, backgroundColor: bgColor, borderRadius: 12 }]}>
      {hasPhoto && photoUri && (
        <>
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.photoOverlay} />
        </>
      )}
      <View style={styles.gcText}>
        <Text style={{ fontWeight: "700", fontSize: fs, lineHeight: fs * 0.96, letterSpacing: -0.6, color: textColor }}>
          {thought.sentence}
        </Text>
      </View>
    </View>
  );
}

export default function MeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [friendCount, setFriendCount] = useState(0);
  const [tab, setTab] = useState<"profile" | "collections">("profile");
  const [savedCards, setSavedCards] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const userId = await getStoredUserId();
      if (!userId) {
        setLoading(false);
        return;
      }

      const [profileData, friends] = await Promise.all([
        fetchProfile(userId),
        fetchFriends(),
      ]);

      setProfile(profileData);
      setFriendCount(friends.length);
    } catch (e) {
      console.error("Profile load failed:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadSaved() {
    try {
      const items = await fetchSavedCards(30);
      setSavedCards(items);
    } catch {}
  }

  useEffect(() => {
    if (tab === "collections") loadSaved();
  }, [tab]);

  const thoughts = profile?.thoughts ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar: share + hamburger */}
      <View style={styles.topBar}>
        <Pressable hitSlop={12}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke={colors.TYPE_MUTED} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <Pressable style={styles.menuBtn} hitSlop={12} onPress={() => router.push("/settings")}>
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
            <Path d="M4 6h16M4 12h16M4 18h16" stroke={colors.TYPE_MUTED} strokeWidth={1.5} strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}><ActivityIndicator color={colors.TYPE_MUTED} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ height: 16 }} />

          {/* Avatar + name */}
          <View style={styles.profileRow}>
            {profile?.photo_url ? (
              <Image source={{ uri: profile.photo_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder} />
            )}
            <View>
              <Text style={styles.name}>{profile?.name ?? "..."}</Text>
            </View>
          </View>

          <View style={{ height: 16 }} />
          <Text style={styles.stats}><Text style={styles.statsBold}>{friendCount}</Text> friends</Text>

          <View style={{ height: 18 }} />
          <View style={styles.editRow}>
            <Pressable style={styles.editBtn} onPress={() => router.push("/edit-profile")}>
              <Text style={styles.editBtnText}>Edit Profile</Text>
            </Pressable>
          </View>

          <View style={{ height: 22 }} />

          {/* Tabs 50/50 */}
          <View style={styles.tabs}>
            <Pressable style={[styles.tab, tab === "profile" && styles.tabActive]} onPress={() => setTab("profile")}>
              <Text style={tab === "profile" ? styles.tabTextActive : styles.tabTextInactive}>
                Profile <Text style={styles.tabCount}>{thoughts.length}</Text>
              </Text>
            </Pressable>
            <Pressable style={[styles.tab, tab === "collections" && styles.tabActive]} onPress={() => setTab("collections")}>
              <Text style={tab === "collections" ? styles.tabTextActive : styles.tabTextInactive}>Collections</Text>
            </Pressable>
          </View>
          <View style={styles.tabLine} />

          {/* Grid */}
          {tab === "profile" ? (
            thoughts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Your thoughts will appear here</Text>
              </View>
            ) : (
              <View style={styles.gridContainer}>
                <View style={styles.gridColumn}>
                  {thoughts.filter((_, i) => i % 2 === 0).map((t) => (
                    <View key={t.id} style={{ marginBottom: 6 }}><ProfileGridCard thought={t} /></View>
                  ))}
                </View>
                <View style={styles.gridColumn}>
                  {thoughts.filter((_, i) => i % 2 === 1).map((t) => (
                    <View key={t.id} style={{ marginBottom: 6 }}><ProfileGridCard thought={t} /></View>
                  ))}
                </View>
              </View>
            )
          ) : (
            savedCards.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Swipe right on thoughts to save them here</Text>
              </View>
            ) : (
              <View style={styles.gridContainer}>
                <View style={styles.gridColumn}>
                  {savedCards.filter((_, i) => i % 2 === 0).map((item) => (
                    <View key={item.thought.id} style={{ marginBottom: 6 }}>
                      <ProfileGridCard thought={{ id: item.thought.id, sentence: item.thought.sentence, photo_url: item.thought.photo_url, image_url: item.thought.image_url, created_at: item.thought.created_at }} />
                    </View>
                  ))}
                </View>
                <View style={styles.gridColumn}>
                  {savedCards.filter((_, i) => i % 2 === 1).map((item) => (
                    <View key={item.thought.id} style={{ marginBottom: 6 }}>
                      <ProfileGridCard thought={{ id: item.thought.id, sentence: item.thought.sentence, photo_url: item.thought.photo_url, image_url: item.thought.image_url, created_at: item.thought.created_at }} />
                    </View>
                  ))}
                </View>
              </View>
            )
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.BG },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, height: 36 },
  menuBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.SURFACE, alignItems: "center", justifyContent: "center" },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20 },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarPlaceholder: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.SURFACE_ALT },
  name: { fontSize: 17, fontWeight: "700", color: colors.TYPE_PRIMARY, letterSpacing: -0.3 },
  handle: { fontSize: 10, color: colors.TYPE_MUTED, marginTop: 3 },
  stats: { paddingHorizontal: 20, fontSize: 11, color: colors.TYPE_SECONDARY },
  statsBold: { fontWeight: "500", color: colors.TYPE_PRIMARY },
  editRow: { paddingHorizontal: 20 },
  editBtn: { alignItems: "center", padding: 11, borderRadius: 14, borderWidth: 1, borderColor: colors.CARD_BORDER },
  editBtnText: { fontSize: 13, fontWeight: "500", color: colors.TYPE_SECONDARY },
  tabs: { flexDirection: "row", paddingHorizontal: 20 },
  tab: { flex: 1, alignItems: "center", paddingBottom: 10 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.TYPE_PRIMARY },
  tabTextActive: { fontSize: 12, fontWeight: "500", color: colors.TYPE_PRIMARY },
  tabTextInactive: { fontSize: 12, fontWeight: "500", color: colors.TYPE_MUTED },
  tabCount: { fontSize: 10, color: colors.TYPE_MUTED },
  tabLine: { height: 1, backgroundColor: colors.SURFACE },
  gridContainer: { flexDirection: "row", paddingHorizontal: 8, gap: 6, paddingTop: 4 },
  gridColumn: { flex: 1 },
  gc: { overflow: "hidden", position: "relative" },
  gcText: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, padding: 12 },
  photoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  emptyState: { padding: 40, alignItems: "center" },
  emptyText: { color: colors.TYPE_MUTED, fontSize: 14, fontWeight: "300" },
});
