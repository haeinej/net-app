import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors, shared, computeGridFontSize } from "../../theme";
import Svg, { Path } from "react-native-svg";

type CardBackground = "warm" | "black" | "white" | { photo: string };

const RATIOS = [3 / 4, 1, 4 / 3, 4 / 5, 5 / 4];

interface GridCardProps {
  sentence: string;
  keywords?: string[];
  background?: CardBackground;
  authorName?: string;
  authorColor?: string;
  showAuthor?: boolean;
  synced?: boolean;
  blurred?: boolean;
  index?: number;
}

function getKeywordHtml(sentence: string, keywords: string[]) {
  if (!keywords.length) return [{ text: sentence, isKw: false }];
  const lower = keywords.map((k) => k.toLowerCase());
  return sentence.split(/(\s+)/).map((word) => ({
    text: word,
    isKw: lower.includes(word.toLowerCase().replace(/[.,!?;:'"]/g, "")),
  }));
}

export function GridCard({
  sentence,
  keywords = [],
  background = "black",
  authorName,
  authorColor = "#888",
  showAuthor = false,
  synced = false,
  blurred = false,
  index = 0,
}: GridCardProps) {
  const isPhoto = typeof background === "object" && "photo" in background;
  const isDark = background === "black" || isPhoto;

  const bgColor =
    background === "warm"
      ? colors.SURFACE
      : background === "white"
        ? shared.CARD_WHITE
        : background === "black"
          ? shared.CARD_BLACK
          : undefined;

  const textColor = isDark ? "#F0EBE5" : colors.TYPE_PRIMARY;
  const wordCount = sentence.split(/\s+/).length;
  const fontSize = computeGridFontSize(wordCount);

  // Puzzle: pick aspect ratio based on index for variety
  const ratio = RATIOS[index % RATIOS.length];

  const parts = getKeywordHtml(sentence, keywords);

  return (
    <View
      style={[
        styles.card,
        { aspectRatio: ratio },
        bgColor ? { backgroundColor: bgColor } : undefined,
        blurred ? styles.blurred : undefined,
      ]}
    >
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

      {/* Sync icon */}
      {synced && (
        <View style={styles.syncIcon}>
          <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
            <Path
              d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"
              stroke={isDark ? "rgba(240,235,229,0.4)" : "rgba(26,26,22,0.3)"}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      )}

      {/* Text */}
      <View style={styles.textContainer}>
        <Text
          style={[
            styles.text,
            {
              fontSize,
              color: textColor,
              lineHeight: fontSize * 0.96,
              letterSpacing: -0.6,
            },
            isPhoto && styles.photoTextShadow,
          ]}
        >
          {parts.map((p, i) =>
            p.isKw ? (
              <Text key={i} style={{ color: shared.WARM_ORANGE }}>
                {p.text}
              </Text>
            ) : (
              p.text
            )
          )}
        </Text>
      </View>

      {/* Author */}
      {showAuthor && authorName && (
        <View style={styles.author}>
          <View
            style={[styles.authorDot, { backgroundColor: authorColor }]}
          />
          <Text
            style={[
              styles.authorName,
              {
                color: isDark
                  ? "rgba(240,235,229,0.25)"
                  : "rgba(26,26,22,0.2)",
              },
            ]}
          >
            {authorName}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  blurred: {
    opacity: 0.35,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  syncIcon: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 2,
  },
  textContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    justifyContent: "flex-start",
    zIndex: 1,
  },
  text: {
    fontFamily: "Helvetica Neue",
    fontWeight: "700",
  },
  photoTextShadow: {
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  author: {
    position: "absolute",
    bottom: 8,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    zIndex: 2,
  },
  authorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  authorName: {
    fontFamily: "Helvetica Neue",
    fontSize: 7,
    fontWeight: "400",
  },
});
