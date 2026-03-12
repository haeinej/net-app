import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../theme";
import { login } from "../lib/api";
import {
  setAuth,
  setOnboardingComplete,
  setOnboardingStep,
} from "../lib/auth-store";
import { setCachedUserId } from "../lib/api";
import { BrandLockup } from "../components/BrandLockup";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      <View style={styles.content}>
        <BrandLockup style={styles.brand} />
        <Text style={styles.subtitle}>Where your thoughts find someone</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.TYPE_MUTED}
          value={email}
          onChangeText={(t) => { setEmail(t); setError(null); }}
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
          onChangeText={(t) => { setPassword(t); setError(null); }}
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
          style={styles.secondaryLink}
          onPress={() => router.push("/privacy" as Href)}
          disabled={loading}
        >
          <Text style={styles.secondaryLinkText}>Privacy policy</Text>
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
  brand: {
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: typography.label.fontFamily,
    fontSize: 12,
    color: colors.TYPE_MUTED,
    marginBottom: 24,
    textTransform: "uppercase",
    letterSpacing: 1,
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
  button: {
    backgroundColor: colors.OLIVE,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 8,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontFamily: typography.label.fontFamily,
    fontSize: 12,
    color: colors.TYPE_WHITE,
    letterSpacing: 1.2,
  },
  link: {
    marginTop: 24,
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
    fontSize: 11,
    color: colors.TYPE_MUTED,
  },
});
