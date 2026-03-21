import { useCallback, useMemo, useState } from "react";
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
import { colors, spacing, typography, primitives, opacity } from "../theme";
import { requestPasswordReset, resetPassword } from "../lib/api";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validateStrongPassword(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (!/\d/.test(password)) return "Password must include a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a symbol";
  return null;
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    email?: string;
    token_hash?: string;
    access_token?: string;
    type?: string;
    error?: string;
    error_description?: string;
  }>();

  const tokenHash = typeof params.token_hash === "string" ? params.token_hash.trim() : "";
  const accessToken =
    typeof params.access_token === "string" ? params.access_token.trim() : "";
  const resetType = typeof params.type === "string" ? params.type.trim() : undefined;
  const hasLinkToken = tokenHash.length > 0 || accessToken.length > 0;
  const deepLinkError =
    typeof params.error_description === "string"
      ? params.error_description
      : typeof params.error === "string"
        ? params.error
        : null;

  const [email, setEmail] = useState(() => normalizeEmail(params.email ?? ""));
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(deepLinkError);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const cleanEmail = useMemo(() => normalizeEmail(email), [email]);

  const handleRequestReset = useCallback(async () => {
    if (!cleanEmail) {
      setError("Enter your email first");
      return;
    }

    setError(null);
    setNotice(null);
    setSendingReset(true);
    try {
      await requestPasswordReset(cleanEmail);
      setNotice("Check your email for a reset link or code.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setSendingReset(false);
    }
  }, [cleanEmail]);

  const handleResetPassword = useCallback(async () => {
    const passwordError = validateStrongPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!hasLinkToken) {
      if (!cleanEmail || !/^\d{6,8}$/.test(code.trim())) {
        setError("Enter your email and reset code");
        return;
      }
    }

    setError(null);
    setNotice(null);
    setResetting(true);
    try {
      if (hasLinkToken) {
        await resetPassword(
          tokenHash
            ? {
                password,
                tokenHash,
                type: resetType,
              }
            : {
                password,
                accessToken,
                type: resetType,
              }
        );
      } else {
        await resetPassword({
          email: cleanEmail,
          code: code.trim(),
          password,
        });
      }
      setNotice("Password updated. You can log in now.");
      setPassword("");
      setConfirmPassword("");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setResetting(false);
    }
  }, [accessToken, cleanEmail, code, confirmPassword, hasLinkToken, password, resetType, tokenHash]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.copy}>
          {hasLinkToken
            ? "Choose a new password to finish resetting your account."
            : "Enter your email to receive a reset link or code, then set a new password."}
        </Text>

        {!hasLinkToken ? (
          <>
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
                setNotice(null);
              }}
              editable={!sendingReset && !resetting}
            />

            <TouchableOpacity
              style={[styles.secondaryButton, (sendingReset || resetting) && styles.buttonDisabled]}
              onPress={handleRequestReset}
              disabled={sendingReset || resetting}
            >
              {sendingReset ? (
                <ActivityIndicator size="small" color={colors.OLIVE} />
              ) : (
                <Text style={styles.secondaryButtonText}>SEND RESET EMAIL</Text>
              )}
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="Reset code"
              placeholderTextColor={colors.TYPE_MUTED}
              keyboardType="number-pad"
              value={code}
              onChangeText={(value) => {
                setCode(value.replace(/\D/g, "").slice(0, 8));
                setError(null);
                setNotice(null);
              }}
              editable={!sendingReset && !resetting}
            />
          </>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="New password"
          placeholderTextColor={colors.TYPE_MUTED}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError(null);
            setNotice(null);
          }}
          secureTextEntry
          editable={!sendingReset && !resetting}
        />

        <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor={colors.TYPE_MUTED}
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            setError(null);
            setNotice(null);
          }}
          secureTextEntry
          editable={!sendingReset && !resetting}
        />

        <Text style={styles.passwordGuide}>
          Use 10+ characters with uppercase, lowercase, a number, and a symbol.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, resetting && styles.buttonDisabled]}
          onPress={handleResetPassword}
          disabled={resetting || sendingReset}
        >
          {resetting ? (
            <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
          ) : (
            <Text style={styles.primaryButtonText}>RESET PASSWORD</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.link}
          onPress={() => router.replace("/login")}
          disabled={sendingReset || resetting}
        >
          <Text style={styles.linkText}>Back to login</Text>
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
    ...typography.buttonText,
    color: colors.TYPE_DARK,
    marginBottom: 12,
    textTransform: "uppercase",
    textAlign: "center",
  },
  copy: {
    ...typography.bodySmall,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    marginBottom: 18,
  },
  input: {
    ...primitives.input,
    marginBottom: 12,
  },
  passwordGuide: {
    ...typography.context,
    color: colors.TYPE_MUTED,
    marginTop: -2,
    marginBottom: 12,
  },
  error: {
    ...primitives.errorText,
  },
  notice: {
    ...typography.context,
    color: colors.OLIVE,
    marginBottom: 8,
    textAlign: "center",
  },
  primaryButton: {
    ...primitives.buttonPrimary,
    backgroundColor: colors.OLIVE,
    marginTop: 8,
  },
  primaryButtonText: {
    ...primitives.buttonPrimaryText,
  },
  secondaryButton: {
    borderRadius: 999,
    minHeight: 50,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(151,156,91,0.22)",
    backgroundColor: "rgba(151,156,91,0.08)",
    marginTop: 2,
    marginBottom: 12,
  },
  secondaryButtonText: {
    ...primitives.linkSubtle,
    color: colors.OLIVE,
    textTransform: "uppercase",
  },
  buttonDisabled: {
    opacity: opacity.disabled,
  },
  link: {
    marginTop: 18,
    alignItems: "center",
  },
  linkText: {
    ...primitives.linkSubtle,
  },
});
