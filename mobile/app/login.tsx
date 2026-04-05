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
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, primitives, opacity } from "../theme";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import {
  ApiError,
  getSocialAuthUrl,
  login,
  loginDemo,
  loginWithSocialAccessToken,
  setCachedUserId,
  type AuthResponse,
  type SocialProvider,
} from "../lib/api";
import {
  dismissIntro,
  setAuth,
  setOnboardingComplete,
  setOnboardingStep,
} from "../lib/auth-store";
import { getSupabaseClient, hasSupabaseAuthConfig } from "../lib/supabase";
const ohmLogo = require("../assets/images/ohm-logo.png");

function isAppleAuthCancelError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ERR_REQUEST_CANCELED"
  );
}

async function sha256(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { containerStyle } = useResponsiveLayout();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);

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

  const completeAuth = async ({
    token,
    user_id,
    onboarding_complete,
    onboarding_step,
  }: AuthResponse) => {
    await setAuth(token, user_id);
    await dismissIntro();
    await setOnboardingComplete(onboarding_complete);
    await setOnboardingStep(onboarding_step);
    setCachedUserId(user_id);
    router.replace(onboarding_complete ? "/(tabs)" : "/onboarding");
  };

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
      const auth = await login(e, p);
      await completeAuth(auth);
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

  const handleDemoLogin = async () => {
    if (loading || socialLoading) return;
    setError(null);
    setLoading(true);
    try {
      const auth = await loginDemo();
      await completeAuth(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start demo mode");
    } finally {
      setLoading(false);
    }
  };

  const startWebSocialAuth = async (provider: SocialProvider) => {
    const redirectTo = Linking.createURL("/oauth-callback");
    const { url } = await getSocialAuthUrl(provider, redirectTo);
    await Linking.openURL(url);
  };

  const handleAppleAuth = async () => {
    if (loading || socialLoading) return;

    setError(null);
    setSocialLoading("apple");

    try {
      if (Platform.OS !== "ios") {
        await startWebSocialAuth("apple");
        return;
      }

      if (!hasSupabaseAuthConfig()) {
        throw new Error("Apple sign in is not configured for this build");
      }

      const appleAvailable = await AppleAuthentication.isAvailableAsync();
      if (!appleAvailable) {
        throw new Error("Apple sign in is unavailable on this device");
      }

      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await sha256(rawNonce);
      const state = Crypto.randomUUID();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
        state,
      });

      if (!credential.identityToken) {
        throw new Error("Apple did not return an identity token");
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) {
        throw error;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("Could not finish Apple sign in");
      }

      const auth = await loginWithSocialAccessToken(accessToken);
      await supabase.auth.signOut().catch(() => {});
      await completeAuth(auth);
    } catch (err) {
      if (isAppleAuthCancelError(err)) {
        return;
      }
      setError(err instanceof Error ? err.message : "Could not start sign in");
    } finally {
      setSocialLoading(null);
    }
  };

  const appleButtonDisabled = Boolean(loading || socialLoading);
  const usesNativeAppleButton = Platform.OS === "ios";

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
          <Text style={styles.socialTitle}>Create your account with Apple</Text>
          <Text style={styles.socialSubtitle}>
            New accounts start with Apple. Email is only for existing-account login.
          </Text>

          {usesNativeAppleButton ? (
            <View
              style={[
                styles.appleNativeButtonWrap,
                appleButtonDisabled && styles.buttonDisabled,
              ]}
            >
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={999}
                style={styles.appleNativeButton}
                onPress={handleAppleAuth}
              />
              {socialLoading === "apple" ? (
                <View style={styles.appleNativeButtonOverlay}>
                  <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
                </View>
              ) : null}
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.socialButton,
                styles.appleButton,
                appleButtonDisabled && styles.buttonDisabled,
              ]}
              onPress={handleAppleAuth}
              disabled={appleButtonDisabled}
            >
              {socialLoading === "apple" ? (
                <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
              ) : (
                <Text style={[styles.socialButtonText, styles.appleButtonText]}>
                  Continue with Apple
                </Text>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>existing account</Text>
            <View style={styles.dividerLine} />
          </View>

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
            editable={!loading && !socialLoading}
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
            editable={!loading && !socialLoading}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, (loading || socialLoading) && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={Boolean(loading || socialLoading)}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
            ) : (
              <Text style={styles.buttonText}>LOG IN WITH EMAIL</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tertiaryLink}
            onPress={() =>
              router.push(
                email.trim()
                  ? { pathname: "/reset-password", params: { email: email.trim() } }
                  : "/reset-password"
              )
            }
            disabled={Boolean(loading || socialLoading)}
          >
            <Text style={styles.secondaryLinkText}>Forgot password?</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.demoLink}
            onPress={handleDemoLogin}
            disabled={Boolean(loading || socialLoading)}
          >
            <Text style={styles.demoLinkText}>Preview demo mode</Text>
            <Text style={styles.demoHelpText}>
              Opens the full app with sample posts, replies, conversations, and crossings.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tertiaryLink}
            onPress={() => router.push("/terms" as Href)}
            disabled={Boolean(loading || socialLoading)}
          >
            <Text style={styles.secondaryLinkText}>Terms of Use</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tertiaryLink}
            onPress={() => router.push("/privacy" as Href)}
            disabled={Boolean(loading || socialLoading)}
          >
            <Text style={styles.secondaryLinkText}>Privacy Policy</Text>
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
  socialTitle: {
    ...typography.heading,
    color: colors.TYPE_DARK,
    textAlign: "center",
    marginBottom: 8,
  },
  socialSubtitle: {
    ...typography.bodySmall,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 18,
  },
  socialButton: {
    ...primitives.buttonPrimary,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.CARD_BORDER,
  },
  appleNativeButtonWrap: {
    position: "relative",
    marginBottom: 12,
  },
  appleNativeButton: {
    width: "100%",
    height: 52,
  },
  appleNativeButtonOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(18, 18, 18, 0.18)",
    borderRadius: 999,
  },
  socialButtonText: {
    ...typography.buttonText,
  },
  appleButton: {
    backgroundColor: colors.TYPE_DARK,
  },
  appleButtonText: {
    color: colors.TYPE_WHITE,
  },
  googleButton: {
    backgroundColor: colors.TYPE_WHITE,
  },
  googleButtonText: {
    color: colors.TYPE_DARK,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.CARD_BORDER,
  },
  dividerText: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
  tertiaryLink: {
    marginTop: 14,
    alignItems: "center",
  },
  demoLink: {
    marginTop: 18,
    alignItems: "center",
    gap: 4,
  },
  demoLinkText: {
    ...primitives.linkSubtle,
    color: colors.OLIVE,
  },
  demoHelpText: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 16,
  },
  secondaryLinkText: {
    ...primitives.linkSubtle,
  },
});
