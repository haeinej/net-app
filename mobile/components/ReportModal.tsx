import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { colors, typography, primitives, radii, spacing } from "../theme";
import {
  reportContent,
  blockUser,
  type ReportReason,
  type ReportTargetType,
} from "../lib/api";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "spam", label: "Spam or misleading" },
  { value: "sexual_content", label: "Sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "self_harm", label: "Self-harm" },
  { value: "other", label: "Other" },
];

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** User ID of the content author, for the optional block step. */
  targetUserId?: string;
  onReported?: () => void;
  onBlocked?: () => void;
}

export function ReportModal({
  visible,
  onClose,
  targetType,
  targetId,
  targetUserId,
  onReported,
  onBlocked,
}: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSelectedReason(null);
    setDescription("");
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setSubmitting(true);
    try {
      await reportContent(targetType, targetId, selectedReason, description);
      onReported?.();

      if (targetUserId) {
        Alert.alert(
          "Report submitted",
          "Would you also like to block this user? Their content will be removed from your feed immediately.",
          [
            { text: "No thanks", style: "cancel", onPress: handleClose },
            {
              text: "Block user",
              style: "destructive",
              onPress: async () => {
                try {
                  await blockUser(targetUserId);
                  onBlocked?.();
                } catch {
                  // block failed silently — report was still submitted
                }
                handleClose();
              },
            },
          ]
        );
      } else {
        Alert.alert("Report submitted", "Thank you for helping keep ohm safe.", [
          { text: "OK", onPress: handleClose },
        ]);
      }
    } catch (error) {
      Alert.alert(
        "Could not submit report",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} disabled={submitting}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Report</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>Why are you reporting this?</Text>

          {REASONS.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[
                styles.reasonRow,
                selectedReason === r.value && styles.reasonRowSelected,
              ]}
              onPress={() => setSelectedReason(r.value)}
              disabled={submitting}
            >
              <View
                style={[
                  styles.radio,
                  selectedReason === r.value && styles.radioSelected,
                ]}
              />
              <Text style={styles.reasonText}>{r.label}</Text>
            </TouchableOpacity>
          ))}

          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
            Additional details (optional)
          </Text>
          <TextInput
            style={[primitives.inputReading, styles.descriptionInput]}
            value={description}
            onChangeText={setDescription}
            placeholder="Tell us more..."
            placeholderTextColor={colors.TYPE_MUTED}
            multiline
            maxLength={500}
            editable={!submitting}
          />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              primitives.buttonPrimary,
              { backgroundColor: colors.VERMILLION },
              (!selectedReason || submitting) && primitives.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!selectedReason || submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.TYPE_WHITE} size="small" />
            ) : (
              <Text style={primitives.buttonPrimaryText}>Submit report</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.CARD_BORDER,
  },
  cancelText: {
    ...typography.body,
    color: colors.TYPE_MUTED,
  },
  title: {
    ...typography.labelLg,
    color: colors.TYPE_DARK,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: spacing.screenPadding,
  },
  sectionLabel: {
    ...primitives.fieldLabel,
    marginBottom: 12,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.input,
    marginBottom: 6,
    backgroundColor: colors.CARD_GROUND,
  },
  reasonRowSelected: {
    backgroundColor: `rgba(235, 65, 1, 0.08)`,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.TYPE_MUTED,
    marginRight: 14,
  },
  radioSelected: {
    borderColor: colors.VERMILLION,
    backgroundColor: colors.VERMILLION,
  },
  reasonText: {
    ...typography.body,
    color: colors.TYPE_DARK,
  },
  descriptionInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  footer: {
    padding: spacing.screenPadding,
    paddingBottom: 34,
  },
});
