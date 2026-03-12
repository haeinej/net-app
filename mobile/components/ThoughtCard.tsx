import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, spacing, typography, IMAGE_ASPECT_RATIO } from "../theme";
import { WarmthBar, type WarmthLevel } from "./WarmthBar";
import type { FeedItemThought } from "../lib/api";
import { ThoughtImageFrame } from "./ThoughtImageFrame";

interface ThoughtCardProps {
  item: FeedItemThought;
}

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

export function ThoughtCard({ item }: ThoughtCardProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardWidth = width - spacing.screenPadding * 2;
  const imageHeight = cardWidth / IMAGE_ASPECT_RATIO;

  const { thought, user, warmth_level } = item;
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: "/thought/[id]", params: { id: thought.id } })}
      activeOpacity={1}
    >
      <View style={styles.cardInner}>
        <WarmthBar warmthLevel={warmth_level} height={imageHeight + 56} />
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
          <View style={styles.dotsHint}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
        </ThoughtImageFrame>
      </View>
      <View style={styles.footer}>
        <View style={styles.profileRow}>
          {user.photo_url ? (
            <Image source={{ uri: user.photo_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <Text style={styles.name} numberOfLines={1}>
            {user.name ? user.name.toUpperCase() : "—"}
          </Text>
        </View>
        <Text style={styles.timestamp}>{formatRelativeTime(thought.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
    backgroundColor: colors.CARD_GROUND,
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
  dotsHint: {
    position: "absolute",
    right: 10,
    top: 16,
    flexDirection: "column",
    justifyContent: "space-between",
    height: 12,
    opacity: 0.28,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.TYPE_WHITE,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.CARD_GROUND,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarPlaceholder: {
    backgroundColor: colors.TYPE_MUTED,
  },
  name: {
    fontFamily: typography.label.fontFamily,
    fontSize: 9.5,
    lineHeight: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.TYPE_DARK,
    flex: 1,
  },
  timestamp: {
    fontFamily: typography.metadata.fontFamily,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.8,
    color: colors.TYPE_MUTED,
  },
});
