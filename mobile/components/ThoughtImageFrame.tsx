import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme";

interface ThoughtImageFrameProps {
  imageUrl?: string | null;
  aspectRatio?: string | number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  showTextScrim?: boolean;
}

function parseAspectRatio(aspectRatio: string | number | undefined): number {
  if (typeof aspectRatio === "number" && Number.isFinite(aspectRatio) && aspectRatio > 0) {
    return aspectRatio;
  }

  if (typeof aspectRatio === "string") {
    const [width, height] = aspectRatio.split("/").map((value) => Number(value.trim()));
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return width / height;
    }
  }

  return 4 / 5;
}

export function ThoughtImageFrame({
  imageUrl,
  aspectRatio = "4/5",
  borderRadius = 14,
  style,
  children,
  showTextScrim = true,
}: ThoughtImageFrameProps) {
  const ratio = parseAspectRatio(aspectRatio);
  const hasPhoto = Boolean(imageUrl);

  return (
    <View
      style={[
        styles.frame,
        {
          aspectRatio: ratio,
          borderRadius,
          backgroundColor: hasPhoto ? colors.PANEL_DEEP : colors.CARD_GROUND,
        },
        style,
      ]}
    >
      {hasPhoto ? (
        <>
          <Image
            source={{ uri: imageUrl ?? undefined }}
            style={styles.photo}
            contentFit="cover"
          />
          <View style={styles.warmTint} />
          {showTextScrim ? (
            <LinearGradient
              colors={[
                "rgba(8, 6, 4, 0.00)",
                "rgba(8, 6, 4, 0.06)",
                "rgba(8, 6, 4, 0.62)",
                "rgba(8, 6, 4, 0.92)",
              ]}
              locations={[0, 0.22, 0.64, 1]}
              style={styles.textScrim}
            />
          ) : null}
          {/* Glass inner rim — stereoscopic depth edge */}
          <View style={[styles.glassInnerRim, { borderRadius }]} />
        </>
      ) : null}

      {children ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    position: "relative",
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  warmTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(60, 45, 30, 0.22)",
    zIndex: 1,
  },
  textScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  glassInnerRim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
});
