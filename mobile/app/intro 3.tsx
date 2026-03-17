import { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontFamily, spacing } from "../theme";

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleContinue = useCallback(() => {
    router.replace("/login");
  }, [router]);

  return (
    <View style={styles.container}>
      <View style={styles.copyWrap}>
        <Text style={styles.brand}>ohm.</Text>
        <Text style={styles.copy}>
          One honest thought can open a private conversation.
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity style={styles.button} onPress={handleContinue} activeOpacity={0.85}>
          <Text style={styles.buttonText}>Onboard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WARM_GROUND,
    paddingHorizontal: spacing.screenPadding,
  },
  copyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  brand: {
    fontFamily: fontFamily.comico,
    fontSize: 42,
    color: colors.TYPE_DARK,
  },
  copy: {
    maxWidth: 300,
    textAlign: "center",
    fontFamily: fontFamily.sentient,
    fontSize: 24,
    lineHeight: 30,
    color: colors.TYPE_DARK,
  },
  footer: {
    alignItems: "center",
  },
  button: {
    minWidth: 180,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: colors.VERMILLION,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: fontFamily.comico,
    fontSize: 14,
    letterSpacing: 1.1,
    color: colors.TYPE_WHITE,
  },
});
