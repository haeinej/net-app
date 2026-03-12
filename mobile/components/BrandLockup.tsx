import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { colors, fontFamily } from "../theme";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../assets/images/ohm-logo.png");

type BrandLockupProps = {
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
};

export function BrandLockup({ size = "md", style }: BrandLockupProps) {
  const isSmall = size === "sm";

  return (
    <View style={[styles.row, isSmall ? styles.rowSm : styles.rowMd, style]}>
      <Image
        source={ohmLogo}
        style={isSmall ? styles.logoSm : styles.logoMd}
        contentFit="contain"
      />
      <Text style={[styles.wordmark, isSmall ? styles.wordmarkSm : styles.wordmarkMd]}>
        ohm<Text style={styles.period}>.</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowSm: {
    gap: 8,
  },
  rowMd: {
    gap: 10,
  },
  logoSm: {
    width: 18,
    height: 18,
  },
  logoMd: {
    width: 22,
    height: 22,
  },
  wordmark: {
    fontFamily: fontFamily.comico,
    color: colors.TYPE_DARK,
  },
  wordmarkSm: {
    fontSize: 15,
    letterSpacing: -0.4,
  },
  wordmarkMd: {
    fontSize: 20,
    letterSpacing: -0.6,
  },
  period: {
    color: colors.VERMILLION,
  },
});
