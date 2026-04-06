import { memo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { colors, spacing, typography } from "../theme";
import type { NotificationItem } from "../lib/api";

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

interface NotificationPanelProps {
  items: NotificationItem[];
  loading: boolean;
  onDismiss: () => void;
}

export const NotificationPanel = memo(function NotificationPanel({
  items,
  loading,
  onDismiss,
}: NotificationPanelProps) {
  const router = useRouter();

  const handleTap = useCallback(
    (item: NotificationItem) => {
      onDismiss();
      router.push({ pathname: "/thought/[id]", params: { id: item.id } });
    },
    [router, onDismiss]
  );

  return (
    <View style={styles.container}>
      {loading && items.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.TYPE_MUTED} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No new replies</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.row}
              onPress={() => handleTap(item)}
              activeOpacity={0.7}
            >
              <View style={styles.rowContent}>
                <View style={styles.rowHeader}>
                  <Text style={styles.authorName} numberOfLines={1}>
                    {item.author?.name ?? "someone"}
                  </Text>
                  <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
                </View>
                <Text style={styles.sentence} numberOfLines={1}>
                  {item.sentence}
                </Text>
                {item.original_thought ? (
                  <Text style={styles.originalRef} numberOfLines={1}>
                    in response to your "{item.original_thought.sentence}"
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.CARD_GROUND,
    borderBottomWidth: 1,
    borderBottomColor: colors.CARD_BORDER,
    maxHeight: 280,
  },
  loadingWrap: {
    padding: 24,
    alignItems: "center",
  },
  emptyWrap: {
    padding: 24,
    alignItems: "center",
  },
  emptyText: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 8,
  },
  row: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 12,
  },
  rowContent: {
    gap: 3,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  authorName: {
    ...typography.metadata,
    color: colors.TYPE_DARK,
    fontWeight: "600",
    flex: 1,
  },
  time: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    marginLeft: 8,
  },
  sentence: {
    ...typography.bodySmall,
    color: colors.TYPE_DARK,
  },
  originalRef: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    fontStyle: "italic",
  },
});
