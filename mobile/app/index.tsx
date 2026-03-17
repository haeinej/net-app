import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, type Href } from "expo-router";
import { colors } from "../theme";
import {
  clearAuth,
  getStoredToken,
  getStoredUserId,
  getOnboardingComplete,
} from "../lib/auth-store";
import {
  fetchProfile,
  isSessionInvalidError,
  setCachedUserId,
} from "../lib/api";

export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [token, userId, onboardingComplete] = await Promise.all([
        getStoredToken(),
        getStoredUserId(),
        getOnboardingComplete(),
      ]);
      if (cancelled) return;
      let nextRoute: Href = "/intro";

      if (token && userId) {
        let sessionValid = true;

        try {
          await fetchProfile(userId);
        } catch (error) {
          if (isSessionInvalidError(error)) {
            sessionValid = false;
            await clearAuth();
            setCachedUserId(null);
          }
        }

        if (sessionValid) {
          nextRoute = onboardingComplete ? "/(tabs)" : "/onboarding";
        }
      }

      if (!cancelled) {
        router.replace(nextRoute);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.TYPE_MUTED} />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.WARM_GROUND,
  },
});
