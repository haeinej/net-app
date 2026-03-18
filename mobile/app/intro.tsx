import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontFamily, spacing } from "../theme";
import { resolveStartupRoute } from "../lib/startup-route";

type IntroLandingProps = {
  buttonLabel?: string;
  busy?: boolean;
  onContinue: () => void;
};

export function IntroLanding({
  buttonLabel = "Continue",
  busy = false,
  onContinue,
}: IntroLandingProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={styles.copyWrap}>
        <Text style={styles.brand}>ohm.</Text>
        <Text style={styles.copy}>
          One honest thought can open a private conversation.
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onContinue}
          activeOpacity={0.85}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
          ) : (
            <Text style={styles.buttonText}>{buttonLabel}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function IntroScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleContinue = useCallback(() => {
    if (busy) return;

    setBusy(true);
    void (async () => {
      try {
        const nextRoute = await resolveStartupRoute();
        router.replace(nextRoute);
      } catch (error) {
        console.warn("Intro route resolution failed:", error);
        router.replace("/login");
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, router]);

  return <IntroLanding buttonLabel="Continue" busy={busy} onContinue={handleContinue} />;
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
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: colors.VERMILLION,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.85,
  },
  buttonText: {
    fontFamily: fontFamily.comico,
    fontSize: 14,
    letterSpacing: 1.1,
    color: colors.TYPE_WHITE,
  },
});
