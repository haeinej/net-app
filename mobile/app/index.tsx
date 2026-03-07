import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../theme";
import {
  getStoredToken,
  getOnboardingComplete,
  getOnboardingStep,
} from "../lib/auth-store";

export default function IndexScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getStoredToken();
      const onboardingComplete = await getOnboardingComplete();
      const step = await getOnboardingStep();
      if (cancelled) return;
      setReady(true);
      if (!token) {
        router.replace("/login");
        return;
      }
      if (!onboardingComplete) {
        router.replace("/onboarding");
        return;
      }
      router.replace("/(tabs)");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.TYPE_MUTED} />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.WARM_GROUND,
  },
});
