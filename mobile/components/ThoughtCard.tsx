import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, spacing, typography, fontFamily, IMAGE_ASPECT_RATIO } from "../theme";
import { WarmthBar, type WarmthLevel } from "./WarmthBar";
import type { FeedItem } from "../lib/api";

interface ThoughtCardProps {
  item: FeedItem;
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

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: "/thought/[id]", params: { id: item.id } })}
      activeOpacity={1}
    >
      <View style={styles.cardInner}>
        <WarmthBar warmthLevel={item.warmth_level} height={imageHeight + 56} />
        <View style={[styles.imageWrap, { width: cardWidth - spacing.warmthBarWidth, height: imageHeight }]}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={styles.image}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]} />
          )}
          <Text style={styles.sentence} numberOfLines={2}>
            {item.sentence}
          </Text>
          <View style={styles.dotsHint}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
        </View>
      </View>
      <View style={styles.footer}>
        <View style={styles.profileRow}>
          {item.user.photo_url ? (
            <Image source={{ uri: item.user.photo_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <Text style={styles.name} numberOfLines={1}>
            {item.user.name ? item.user.name.toUpperCase() : "—"}
          </Text>
        </View>
        <Text style={styles.timestamp}>{formatRelativeTime(item.created_at)}</Text>
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
  imageWrap: {
    overflow: "hidden",
    backgroundColor: colors.PANEL_DARK,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    backgroundColor: colors.PANEL_DARK,
  },
  sentence: {
    ...typography.thoughtSentence,
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    color: colors.TYPE_WHITE,
  },
  dotsHint: {
    position: "absolute",
    right: 10,
    top: "50%",
    marginTop: -6,
    flexDirection: "column",
    justifyContent: "space-between",
    height: 12,
    opacity: 0.2,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.CARD_GROUND,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  avatar: {
    width: spacing.profilePhotoSize,
    height: spacing.profilePhotoSize,
    borderRadius: spacing.profilePhotoSize / 2,
  },
  avatarPlaceholder: {
    backgroundColor: colors.TYPE_MUTED,
  },
  name: {
    ...typography.label,
    color: colors.TYPE_DARK,
    flex: 1,
  },
  timestamp: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
  },
});
