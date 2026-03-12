import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, fontFamily } from "../../theme";
import {
  fetchConversations,
  type ConversationListItem,
} from "../../lib/api";

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 30) return `${days}d`;
  return "30d+";
}

function ConversationRow({
  item,
  onPress,
}: {
  item: ConversationListItem;
  onPress: () => void;
}) {
  const isDormant = item.is_dormant;
  const isUnread = item.unread;

  return (
    <TouchableOpacity
      style={[styles.row, isDormant && styles.rowDormant]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrap}>
        {item.other_user?.photo_url ? (
          <Image source={{ uri: item.other_user.photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlc]} />
        )}
        {isUnread && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, isDormant && styles.textMuted]} numberOfLines={1}>
            {item.other_user?.name ? item.other_user.name.toUpperCase() : "—"}
          </Text>
          <Text style={[styles.time, isDormant && styles.textMuted]}>
            {formatTimeAgo(item.last_message_at)}
          </Text>
        </View>
        <Text
          style={[styles.preview, isDormant && styles.textMuted]}
          numberOfLines={1}
        >
          {item.last_message_preview || " "}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ConversationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchConversations();
      setList(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const onPressRow = useCallback(
    (item: ConversationListItem) => {
      router.push({
        pathname: "/conversation/[id]",
        params: {
          id: item.id,
          otherName: item.other_user?.name ?? "",
          otherPhoto: item.other_user?.photo_url ?? "",
          otherId: item.other_user?.id ?? "",
        },
      });
    },
    [router]
  );

  if (loading && list.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.skeletonRow} />
        <View style={styles.skeletonRow} />
        <View style={styles.skeletonRow} />
        <ActivityIndicator size="small" color={colors.TYPE_MUTED} style={styles.loader} />
      </View>
    );
  }

  if (error && list.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (list.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            When you accept a reply, the conversation begins here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Conversations</Text>
      </View>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationRow item={item} onPress={() => onPressRow(item)} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.TYPE_MUTED}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WARM_GROUND,
  },
  screenHeader: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 14,
  },
  screenTitle: {
    fontFamily: fontFamily.comico,
    fontSize: 14,
    letterSpacing: -0.3,
    color: colors.TYPE_DARK,
  },
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 0,
    paddingBottom: spacing.cardGap,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.CARD_GROUND,
    borderRadius: spacing.cardRadius,
    padding: 10,
    marginBottom: 8,
  },
  rowDormant: {
    opacity: 0.5,
  },
  avatarWrap: {
    position: "relative",
    marginRight: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarPlc: {
    backgroundColor: colors.PANEL_DEEP,
  },
  unreadDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.OLIVE,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  name: {
    ...typography.label,
    fontSize: 7,
    letterSpacing: 1,
    color: colors.TYPE_DARK,
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontFamily: fontFamily.comico,
    fontSize: 6,
    letterSpacing: 0.5,
    color: colors.TYPE_MUTED,
  },
  preview: {
    ...typography.context,
    fontSize: 8.5,
    color: colors.TYPE_MUTED,
    lineHeight: 12,
  },
  textMuted: {
    color: colors.TYPE_MUTED,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyText: {
    ...typography.replyInput,
    fontSize: 11,
    color: colors.TYPE_MUTED,
    textAlign: "center",
  },
  errorText: {
    ...typography.context,
    color: colors.TYPE_DARK,
    marginBottom: 12,
  },
  retryText: {
    color: colors.OLIVE,
    ...typography.label,
  },
  skeletonRow: {
    height: 56,
    backgroundColor: colors.CARD_GROUND,
    marginHorizontal: spacing.screenPadding,
    marginBottom: 8,
    borderRadius: spacing.cardRadius,
    opacity: 0.6,
  },
  loader: {
    marginTop: 16,
  },
});
