import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { colors, shared, typography } from "../../theme";
import { CircleButton } from "../../components/ui/CircleButton";
import { PillButton } from "../../components/ui/PillButton";
import { PuzzleGrid } from "../../components/feed/PuzzleGrid";
import * as api from "../../lib/api";

const hapticMedium = async () => {
  if (Platform.OS === "web") return;
  const h = await import("expo-haptics");
  h.impactAsync(h.ImpactFeedbackStyle.Medium);
};

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [profile, setProfile] = useState<api.ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<"none" | "pending" | "friends">("none");
  const [sendingRequest, setSendingRequest] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [data, friends] = await Promise.all([
        api.fetchProfile(id),
        api.fetchFriends(),
      ]);
      setProfile(data);
      if (friends.some((f) => f.id === id)) {
        setFriendStatus("friends");
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAddFriend = async () => {
    if (!id || sendingRequest) return;
    setSendingRequest(true);
    hapticMedium();
    try {
      await api.sendFriendRequest(id);
      setFriendStatus("pending");
    } catch {
      if (Platform.OS !== "web") Alert.alert("Couldn't send request");
    } finally {
      setSendingRequest(false);
    }
  };

  if (loading || !profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <CircleButton onPress={() => router.back()} size={32}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M19 12H5M12 19l-7-7 7-7" stroke={colors.TYPE_MUTED} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </CircleButton>
        </View>
        <View style={styles.loadingCenter}>
          <Text style={styles.mutedText}>Loading...</Text>
        </View>
      </View>
    );
  }

  const gridItems = profile.thoughts.map((t, i) => ({
    id: t.id,
    sentence: t.sentence,
    background: (t.photo_url
      ? { photo: t.photo_url }
      : t.id.charCodeAt(0) % 2 === 0
        ? "white"
        : "black") as "white" | "black" | { photo: string },
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <CircleButton onPress={() => router.back()} size={32}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M12 19l-7-7 7-7" stroke={colors.TYPE_MUTED} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </CircleButton>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={styles.profileHeader}>
          {profile.photo_url ? (
            <Image source={{ uri: profile.photo_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.SURFACE_ALT }]} />
          )}
          <Text style={styles.name}>{profile.name ?? "Anonymous"}</Text>
          <Text style={styles.thoughtCount}>
            {profile.thoughts.length} thought{profile.thoughts.length !== 1 ? "s" : ""}
          </Text>

          {/* Friend action */}
          <View style={styles.actionRow}>
            {friendStatus === "none" && (
              <PillButton
                label={sendingRequest ? "Sending..." : "Add Friend"}
                onPress={handleAddFriend}
                variant="filled"
                disabled={sendingRequest}
                style={{ paddingHorizontal: 24 }}
              />
            )}
            {friendStatus === "pending" && (
              <PillButton
                label="Requested"
                onPress={() => {}}
                variant="outlined"
                disabled
                style={{ paddingHorizontal: 24 }}
              />
            )}
            {friendStatus === "friends" && (
              <PillButton
                label="Friends"
                onPress={() => {}}
                variant="outlined"
                disabled
                style={{ paddingHorizontal: 24 }}
              />
            )}
          </View>
        </View>

        {/* Thought grid */}
        {gridItems.length > 0 ? (
          <PuzzleGrid items={gridItems} />
        ) : (
          <View style={styles.emptyGrid}>
            <Text style={styles.mutedText}>No thoughts yet.</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  mutedText: { color: colors.TYPE_MUTED, fontSize: 14, fontFamily: "Helvetica Neue" },

  // Profile
  profileHeader: { alignItems: "center", paddingVertical: 24 },
  avatar: { width: 64, height: 64, borderRadius: 32, marginBottom: 12 },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.TYPE_PRIMARY,
    letterSpacing: -0.3,
    fontFamily: "Helvetica Neue",
  },
  thoughtCount: {
    fontSize: 11,
    color: colors.TYPE_MUTED,
    marginTop: 4,
    fontFamily: "Helvetica Neue",
  },
  actionRow: { marginTop: 16 },

  // Grid
  emptyGrid: { alignItems: "center", paddingTop: 60 },
});
