import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../theme";
import { resolveStartupRoute } from "../lib/startup-route";

/**
 * Entry gate — resolves auth state and routes to the correct screen.
 * Authenticated users → feed, unauthenticated → login.
 */
export default function IntroScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const nextRoute = await resolveStartupRoute();
        if (!cancelled) router.replace(nextRoute);
      } catch {
        if (!cancelled) router.replace("/login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={colors.TYPE_MUTED} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.WARM_GROUND,
  },
});
