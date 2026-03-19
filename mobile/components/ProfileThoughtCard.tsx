import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, spacing, typography } from "../theme";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { WarmthBar } from "./WarmthBar";
import type { ProfileThought } from "../lib/api";
import { ThoughtImageFrame } from "./ThoughtImageFrame";
import { formatRelativeTime } from "../lib/format";

const CARD_HEIGHT = spacing.compactCardHeight;
const IMAGE_HEIGHT = CARD_HEIGHT - spacing.compactFooterHeight;
const AVATAR = spacing.compactAvatarSize;

interface ProfileThoughtCardProps {
  thought: ProfileThought;
  onPress?: (thoughtId: string) => void;
  onLongPress?: () => void;
  disableOpen?: boolean;
  /** Use dark variant for Me screen */
  dark?: boolean;
  /** Author name to display in meta row */
  authorName?: string;
  /** Author photo to display in meta row */
  authorPhotoUrl?: string | null;
  /** Author user id for profile navigation */
  authorUserId?: string | null;
}

export function ProfileThoughtCard({
  thought,
  dark,
  authorName,
  authorPhotoUrl,
  authorUserId,
}: ProfileThoughtCardProps) {
  const router = useRouter();
  const { contentWidth } = useResponsiveLayout();
  const cardWidth = contentWidth - spacing.screenPadding * 2;
  const hasPhoto = Boolean(thought.photo_url ?? thought.image_url);

  return (
    <View style={[styles.card, { width: cardWidth }]}>
      <View style={styles.cardInner}>
        <WarmthBar height={CARD_HEIGHT} />
        <View style={styles.body}>
          <View
            style={[
              styles.imageWrap,
              { width: cardWidth - spacing.warmthBarWidth, height: IMAGE_HEIGHT },
            ]}
          >
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
            <TouchableOpacity
              style={styles.footerProfile}
              activeOpacity={0.7}
              disabled={!authorUserId}
              onPress={() => {
                if (!authorUserId) return;
                router.push({ pathname: "/user/[id]", params: { id: authorUserId } });
              }}
            >
              {authorPhotoUrl ? (
                <Image source={{ uri: authorPhotoUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarPlc]} />
              )}
              <Text style={[styles.name, dark && styles.nameDark]} numberOfLines={1}>
                {authorName ? authorName.toUpperCase() : "—"}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.date, dark && styles.dateDark]}>
              {thought.created_at ? formatRelativeTime(thought.created_at) : ""}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: CARD_HEIGHT,
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
    backgroundColor: colors.CARD_GROUND,
  },
  cardInner: {
    flexDirection: "row",
    height: CARD_HEIGHT,
  },
  body: {
    flex: 1,
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
    ...typography.thoughtDisplayCompact,
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 16,
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
  footerProfile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
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
    ...typography.metadataSmall,
    textTransform: "uppercase",
    color: colors.TYPE_DARK,
    flex: 1,
  },
  nameDark: {
    color: "rgba(245,240,234,0.5)",
  },
  date: {
    ...typography.metadataSmall,
    color: colors.TYPE_MUTED,
  },
  dateDark: {
    color: "rgba(245,240,234,0.25)",
  },
});
