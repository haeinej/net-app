import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, fontFamily } from "../theme";
import {
  verifyEmail,
  verifyEmailLink,
  resendVerificationEmail,
  setCachedUserId,
} from "../lib/api";
import { setAuth, setOnboardingComplete, setOnboardingStep } from "../lib/auth-store";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export default function VerifyEmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    email?: string;
    token_hash?: string;
    type?: string;
    error?: string;
    error_description?: string;
  }>();
  const [email, setEmail] = useState(() => normalizeEmail(params.email ?? ""));
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const cleanEmail = useMemo(() => normalizeEmail(email), [email]);
  const handledTokenHashRef = useRef<string | null>(null);

  const finishAuth = useCallback(
    async (payload: {
      token: string;
      user_id: string;
      onboarding_complete: boolean;
      onboarding_step: 1 | 2 | 3;
    }) => {
      await setAuth(payload.token, payload.user_id);
      await setOnboardingComplete(payload.onboarding_complete);
      await setOnboardingStep(payload.onboarding_step);
      setCachedUserId(payload.user_id);
      router.replace(payload.onboarding_complete ? "/(tabs)" : "/onboarding");
    },
    [router]
  );

  const handleVerify = useCallback(async () => {
    if (!cleanEmail || !/^\d{6}$/.test(code.trim())) {
      setError("Enter your email and the 6-digit code");
      return;
    }

    setError(null);
    setVerifying(true);
    try {
      const auth = await verifyEmail(cleanEmail, code.trim());
      await finishAuth(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify email");
    } finally {
      setVerifying(false);
    }
  }, [cleanEmail, code, finishAuth]);

  const handleResend = useCallback(async () => {
    if (!cleanEmail) {
      setError("Enter your email first");
      return;
    }

    setError(null);
    setResending(true);
    try {
      await resendVerificationEmail(cleanEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code");
    } finally {
      setResending(false);
    }
  }, [cleanEmail]);

  useEffect(() => {
    const tokenHash = typeof params.token_hash === "string" ? params.token_hash.trim() : "";
    const verifyType = typeof params.type === "string" ? params.type.trim() : undefined;
    const deepLinkError =
      typeof params.error_description === "string"
        ? params.error_description
        : typeof params.error === "string"
          ? params.error
          : null;

    if (deepLinkError) {
      setError(deepLinkError);
      return;
    }

    if (!tokenHash || verifying || handledTokenHashRef.current === tokenHash) return;

    let cancelled = false;
    handledTokenHashRef.current = tokenHash;
    setError(null);
    setVerifying(true);

    verifyEmailLink(tokenHash, verifyType)
      .then(async (auth) => {
        if (cancelled) return;
        await finishAuth(auth);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not verify email");
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });

    return () => {
      cancelled = true;
    };
  }, [finishAuth, params.error, params.error_description, params.token_hash, params.type, verifying]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.copy}>Tap the link in your email, or enter the 6-digit code.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.TYPE_MUTED}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
          editable={!verifying && !resending}
        />

        <TextInput
          style={styles.input}
          placeholder="6-digit code"
          placeholderTextColor={colors.TYPE_MUTED}
          keyboardType="number-pad"
          value={code}
          onChangeText={(value) => {
            setCode(value.replace(/\D/g, "").slice(0, 6));
            setError(null);
          }}
          editable={!verifying && !resending}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, verifying && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={verifying}
        >
          {verifying ? (
            <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
          ) : (
            <Text style={styles.primaryButtonText}>VERIFY</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.link}
          onPress={handleResend}
          disabled={verifying || resending}
        >
          <Text style={styles.linkText}>{resending ? "Sending..." : "Resend code"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryLink}
          onPress={() => router.replace("/login")}
          disabled={verifying || resending}
        >
          <Text style={styles.secondaryLinkText}>Back to login</Text>
        </TouchableOpacity>
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
  title: {
    fontFamily: fontFamily.comico,
    fontSize: 24,
    color: colors.TYPE_DARK,
    marginBottom: 10,
  },
  copy: {
    fontFamily: fontFamily.sentient,
    fontSize: 15,
    lineHeight: 21,
    color: colors.TYPE_MUTED,
    marginBottom: 20,
  },
  input: {
    fontFamily: typography.label.fontFamily,
    fontSize: 14,
    color: colors.TYPE_DARK,
    backgroundColor: colors.CARD_GROUND,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  error: {
    fontFamily: typography.label.fontFamily,
    fontSize: 12,
    color: colors.OLIVE,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: colors.OLIVE,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 8,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontFamily: typography.label.fontFamily,
    fontSize: 12,
    color: colors.TYPE_WHITE,
    letterSpacing: 1.2,
  },
  link: {
    marginTop: 20,
    alignItems: "center",
  },
  linkText: {
    fontFamily: typography.label.fontFamily,
    fontSize: 12,
    color: colors.TYPE_MUTED,
    textDecorationLine: "underline",
  },
  secondaryLink: {
    marginTop: 12,
    alignItems: "center",
  },
  secondaryLinkText: {
    fontFamily: typography.label.fontFamily,
    fontSize: 12,
    color: colors.TYPE_MUTED,
  },
});
