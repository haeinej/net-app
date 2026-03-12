import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, spacing, typography, fontFamily, IMAGE_ASPECT_RATIO } from "../theme";
import { WarmthBar, type WarmthLevel } from "./WarmthBar";
import type { ProfileThought } from "../lib/api";
import { ThoughtImageFrame } from "./ThoughtImageFrame";

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

interface ProfileThoughtCardProps {
  thought: ProfileThought;
  onLongPress?: () => void;
  /** Use dark variant for Me screen */
  dark?: boolean;
  /** Author name to display in meta row */
  authorName?: string;
  /** Author photo to display in meta row */
  authorPhotoUrl?: string | null;
}

export function ProfileThoughtCard({
  thought,
  onLongPress,
  dark,
  authorName,
  authorPhotoUrl,
}: ProfileThoughtCardProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardWidth = width - spacing.screenPadding * 2;
  const imageHeight = cardWidth / IMAGE_ASPECT_RATIO;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: "/thought/[id]", params: { id: thought.id } })}
      onLongPress={onLongPress}
      activeOpacity={1}
    >
      <View style={styles.cardInner}>
        <WarmthBar warmthLevel={thought.warmth_level} height={imageHeight + 34} />
        <View style={{ flex: 1 }}>
          <ThoughtImageFrame
            thoughtText={thought.sentence}
            imageUrl={thought.photo_url ?? thought.image_url}
            aspectRatio={IMAGE_ASPECT_RATIO}
            borderRadius={0}
            style={{ width: cardWidth - spacing.warmthBarWidth, height: imageHeight }}
          >
            <Text style={styles.sentence} numberOfLines={2}>
              {thought.sentence}
            </Text>
          </ThoughtImageFrame>
          <View style={[styles.meta, dark && styles.metaDark]}>
            {authorPhotoUrl ? (
              <Image source={{ uri: authorPhotoUrl }} style={styles.metaAvatar} contentFit="cover" />
            ) : (
              <View style={styles.metaAvatarPlc} />
            )}
            <Text style={[styles.metaName, dark && styles.metaNameDark]} numberOfLines={1}>
              {authorName ? authorName.toUpperCase() : "—"}
            </Text>
            <Text style={[styles.metaDate, dark && styles.metaDateDark]}>
              {thought.created_at ? formatRelativeTime(thought.created_at) : ""}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
  },
  cardInner: {
    flexDirection: "row",
  },
  sentence: {
    ...typography.thoughtDisplay,
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    fontSize: 25,
    lineHeight: 27,
    letterSpacing: -0.1,
    color: colors.TYPE_WHITE,
    textShadowColor: "rgba(8,6,4,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.CARD_GROUND,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  metaDark: {
    backgroundColor: "rgba(245,240,234,0.06)",
  },
  metaAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  metaAvatarPlc: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.PANEL_DEEP,
  },
  metaName: {
    fontFamily: fontFamily.comico,
    fontSize: 8.5,
    lineHeight: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.TYPE_DARK,
    flex: 1,
  },
  metaNameDark: {
    color: "rgba(245,240,234,0.5)",
  },
  metaDate: {
    fontFamily: fontFamily.comico,
    fontSize: 7.5,
    lineHeight: 9,
    letterSpacing: 0.6,
    color: colors.TYPE_MUTED,
  },
  metaDateDark: {
    color: "rgba(245,240,234,0.25)",
  },
});
