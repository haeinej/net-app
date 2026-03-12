import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { colors } from "../theme";

interface ThoughtImageFrameProps {
  imageUrl?: string | null;
  aspectRatio?: string | number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
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
  },
  warmTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(60, 45, 30, 0.35)",
  },
  content: {
    ...StyleSheet.absoluteFillObject,
  },
});
