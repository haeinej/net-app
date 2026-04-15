import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors } from "../theme";
import { CircleButton } from "../components/ui/CircleButton";
import Svg, { Path } from "react-native-svg";

export default function TermsScreen() {
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
        <Text style={styles.title}>Terms of Service</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Acceptance</Text>
        <Text style={styles.body}>
          By using ohm., you agree to these terms. If you don't agree, please don't use the app.
        </Text>
        <Text style={styles.heading}>Your content</Text>
        <Text style={styles.body}>
          You own the thoughts you post. By posting, you grant ohm. a license to display your content to other users through the app. You can delete your content at any time.
        </Text>
        <Text style={styles.heading}>Conduct</Text>
        <Text style={styles.body}>
          Be thoughtful. Don't post content that is hateful, harmful, or illegal. We reserve the right to remove content and suspend accounts that violate these guidelines.
        </Text>
        <Text style={styles.heading}>Availability</Text>
        <Text style={styles.body}>
          ohm. is provided as-is. We do our best to keep the service running but cannot guarantee uninterrupted access.
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
