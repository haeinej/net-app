import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { colors, spacing, typography, primitives } from "../theme";
import { loginWithSocialAccessToken, setCachedUserId } from "../lib/api";
import {
  dismissIntro,
  setAuth,
  setOnboardingComplete,
  setOnboardingStep,
} from "../lib/auth-store";

function parseOAuthCallback(url: string): { accessToken: string | null; error: string | null } {
  const query = url.includes("?") ? url.split("?")[1]?.split("#")[0] ?? "" : "";
  const fragment = url.includes("#") ? url.split("#")[1] ?? "" : "";
  const params = new URLSearchParams(query);
  const hashParams = new URLSearchParams(fragment);

  const accessToken =
    hashParams.get("access_token") ??
    params.get("access_token");
  const error =
    hashParams.get("error_description") ??
    params.get("error_description") ??
    hashParams.get("error") ??
    params.get("error");

  return {
    accessToken,
    error,
  };
}

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const callbackUrl = Linking.useURL();
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (handledRef.current) return;

    let cancelled = false;
    void (async () => {
      const rawUrl = callbackUrl ?? (await Linking.getInitialURL());
      if (!rawUrl) {
        handledRef.current = true;
        if (!cancelled) setError("Could not finish sign in");
        return;
      }

      const parsed = parseOAuthCallback(rawUrl);
      if (parsed.error) {
        handledRef.current = true;
        if (!cancelled) setError(parsed.error);
        return;
      }

      if (!parsed.accessToken) {
        handledRef.current = true;
        if (!cancelled) setError("Could not finish sign in");
        return;
      }

      handledRef.current = true;

      try {
        const { token, user_id, onboarding_complete, onboarding_step } =
          await loginWithSocialAccessToken(parsed.accessToken);
        await setAuth(token, user_id);
        await dismissIntro();
        await setOnboardingComplete(onboarding_complete);
        await setOnboardingStep(onboarding_step);
        setCachedUserId(user_id);

        if (!cancelled) {
          router.replace(onboarding_complete ? "/(tabs)" : "/onboarding");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not finish sign in");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [callbackUrl, router]);

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text style={styles.title}>Sign in did not finish</Text>
          <Text style={styles.body}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace("/login")}>
            <Text style={styles.buttonText}>BACK TO LOGIN</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="small" color={colors.TYPE_MUTED} />
          <Text style={styles.body}>Finishing your sign in...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.WARM_GROUND,
    paddingHorizontal: spacing.screenPadding,
  },
  title: {
    ...typography.heading,
    color: colors.TYPE_DARK,
    textAlign: "center",
    marginBottom: 12,
  },
  body: {
    ...typography.body,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 22,
    maxWidth: 280,
  },
  button: {
    ...primitives.buttonPrimary,
    backgroundColor: colors.OLIVE,
    marginTop: 24,
    minWidth: 220,
  },
  buttonText: {
    ...primitives.buttonPrimaryText,
  },
});
