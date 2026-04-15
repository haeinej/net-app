import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, shared, typography } from "../theme";
import { CircleButton } from "../components/ui/CircleButton";
import Svg, { Path } from "react-native-svg";
import { updateProfile, fetchProfile, getMyUserId } from "../lib/api";

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
  rightLabel,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  maxLength?: number;
  rightLabel?: string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {rightLabel && <Text style={styles.fieldLabel}>{rightLabel}</Text>}
      </View>
      <View style={styles.fieldInput}>
        <TextInput
          style={styles.fieldText}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.TYPE_MUTED}
          maxLength={maxLength}
        />
      </View>
    </View>
  );
}

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Fetch current profile on mount
  useEffect(() => {
    (async () => {
      try {
        const userId = await getMyUserId();
        if (!userId) return;
        const profile = await fetchProfile(userId);
        setFullName(profile.name ?? "");
      } catch {
        // silent
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      await updateProfile({ name: fullName.trim() });
      router.back();
    } catch {
      setSaving(false);
      setSaveError(true);
    }
  };

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
        <Text style={styles.title}>Edit Profile</Text>
        <Pressable onPress={handleSave} disabled={saving || loadingProfile}>
          <Text style={[styles.saveText, (saving || loadingProfile) && { opacity: 0.4 }]}>Save</Text>
        </Pressable>
      </View>

      {saveError && <Text style={{ color: shared.VERMILLION, fontSize: 12, textAlign: "center", paddingVertical: 4 }}>Could not save. Try again.</Text>}
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Large avatar */}
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            <View style={styles.editBadge}>
              <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"
                  stroke={colors.TYPE_PRIMARY}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          </View>
        </View>

        {/* Fields */}
        <FormField label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your name" />
        <FormField
          label="Bio"
          value={bio}
          onChangeText={setBio}
          placeholder="A short bio"
          maxLength={68}
          rightLabel={`${bio.length}/68`}
        />
        <FormField
          label="Website"
          value={website}
          onChangeText={setWebsite}
          placeholder="Website"
        />

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.BG },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 },
  title: { flex: 1, textAlign: "center", ...typography.screenTitle, color: colors.TYPE_PRIMARY },
  avatarRow: { alignItems: "center", paddingVertical: 24 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.SURFACE, position: "relative" },
  editBadge: { position: "absolute", bottom: 0, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.SURFACE_ALT, alignItems: "center", justifyContent: "center" },
  field: { marginHorizontal: 16, marginBottom: 10 },
  fieldLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  fieldLabel: { fontSize: 9, fontWeight: "500", color: colors.TYPE_MUTED, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "Helvetica Neue" },
  fieldInput: { backgroundColor: colors.SURFACE, padding: 12, borderRadius: 10 },
  fieldText: { fontSize: 15, color: colors.TYPE_PRIMARY, fontFamily: "Helvetica Neue" },
  saveText: { fontSize: 14, fontWeight: "600", color: shared.VERMILLION, fontFamily: "Helvetica Neue" },
});
