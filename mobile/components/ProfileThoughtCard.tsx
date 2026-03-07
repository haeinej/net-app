import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, spacing, typography, IMAGE_ASPECT_RATIO } from "../theme";
import { WarmthBar, type WarmthLevel } from "./WarmthBar";
import type { ProfileThought } from "../lib/api";

interface ProfileThoughtCardProps {
  thought: ProfileThought;
  onLongPress?: () => void;
}

export function ProfileThoughtCard({ thought, onLongPress }: ProfileThoughtCardProps) {
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
        <WarmthBar warmthLevel={thought.warmth_level} height={imageHeight} />
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
});
