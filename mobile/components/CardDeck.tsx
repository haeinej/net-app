import type { ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import { colors, spacing } from "../theme";

interface CardDeckProps {
  children: ReactNode;
  /** Number of stacked layers behind the card (default 2) */
  layers?: number;
}

/**
 * Clean stacked-deck effect — thin card edges peek below the main card,
 * centered and progressively narrower to create depth.
 */
export function CardDeck({ children, layers = 2 }: CardDeckProps) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Deepest layer — barely visible, subtle depth cue */}
      {layers >= 2 && (
        <View
          pointerEvents="none"
          style={[
            styles.layer,
            {
              bottom: -6,
              left: 6,
              right: 6,
              height: 14,
              backgroundColor: colors.CARD_GROUND,
              opacity: 0.2,
            },
          ]}
        />
      )}
      {/* Middle layer — slightly more visible */}
      {layers >= 1 && (
        <View
          pointerEvents="none"
          style={[
            styles.layer,
            {
              bottom: -3,
              left: 3,
              right: 3,
              height: 10,
              backgroundColor: colors.CARD_GROUND,
              opacity: 0.4,
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
    alignSelf: "center",
  },
  layer: {
    position: "absolute",
    borderRadius: spacing.cardRadius,
  },
  mainCardWrap: {
    alignSelf: "center",
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
  },
});
