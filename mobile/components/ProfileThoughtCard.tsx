import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, spacing, typography, fontFamily, IMAGE_ASPECT_RATIO } from "../theme";
import { WarmthBar, type WarmthLevel } from "./WarmthBar";
import type { ProfileThought } from "../lib/api";

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
}

export function ProfileThoughtCard({ thought, onLongPress, dark, authorName }: ProfileThoughtCardProps) {
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
          <View style={[styles.imageWrap, { width: cardWidth - spacing.warmthBarWidth, height: imageHeight }]}>
            {thought.image_url ? (
              <Image source={{ uri: thought.image_url }} style={styles.image} contentFit="cover" />
            ) : (
              <View style={[styles.image, styles.imagePlc]} />
            )}
            <Text style={styles.sentence} numberOfLines={2}>
              {thought.sentence}
            </Text>
          </View>
          <View style={[styles.meta, dark && styles.metaDark]}>
            <View style={styles.metaAvatarPlc} />
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
  imageWrap: {
    overflow: "hidden",
    backgroundColor: colors.PANEL_DARK,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlc: {
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
  meta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.CARD_GROUND,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  metaDark: {
    backgroundColor: "rgba(245,240,234,0.06)",
  },
  metaAvatarPlc: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.PANEL_DEEP,
  },
  metaName: {
    fontFamily: fontFamily.comico,
    fontSize: 5.5,
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
    fontSize: 5,
    letterSpacing: 0.5,
    color: colors.TYPE_MUTED,
  },
  metaDateDark: {
    color: "rgba(245,240,234,0.25)",
  },
});
