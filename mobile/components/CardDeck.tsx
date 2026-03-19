import type { ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import { colors, spacing } from "../theme";

interface CardDeckProps {
  children: ReactNode;
  /** Number of stacked layers behind the card (default 2) */
  layers?: number;
}

/**
 * Wraps a card to give it a clean "stacked deck" appearance —
 * cards peeking out neatly below the main card, centered and
 * progressively smaller to create depth.
 */
export function CardDeck({ children, layers = 2 }: CardDeckProps) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Back layer (deepest) — smallest, lowest peek */}
      {layers >= 2 && (
        <View
          pointerEvents="none"
          style={[
            styles.layer,
            {
              bottom: -8,
              left: 10,
              right: 10,
              height: 20,
              backgroundColor: colors.CARD_GROUND,
              opacity: 0.25,
            },
          ]}
        />
      )}
      {/* Middle layer — slightly closer, slightly wider */}
      {layers >= 1 && (
        <View
          pointerEvents="none"
          style={[
            styles.layer,
            {
              bottom: -4,
              left: 5,
              right: 5,
              height: 16,
              backgroundColor: colors.CARD_GROUND,
              opacity: 0.45,
            },
          ]}
        />
      )}
      {/* Main card */}
      <View style={styles.mainCardWrap} pointerEvents="box-none">
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
  },
  mainCardWrap: {
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
  },
});
