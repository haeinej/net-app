import { useState, useEffect, useRef, useCallback } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, primitives, opacity } from "../theme";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { validateInviteCode } from "../lib/api";

const ohmLogo = require("../assets/images/ohm-logo.png");

export default function EnterInviteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { containerStyle } = useResponsiveLayout();
  const params = useLocalSearchParams<{ prefill_code?: string }>();

  const [code, setCode] = useState(params.prefill_code ?? "");
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

  const handleContinue = useCallback(async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 6) return;

    setError(null);
    setLoading(true);
    try {
      const { valid } = await validateInviteCode(trimmed);
      if (valid) {
        router.replace({ pathname: "/onboarding", params: { invite_code: trimmed } });
      } else {
        setError("Invalid or already used invite code");
      }
    } catch {
      setError("Could not validate code. Try again.");
    } finally {
      setLoading(false);
    }
  }, [code, router]);

  const canContinue = code.trim().length === 6;

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
          <Text style={styles.title}>You need an invite</Text>
          <Text style={styles.subtitle}>ohm. is invite-only right now.</Text>

          <TextInput
            style={styles.input}
            placeholder="Invite code"
            placeholderTextColor={colors.TYPE_MUTED}
            value={code}
            onChangeText={(t) => {
              setCode(t.toUpperCase().slice(0, 6));
              setError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            editable={!loading}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, (!canContinue || loading) && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={!canContinue || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
            ) : (
              <Text style={styles.buttonText}>CONTINUE</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.helpText}>Ask someone on ohm. for an invite.</Text>

          <TouchableOpacity
            style={styles.link}
            onPress={() => router.replace("/login")}
            disabled={loading}
          >
            <Text style={styles.linkText}>Already have an account? Log in</Text>
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
  title: {
    ...typography.headingLg,
    color: colors.TYPE_DARK,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    ...primitives.input,
    textAlign: "center",
    fontSize: 20,
    letterSpacing: 4,
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
  helpText: {
    ...typography.bodySmall,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    marginTop: 24,
  },
  link: {
    marginTop: 16,
    alignItems: "center",
  },
  linkText: {
    ...primitives.linkSubtle,
  },
});
