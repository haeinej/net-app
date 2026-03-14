import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, spacing, typography, IMAGE_ASPECT_RATIO, fontFamily } from "../theme";
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
  const hasPhoto = Boolean(thought.photo_url ?? thought.image_url);

  const openUserProfile = (event: GestureResponderEvent) => {
    event.stopPropagation();
    if (!user.id) return;
    router.push({ pathname: "/user/[id]", params: { id: user.id } });
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: "/thought/[id]", params: { id: thought.id } })}
      activeOpacity={1}
    >
      <View style={styles.cardInner}>
        <WarmthBar warmthLevel={warmth_level} height={imageHeight + 56} />
        <View
          style={[
            styles.imageWrap,
            { width: cardWidth - spacing.warmthBarWidth, height: imageHeight },
          ]}
        >
          <ThoughtImageFrame
            imageUrl={thought.photo_url ?? thought.image_url}
            aspectRatio={IMAGE_ASPECT_RATIO}
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
            <View style={[styles.dotsHint, !hasPhoto && styles.dotsHintNoPhoto]}>
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
          </View>
        </View>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.profileRow}
          onPress={openUserProfile}
          disabled={!user.id}
          activeOpacity={0.7}
        >
          {user.photo_url ? (
            <Image source={{ uri: user.photo_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <Text style={styles.name} numberOfLines={1}>
            {user.name ? user.name.toUpperCase() : "—"}
          </Text>
        </TouchableOpacity>
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
  imageWrap: {
    position: "relative",
    overflow: "hidden",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  sentence: {
    fontFamily: fontFamily.sentientBold,
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 22,
    fontSize: 29,
    lineHeight: 33,
    letterSpacing: -0.35,
    color: colors.TYPE_WHITE,
  },
  sentenceNoPhoto: {
    color: colors.TYPE_DARK,
  },
  dotsHintNoPhoto: {
    opacity: 0.35,
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
    fontSize: 11.5,
    lineHeight: 13.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.TYPE_DARK,
    flex: 1,
  },
  timestamp: {
    fontFamily: typography.metadata.fontFamily,
    fontSize: 9.5,
    lineHeight: 11.5,
    letterSpacing: 0.8,
    color: colors.TYPE_MUTED,
  },
});
