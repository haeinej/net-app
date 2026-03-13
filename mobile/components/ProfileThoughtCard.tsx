import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, spacing, typography, fontFamily } from "../theme";
import { WarmthBar } from "./WarmthBar";
import type { ProfileThought } from "../lib/api";
import { ThoughtImageFrame } from "./ThoughtImageFrame";

const CARD_HEIGHT = spacing.compactCardHeight;
const IMAGE_HEIGHT = CARD_HEIGHT - spacing.compactFooterHeight;
const AVATAR = spacing.compactAvatarSize;

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
  const hasPhoto = Boolean(thought.photo_url ?? thought.image_url);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: "/thought/[id]", params: { id: thought.id } })}
      onLongPress={onLongPress}
      activeOpacity={1}
    >
      <View style={styles.cardInner}>
        <WarmthBar warmthLevel={thought.warmth_level} height={CARD_HEIGHT} />
        <View style={{ flex: 1 }}>
          <View style={[styles.imageWrap, { height: IMAGE_HEIGHT }]}>
            <ThoughtImageFrame
              imageUrl={thought.photo_url ?? thought.image_url}
              aspectRatio={4 / 3}
              borderRadius={0}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.imageOverlay} pointerEvents="none">
              <Text
                style={[styles.sentence, !hasPhoto && styles.sentenceNoPhoto]}
                numberOfLines={4}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {thought.sentence}
              </Text>
            </View>
          </View>
          <View style={[styles.footer, dark && styles.footerDark]}>
            {authorPhotoUrl ? (
              <Image source={{ uri: authorPhotoUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlc]} />
            )}
            <Text style={[styles.name, dark && styles.nameDark]} numberOfLines={1}>
              {authorName ? authorName.toUpperCase() : "—"}
            </Text>
            <Text style={[styles.date, dark && styles.dateDark]}>
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
    height: CARD_HEIGHT,
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
  },
  cardInner: {
    flexDirection: "row",
    height: CARD_HEIGHT,
  },
  imageWrap: {
    position: "relative",
    overflow: "hidden",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  sentence: {
    fontFamily: fontFamily.sentient,
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 16,
    fontSize: 13,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: -0.25,
    color: colors.TYPE_WHITE,
  },
  sentenceNoPhoto: {
    color: colors.TYPE_DARK,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.CARD_GROUND,
    height: spacing.compactFooterHeight,
    paddingHorizontal: 10,
    gap: 8,
  },
  footerDark: {
    backgroundColor: "rgba(245,240,234,0.06)",
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarPlc: {
    backgroundColor: colors.PANEL_DEEP,
  },
  name: {
    fontFamily: fontFamily.comico,
    fontSize: 7,
    lineHeight: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.TYPE_DARK,
    flex: 1,
  },
  nameDark: {
    color: "rgba(245,240,234,0.5)",
  },
  date: {
    fontFamily: fontFamily.comico,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.5,
    color: colors.TYPE_MUTED,
  },
  dateDark: {
    color: "rgba(245,240,234,0.25)",
  },
});
