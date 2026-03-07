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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../theme";
import { login } from "../lib/api";
import { setAuth, setOnboardingComplete } from "../lib/auth-store";
import { setCachedUserId } from "../lib/api";

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
      const { token, user_id } = await login(e, p);
      await setAuth(token, user_id);
      await setOnboardingComplete(true);
      setCachedUserId(user_id);
      router.replace("/(tabs)");
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
        <Text style={styles.title}>net.</Text>
        <Text style={styles.subtitle}>Log in</Text>

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
    ...typography.logo,
    color: colors.TYPE_DARK,
    marginBottom: 4,
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
    color: colors.ACCENT_ORANGE,
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.ACCENT_ORANGE,
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
});
