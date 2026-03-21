import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandLockup } from "../components/BrandLockup";
import { ScreenExitButton } from "../components/ScreenExitButton";
import {
  EULA_LAST_UPDATED,
  EULA_SECTIONS,
} from "../lib/legal";
import { colors, spacing, typography } from "../theme";

export default function TermsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLead}>
          <BrandLockup size="sm" />
          <Text style={styles.headerTitle}>Terms of Use</Text>
        </View>
        <ScreenExitButton onPress={() => router.back()} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Last updated {EULA_LAST_UPDATED}. These terms govern your use of ohm.
          and describe your responsibilities as a user.
        </Text>

        {EULA_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
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
  intro: {
    fontFamily: typography.context.fontFamily,
    fontSize: 11.5,
    lineHeight: 18,
    color: colors.TYPE_DARK,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontFamily: typography.label.fontFamily,
    fontSize: 10,
    color: colors.TYPE_DARK,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  paragraph: {
    fontFamily: typography.context.fontFamily,
    fontSize: 11.5,
    lineHeight: 18,
    color: colors.TYPE_DARK,
  },
});
