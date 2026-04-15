import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors } from "../theme";
import { CircleButton } from "../components/ui/CircleButton";
import Svg, { Path } from "react-native-svg";

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <CircleButton onPress={() => router.back()} size={32}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M12 19l-7-7 7-7" stroke={colors.TYPE_MUTED} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </CircleButton>
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>What we collect</Text>
        <Text style={styles.body}>
          ohm. collects your email, name, and the thoughts you post. We use this to provide the service and improve your experience.
        </Text>
        <Text style={styles.heading}>How we use it</Text>
        <Text style={styles.body}>
          Your thoughts are shown to other users through the feed. Your profile information is visible to friends. We do not sell your data to third parties.
        </Text>
        <Text style={styles.heading}>Data storage</Text>
        <Text style={styles.body}>
          Your data is stored securely on our servers. You can request deletion of your account and all associated data at any time through Settings.
        </Text>
        <Text style={styles.heading}>Contact</Text>
        <Text style={styles.body}>
          Questions about privacy? Reach us at privacy@ohmmmm.com.
        </Text>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.BG },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 },
  title: { flex: 1, textAlign: "center", fontSize: 14, fontWeight: "600", color: colors.TYPE_PRIMARY, fontFamily: "Helvetica Neue" },
  scroll: { flex: 1, paddingHorizontal: 20 },
  heading: { fontSize: 14, fontWeight: "700", color: colors.TYPE_PRIMARY, marginTop: 24, marginBottom: 8, fontFamily: "Helvetica Neue" },
  body: { fontSize: 13, color: colors.TYPE_SECONDARY, lineHeight: 20, fontFamily: "Helvetica Neue" },
});
