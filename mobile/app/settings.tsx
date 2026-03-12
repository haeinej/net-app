import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Constants from "expo-constants";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandLockup } from "../components/BrandLockup";
import { ScreenExitButton } from "../components/ScreenExitButton";
import { clearAuth } from "../lib/auth-store";
import { setCachedUserId } from "../lib/api";
import { colors, spacing, typography } from "../theme";

function SettingsRow({
  title,
  subtitle,
  onPress,
  destructive = false,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, destructive && styles.rowTitleDestructive]}>
          {title}
        </Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Text style={[styles.chevron, destructive && styles.rowTitleDestructive]}>›</Text>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const handleLogout = () => {
    Alert.alert("Log out", "You will need to sign in again to use ohm..", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await clearAuth();
          setCachedUserId(null);
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLead}>
          <BrandLockup size="sm" />
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <ScreenExitButton onPress={() => router.back()} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <SettingsRow
            title="Privacy Policy"
            subtitle="Read how ohm. stores and uses account and conversation data."
            onPress={() => router.push("/privacy" as Href)}
          />
          <SettingsRow
            title="Delete Account"
            subtitle="Permanently remove your account and the data tied to it."
            onPress={() => router.push("/delete-account" as Href)}
            destructive
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Session</Text>
          <TouchableOpacity
            style={[styles.row, styles.logoutRow]}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerText}>Version {appVersion}</Text>
      </ScrollView>
    </View>
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
    gap: 22,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily: typography.label.fontFamily,
    fontSize: 9,
    color: colors.TYPE_MUTED,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  row: {
    backgroundColor: colors.CARD_GROUND,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowBody: {
    flex: 1,
    gap: 6,
  },
  rowTitle: {
    fontFamily: typography.label.fontFamily,
    fontSize: 11.5,
    color: colors.TYPE_DARK,
  },
  rowTitleDestructive: {
    color: colors.OLIVE,
  },
  rowSubtitle: {
    fontFamily: typography.context.fontFamily,
    fontSize: 11,
    lineHeight: 15,
    color: colors.TYPE_MUTED,
  },
  chevron: {
    fontSize: 22,
    lineHeight: 22,
    color: colors.TYPE_MUTED,
  },
  logoutRow: {
    justifyContent: "center",
  },
  logoutText: {
    fontFamily: typography.label.fontFamily,
    fontSize: 11.5,
    color: colors.TYPE_DARK,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  footerText: {
    fontFamily: typography.context.fontFamily,
    fontSize: 10.5,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    marginTop: 8,
  },
});
