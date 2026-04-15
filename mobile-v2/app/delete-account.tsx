import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, shared } from "../theme";
import { CircleButton } from "../components/ui/CircleButton";
import { PillButton } from "../components/ui/PillButton";
import Svg, { Path } from "react-native-svg";
import * as api from "../lib/api";
import { clearAuth } from "../lib/auth-store";

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!password.trim()) return;

    const doDelete = async () => {
      setDeleting(true);
      try {
        await api.deleteAccount(password);
        await clearAuth();
        router.replace("/login");
      } catch (e: any) {
        if (Platform.OS !== "web") Alert.alert("Error", e?.message ?? "Could not delete account");
        setDeleting(false);
      }
    };

    if (Platform.OS === "web") {
      doDelete();
    } else {
      Alert.alert(
        "Delete Account",
        "This is permanent. All your thoughts, replies, and profile data will be deleted. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete Forever", style: "destructive", onPress: doDelete },
        ]
      );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <CircleButton onPress={() => router.back()} size={32}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M12 19l-7-7 7-7" stroke={colors.TYPE_MUTED} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </CircleButton>
        <Text style={styles.title}>Delete Account</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.warning}>
          This will permanently delete your account, all your thoughts, and all your data. This cannot be undone.
        </Text>

        <Text style={styles.label}>Enter your password to confirm</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.TYPE_MUTED}
          secureTextEntry
          autoCapitalize="none"
        />

        <PillButton
          label={deleting ? "Deleting..." : "Delete My Account"}
          onPress={handleDelete}
          variant="vermillion"
          disabled={!password.trim() || deleting}
          style={{ marginTop: 24, width: "100%" }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.BG },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 },
  title: { flex: 1, textAlign: "center", fontSize: 14, fontWeight: "600", color: colors.TYPE_PRIMARY, fontFamily: "Helvetica Neue" },
  content: { paddingHorizontal: 24, paddingTop: 32 },
  warning: { fontSize: 14, color: shared.VERMILLION, lineHeight: 20, marginBottom: 24, fontFamily: "Helvetica Neue" },
  label: { fontSize: 9, fontWeight: "500", color: colors.TYPE_MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, fontFamily: "Helvetica Neue" },
  input: { backgroundColor: colors.SURFACE, borderRadius: 12, padding: 14, fontSize: 15, color: colors.TYPE_PRIMARY, fontFamily: "Helvetica Neue" },
});
