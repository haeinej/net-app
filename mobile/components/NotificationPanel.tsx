import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, spacing, typography, shadows, radii } from "../theme";
import type { NotificationItem } from "../lib/api";

interface NotificationPanelProps {
  items: NotificationItem[];
  loading?: boolean;
  acceptingReplyId?: string | null;
  onAccept: (item: NotificationItem) => void;
  onIgnore: (replyId: string) => void;
}

export function NotificationPanel({
  items,
  loading,
  acceptingReplyId,
  onAccept,
  onIgnore,
}: NotificationPanelProps) {
  const router = useRouter();

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
      <Text style={styles.title}>Pending replies</Text>
      <Text style={styles.caption}>Your own thought view shows the full reply inbox.</Text>
      {items.map((n) => (
        <View key={n.reply_id} style={styles.row}>
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={!n.replier?.id}
            onPress={() => {
              if (!n.replier?.id) return;
              router.push({ pathname: "/user/[id]", params: { id: n.replier.id } });
            }}
          >
            {n.replier?.photo_url ? (
              <Image source={{ uri: n.replier.photo_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
          </TouchableOpacity>
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
                style={[styles.acceptBtn, acceptingReplyId === n.reply_id && styles.acceptBtnDisabled]}
                disabled={acceptingReplyId != null}
                onPress={() => onAccept(n)}
              >
                {acceptingReplyId === n.reply_id ? (
                  <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
                ) : (
                  <Text style={styles.acceptText}>Reply in chat</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ignoreBtn}
                disabled={acceptingReplyId != null}
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
    paddingVertical: 14,
    paddingHorizontal: spacing.screenPadding,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.CARD_BORDER,
    ...shadows.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  title: {
    ...typography.label,
    textTransform: "uppercase",
    color: colors.TYPE_DARK,
    marginBottom: 4,
  },
  caption: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    marginBottom: 14,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: colors.CARD_BORDER,
  },
  body: { flex: 1 },
  name: {
    ...typography.label,
    textTransform: "uppercase",
    color: colors.TYPE_DARK,
    marginBottom: 4,
  },
  preview: {
    ...typography.context,
    color: colors.TYPE_DARK,
    marginBottom: 3,
  },
  thought: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    marginBottom: 10,
  },
  actions: { flexDirection: "row", gap: 12, alignItems: "center" },
  acceptBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: colors.OLIVE,
    borderRadius: radii.button,
    minWidth: 100,
    alignItems: "center" as const,
    ...shadows.raised,
  },
  acceptBtnDisabled: {
    opacity: 0.6,
  },
  acceptText: {
    ...typography.metadata,
    color: colors.TYPE_WHITE,
  },
  ignoreBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
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
