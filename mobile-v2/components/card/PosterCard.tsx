import { StyleSheet, Text, TextStyle, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  colors,
  shared,
  spacing,
  typography,
  computeCardFontSize,
  computeGridFontSize,
} from "../../theme";
import { KeywordHighlight } from "./KeywordHighlight";

type CardBackground = "white" | "black" | { photo: string };

interface PosterCardProps {
  sentence: string;
  keywords?: string[];
  background?: CardBackground;
  authorName?: string;
  authorPhotoUrl?: string;
  showAuthor?: boolean;
  /** Grid mode: smaller text, rounded corners, fixed aspect ratio */
  grid?: boolean;
}

export function PosterCard({
  sentence,
  keywords = [],
  background = "black",
  authorName,
  authorPhotoUrl,
  showAuthor = true,
  grid = false,
}: PosterCardProps) {
  const isPhoto = typeof background === "object" && "photo" in background;
  const isDark = background === "black" || isPhoto;

  // Text color: dark cards get warm white, light cards get warm dark
  const textColor = isDark ? "#F0EBE5" : colors.TYPE_PRIMARY;

  // Font size: grid uses word count sizing, full-screen uses sentence length
  const fontSize = grid
    ? computeGridFontSize(sentence.split(/\s+/).length)
    : computeCardFontSize(sentence.length);

  // Background color
  const bgColor = isPhoto
    ? undefined
    : background === "white"
      ? shared.CARD_WHITE
      : background === "black"
        ? shared.CARD_BLACK
        : undefined;

  return (
    <View
      style={[
        styles.card,
        bgColor ? { backgroundColor: bgColor } : undefined,
        grid && styles.grid,
      ]}
    >
      {/* Photo background */}
      {isPhoto && (
        <>
          <Image
            source={{ uri: background.photo }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <View style={styles.photoOverlay} />
        </>
      )}

      {/* Top gradient fade (full-screen only) */}
      {!grid && (
        <LinearGradient
          colors={
            isDark
              ? ["rgba(0,0,0,0.45)", "rgba(0,0,0,0.15)", "transparent"]
              : ["rgba(0,0,0,0.08)", "rgba(0,0,0,0.03)", "transparent"]
          }
          style={styles.topFade}
          pointerEvents="none"
        />
      )}

      {/* Text content — from TOP */}
      <View style={[styles.content, grid && styles.contentGrid]}>
        <KeywordHighlight
          sentence={sentence}
          keywords={keywords}
          style={[
            typography.cardSentence(fontSize),
            { color: textColor },
            ...(isPhoto ? [styles.photoTextShadow] : []),
            ...(grid ? [{ lineHeight: fontSize * 0.96, letterSpacing: -0.6 }] : []),
          ] as TextStyle[]}
        />
      </View>

      {/* Author bar — at bottom, never overlapping text */}
      {showAuthor && authorName && (
        <View style={[styles.authorRow, grid && styles.authorRowGrid]}>
          {authorPhotoUrl && (
            <Image
              source={{ uri: authorPhotoUrl }}
              style={grid ? styles.authorAvatarGrid : styles.authorAvatar}
            />
          )}
          <Text
            style={[
              styles.authorName,
              { color: isDark ? "rgba(240,235,229,0.3)" : "rgba(26,26,22,0.25)" },
            ]}
          >
            {authorName}
          </Text>
        </View>
      )}

      {/* Bottom gradient fade (full-screen only) */}
      {!grid && (
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.3)"]}
          style={styles.bottomFade}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    overflow: "hidden",
  },
  grid: {
    borderRadius: 12,
    aspectRatio: 3 / 4,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  topFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    zIndex: 1,
  },
  bottomFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: spacing.cardPaddingH,
    paddingTop: 28,
    zIndex: 2,
  },
  contentGrid: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  photoTextShadow: {
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  authorRow: {
    position: "absolute",
    bottom: 110,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    zIndex: 2,
  },
  authorRowGrid: {
    bottom: 8,
    left: 10,
  },
  authorAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  authorAvatarGrid: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  authorName: {
    fontFamily: "Helvetica Neue",
    fontWeight: "400",
    fontSize: 9,
  },
});
