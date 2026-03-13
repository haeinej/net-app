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
      {/* Main card — full depth shadow + glass rim */}
      <View style={[styles.mainCardWrap, shadows.card]}>
        {children}
        {/* Glass highlight rim — top-left light catch */}
        <View
          style={[StyleSheet.absoluteFill, styles.glassRim]}
          pointerEvents="none"
        />
        {/* Warm light gradient — subtle top-left glow */}
        <View
          style={[StyleSheet.absoluteFill, styles.glassGradientWrap]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={[glass.warmLight[0], glass.warmLight[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 0.6 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
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
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  mainCardWrap: {
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
  },
  glassRim: {
    borderRadius: spacing.cardRadius,
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.18)",
    borderLeftColor: "rgba(255,255,255,0.10)",
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderRightColor: "rgba(26,26,22,0.04)",
    borderBottomColor: "rgba(26,26,22,0.06)",
  },
  glassGradientWrap: {
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
  },
});
