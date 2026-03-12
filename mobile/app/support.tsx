import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandLockup } from "../components/BrandLockup";
import { ScreenExitButton } from "../components/ScreenExitButton";
import {
  SUPPORT_LAST_UPDATED,
  SUPPORT_SECTIONS,
} from "../lib/legal";
import { colors, spacing, typography } from "../theme";

function ActionCard({
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
    <TouchableOpacity
      style={styles.actionCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.actionBody}>
        <Text style={[styles.actionTitle, destructive && styles.destructiveText]}>
          {title}
        </Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <Text style={[styles.chevron, destructive && styles.destructiveText]}>›</Text>
    </TouchableOpacity>
  );
}

export default function SupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLead}>
          <BrandLockup size="sm" />
          <Text style={styles.headerTitle}>Support</Text>
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
          Last updated {SUPPORT_LAST_UPDATED}. This screen summarizes the help,
          privacy, and account-removal paths available in ohm..
        </Text>

        {SUPPORT_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}

        <View style={styles.actions}>
          <ActionCard
            title="Open Privacy Policy"
            subtitle="Review how account, thought, and conversation data is used."
            onPress={() => router.push("/privacy" as Href)}
          />
          <ActionCard
            title="Delete Account"
            subtitle="Permanently remove your account and the data tied to it."
            onPress={() => router.push("/delete-account" as Href)}
            destructive
          />
        </View>
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
  actions: {
    gap: 10,
  },
  actionCard: {
    backgroundColor: colors.CARD_GROUND,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  actionBody: {
    flex: 1,
    gap: 6,
  },
  actionTitle: {
    fontFamily: typography.label.fontFamily,
    fontSize: 11.5,
    color: colors.TYPE_DARK,
  },
  destructiveText: {
    color: colors.OLIVE,
  },
  actionSubtitle: {
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
});
