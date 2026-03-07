import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography } from "../theme";
import type { NotificationItem } from "../lib/api";

interface NotificationPanelProps {
  items: NotificationItem[];
  loading?: boolean;
  onAccept: (replyId: string) => void;
  onIgnore: (replyId: string) => void;
}

export function NotificationPanel({
  items,
  loading,
  onAccept,
  onIgnore,
}: NotificationPanelProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.TYPE_MUTED} />
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>No pending replies</Text>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      {items.map((n) => (
        <View key={n.reply_id} style={styles.row}>
          {n.replier?.photo_url ? (
            <Image source={{ uri: n.replier.photo_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {n.replier?.name ? n.replier.name.toUpperCase() : "—"}
            </Text>
            <Text style={styles.preview} numberOfLines={2}>
              {n.reply_preview}
            </Text>
            {n.thought && (
              <Text style={styles.thought} numberOfLines={1}>
                Replied to: {n.thought.sentence}
              </Text>
            )}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => onAccept(n.reply_id)}
              >
                <Text style={styles.acceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ignoreBtn}
                onPress={() => onIgnore(n.reply_id)}
              >
                <Text style={styles.ignoreText}>Ignore</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.CARD_GROUND,
    paddingVertical: 12,
    paddingHorizontal: spacing.screenPadding,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  avatar: {
    width: spacing.profilePhotoSize,
    height: spacing.profilePhotoSize,
    borderRadius: spacing.profilePhotoSize / 2,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: colors.TYPE_MUTED,
  },
  body: { flex: 1 },
  name: {
    ...typography.label,
    color: colors.TYPE_DARK,
    marginBottom: 4,
  },
  preview: {
    ...typography.context,
    fontSize: 10,
    color: colors.TYPE_DARK,
    marginBottom: 2,
  },
  thought: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    marginBottom: 8,
  },
  actions: { flexDirection: "row", gap: 12 },
  acceptBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.ACCENT_ORANGE,
    borderRadius: 6,
  },
  acceptText: {
    ...typography.label,
    fontSize: 8,
    color: colors.TYPE_WHITE,
  },
  ignoreBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  ignoreText: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
  },
  empty: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    textAlign: "center",
  },
});
