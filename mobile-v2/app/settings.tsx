import { View, Text, StyleSheet, ScrollView, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, shared, typography } from "../theme";
import { CircleButton } from "../components/ui/CircleButton";
import { SettingsRow, SectionHeader } from "../components/ui/SettingsRow";
import Svg, { Path } from "react-native-svg";
import { clearAuth } from "../lib/auth-store";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <CircleButton onPress={() => router.back()} size={32}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path
              d="M19 12H5M12 19l-7-7 7-7"
              stroke={colors.TYPE_MUTED}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </CircleButton>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <SectionHeader title="Permissions" />
        <SettingsRow label="Push notifications" value="On" first last />

        <SectionHeader title="Account" />
        <SettingsRow label="Delete account" onPress={() => router.push("/delete-account")} first last />

        <SectionHeader title="Feedback" />
        <SettingsRow
          label="Share your thoughts"
          onPress={() => router.push("/feedback")}
          first
          last
        />

        <SectionHeader title="Legal" />
        <SettingsRow
          label="Privacy policy"
          onPress={() => router.push("/privacy")}
          first
        />
        <SettingsRow
          label="Terms of service"
          onPress={() => router.push("/terms")}
          last
        />

        <View style={{ height: 24 }} />
        <SettingsRow
          label="Sign out"
          onPress={() => {
            const doLogout = async () => {
              await clearAuth();
              router.replace("/login");
            };
            if (Platform.OS === "web") {
              doLogout();
            } else {
              Alert.alert("Sign out", "Are you sure?", [
                { text: "Cancel", style: "cancel" },
                { text: "Sign out", style: "destructive", onPress: doLogout },
              ]);
            }
          }}
          first
          last
        />
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: {
    flex: 1,
    textAlign: "center",
    ...typography.screenTitle,
    color: colors.TYPE_PRIMARY,
  },
});
