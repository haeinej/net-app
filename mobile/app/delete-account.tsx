import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandLockup } from "../components/BrandLockup";
import { ScreenExitButton } from "../components/ScreenExitButton";
import { deleteAccount, setCachedUserId } from "../lib/api";
import { clearAuth, resetIntroForLogout } from "../lib/auth-store";
import { colors, spacing, typography } from "../theme";

const CONFIRMATION_TEXT = "DELETE";

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = useMemo(
    () =>
      password.length >= 8 &&
      confirmation.trim().toUpperCase() === CONFIRMATION_TEXT &&
      !submitting,
    [confirmation, password.length, submitting]
  );

  const handleDelete = async () => {
    if (!canDelete) return;
    setError(null);
    setSubmitting(true);

    try {
      await deleteAccount(password);
      await clearAuth();
      await resetIntroForLogout();
      setCachedUserId(null);
      Alert.alert(
        "Account deleted",
        "Your account and the data tied to it have been removed from ohm.."
      );
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete your account."
      );
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <View style={styles.headerLead}>
          <BrandLockup size="sm" />
          <Text style={styles.headerTitle}>Delete Account</Text>
        </View>
        <ScreenExitButton onPress={() => router.back()} disabled={submitting} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>This is permanent.</Text>
          <Text style={styles.warningBody}>
            Deleting your account removes your profile, thoughts, replies,
            conversations, and the related app data tied to this account from
            the primary application database.
          </Text>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Current password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor={colors.TYPE_MUTED}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError(null);
            }}
            secureTextEntry
            editable={!submitting}
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Type DELETE to confirm</Text>
          <TextInput
            style={styles.input}
            placeholder={CONFIRMATION_TEXT}
            placeholderTextColor={colors.TYPE_MUTED}
            value={confirmation}
            onChangeText={(text) => {
              setConfirmation(text);
              setError(null);
            }}
            autoCapitalize="characters"
            editable={!submitting}
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.deleteButton, !canDelete && styles.deleteButtonDisabled]}
          onPress={handleDelete}
          disabled={!canDelete}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
          ) : (
            <Text style={styles.deleteButtonText}>Delete Account</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WARM_GROUND,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(26,26,22,0.06)",
  },
  headerLead: {
    flex: 1,
    gap: 6,
  },
  headerTitle: {
    fontFamily: typography.label.fontFamily,
    fontSize: 9,
    color: colors.TYPE_MUTED,
    letterSpacing: 1.2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 24,
    gap: 18,
  },
  warningCard: {
    backgroundColor: colors.CARD_GROUND,
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  warningTitle: {
    fontFamily: typography.label.fontFamily,
    fontSize: 11,
    color: colors.OLIVE,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  warningBody: {
    fontFamily: typography.context.fontFamily,
    fontSize: 11.5,
    lineHeight: 18,
    color: colors.TYPE_DARK,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: typography.label.fontFamily,
    fontSize: 9,
    color: colors.TYPE_MUTED,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  input: {
    fontFamily: typography.context.fontFamily,
    fontSize: 12,
    color: colors.TYPE_DARK,
    backgroundColor: colors.CARD_GROUND,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  errorText: {
    fontFamily: typography.context.fontFamily,
    fontSize: 11.5,
    color: colors.OLIVE,
  },
  deleteButton: {
    marginTop: 6,
    backgroundColor: colors.OLIVE,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
  },
  deleteButtonDisabled: {
    opacity: 0.45,
  },
  deleteButtonText: {
    fontFamily: typography.label.fontFamily,
    fontSize: 11,
    color: colors.TYPE_WHITE,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
});
