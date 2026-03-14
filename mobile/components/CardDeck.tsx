import type { ReactNode } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, shadows, glass } from "../theme";

interface CardDeckProps {
  children: ReactNode;
  /** Number of stacked layers behind the card (default 2) */
  layers?: number;
}

/**
 * Wraps a card to give it a "deck" / stacked-folder appearance
 * with stereoscopic depth: layered shadows, inner glass rim,
 * and warm light gradient on each backing layer.
 */
export function CardDeck({ children, layers = 2 }: CardDeckProps) {
  const { width } = useWindowDimensions();
  const cardWidth = width - spacing.screenPadding * 2;

  return (
    <View style={styles.container}>
      {/* Back layer (deepest) — faintest, most offset */}
      {layers >= 2 && (
        <View
          style={[
            styles.layer,
            shadows.cardAmbient,
            {
              width: cardWidth - 14,
              height: spacing.compactCardHeight,
              top: 7,
              left: 7,
              transform: [{ rotate: "0.6deg" }],
              backgroundColor: colors.CARD_GROUND,
              opacity: 0.35,
            },
          ]}
        >
          {/* Inner highlight rim */}
          <View style={[StyleSheet.absoluteFill, styles.innerRim]} />
        </View>
      )}
      {/* Middle layer — slightly visible, slight offset */}
      {layers >= 1 && (
        <View
          style={[
            styles.layer,
            shadows.cardAmbient,
            {
              width: cardWidth - 7,
              height: spacing.compactCardHeight,
              top: 3.5,
              left: 3.5,
              transform: [{ rotate: "-0.3deg" }],
              backgroundColor: colors.CARD_GROUND,
              opacity: 0.55,
            },
          ]}
        >
          <View style={[StyleSheet.absoluteFill, styles.innerRim]} />
        </View>
      )}
      {/* Main card — flat, no shadow */}
      <View style={styles.mainCardWrap}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  layer: {
    position: "absolute",
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
  },
  innerRim: {
    borderRadius: spacing.cardRadius,
  },
  mainCardWrap: {
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
  },
  glassRim: {
    borderRadius: spacing.cardRadius,
  },
  glassGradientWrap: {
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
  },
});
