import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, primitives, radii, opacity } from "../theme";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { ApiError, login } from "../lib/api";
import {
  setAuth,
  setOnboardingComplete,
  setOnboardingStep,
} from "../lib/auth-store";
import { setCachedUserId } from "../lib/api";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../assets/images/ohm-logo.png");

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { containerStyle } = useResponsiveLayout();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const contentFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      ]),
      Animated.timing(contentFade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, scaleAnim, contentFade]);

  const handleLogin = async () => {
    const e = email.trim();
    const p = password;
    if (!e || !p) {
      setError("Email and password required");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { token, user_id, onboarding_complete, onboarding_step } =
        await login(e, p);
      await setAuth(token, user_id);
      await setOnboardingComplete(onboarding_complete);
      await setOnboardingStep(onboarding_step);
      setCachedUserId(user_id);
      router.replace(onboarding_complete ? "/(tabs)" : "/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace({ pathname: "/verify-email", params: { email: e } });
        return;
      }
      setError(err instanceof Error ? err.message : "Incorrect email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.content, containerStyle]}>
        <Animated.View style={[styles.logoWrap, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Image source={ohmLogo} style={styles.logoImage} contentFit="contain" />
        </Animated.View>

        <Animated.View style={[styles.form, { opacity: contentFade }]}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.TYPE_MUTED}
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.TYPE_MUTED}
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            secureTextEntry
            editable={!loading}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
            ) : (
              <Text style={styles.buttonText}>LOG IN</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.link}
            onPress={() => router.replace("/onboarding")}
            disabled={loading}
          >
            <Text style={styles.linkText}>Create account</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tertiaryLink}
            onPress={() => router.push("/privacy" as Href)}
            disabled={loading}
          >
            <Text style={styles.secondaryLinkText}>Privacy policy</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WARM_GROUND,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    maxWidth: 320,
    alignSelf: "center",
    width: "100%",
  },
  logoWrap: {
    alignSelf: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  logoImage: {
    width: 96,
    height: 96,
  },
  form: {
    width: "100%",
  },
  input: {
    ...primitives.input,
    marginBottom: 12,
  },
  error: {
    ...primitives.errorText,
  },
  button: {
    ...primitives.buttonPrimary,
    backgroundColor: colors.OLIVE,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: opacity.disabled,
  },
  buttonText: {
    ...primitives.buttonPrimaryText,
  },
  link: {
    marginTop: 28,
    alignItems: "center",
  },
  linkText: {
    ...primitives.link,
  },
  tertiaryLink: {
    marginTop: 14,
    alignItems: "center",
  },
  secondaryLinkText: {
    ...primitives.linkSubtle,
  },
});
