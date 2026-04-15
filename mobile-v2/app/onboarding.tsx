import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Platform } from "react-native";

const hapticLight = async () => {
  if (Platform.OS === "web") return;
  const h = await import("expo-haptics");
  h.impactAsync(h.ImpactFeedbackStyle.Light);
};
import { colors, shared, springs, motion } from "../theme";
import { PillButton } from "../components/ui/PillButton";
import { updateProfile } from "../lib/api";
import { setOnboardingComplete } from "../lib/auth-store";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TOPICS = [
  "philosophy",
  "relationships",
  "art",
  "music",
  "technology",
  "identity",
  "nature",
  "society",
  "language",
  "dreams",
  "memory",
  "solitude",
];

function TopicPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      onPressIn={() => {
        scale.value = withSpring(motion.buttonActiveScale, springs.snap);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springs.snap);
      }}
      style={[styles.pill, selected && styles.pillSelected, animatedStyle]}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (topic: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const canContinue = selected.size >= 3 && !saving;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.title}>What do you think about?</Text>
        <Text style={styles.subtitle}>Pick at least 3</Text>

        <View style={styles.cloud}>
          {TOPICS.map((topic) => (
            <TopicPill
              key={topic}
              label={topic}
              selected={selected.has(topic)}
              onPress={() => toggle(topic)}
            />
          ))}
        </View>
      </View>

      <View style={styles.buttonRow}>
        {error && <Text style={{ color: shared.VERMILLION, fontSize: 12, textAlign: "center", marginBottom: 8 }}>Something went wrong. Try again.</Text>}
        <PillButton
          label={saving ? "Saving..." : "Continue"}
          onPress={async () => {
            setSaving(true);
            try {
              await updateProfile({ interests: Array.from(selected) });
              await setOnboardingComplete(true);
              router.replace("/(tabs)");
            } catch {
              setSaving(false);
              setError(true);
            }
          }}
          variant="vermillion"
          disabled={!canContinue}
          style={{ width: "100%", paddingVertical: 12 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.BG,
    justifyContent: "space-between",
  },
  content: {
    paddingTop: 70,
  },
  title: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: colors.TYPE_PRIMARY,
    letterSpacing: -0.3,
    marginBottom: 4,
    fontFamily: "Helvetica Neue",
  },
  subtitle: {
    textAlign: "center",
    fontSize: 9,
    color: colors.TYPE_MUTED,
    marginBottom: 28,
    fontFamily: "Helvetica Neue",
  },
  cloud: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 24,
  },
  pill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.CARD_BORDER,
  },
  pillSelected: {
    backgroundColor: shared.VERMILLION,
    borderColor: shared.VERMILLION,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.TYPE_MUTED,
    fontFamily: "Helvetica Neue",
  },
  pillTextSelected: {
    color: "#FFFFFF",
  },
  buttonRow: {
    paddingHorizontal: 32,
  },
});
