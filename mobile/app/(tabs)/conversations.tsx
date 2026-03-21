import React, { useState, useCallback, useEffect, useRef } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  type GestureResponderEvent,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, fontFamily, primitives, opacity, radii } from "../../theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  fetchConversations,
  type ConversationListItem,
} from "../../lib/api";
import { formatRelativeTime } from "../../lib/format";

const ConversationRow = React.memo(function ConversationRow({
  item,
  onPress,
  onProfilePress,
}: {
  item: ConversationListItem;
  onPress: () => void;
  onProfilePress: () => void;
}) {
  const isDormant = item.is_dormant;
  const isUnread = item.unread;

  return (
    <TouchableOpacity
      style={[
        styles.row,
        isUnread ? styles.rowUnread : styles.rowRead,
        isDormant && styles.rowDormant,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={styles.avatarWrap}
        onPress={(event: GestureResponderEvent) => {
          event.stopPropagation();
          onProfilePress();
        }}
        disabled={!item.other_user?.id}
        activeOpacity={0.7}
      >
        {item.other_user?.photo_url ? (
          <Image source={{ uri: item.other_user.photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlc]} />
        )}
      </TouchableOpacity>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text
            style={[
              styles.name,
              isUnread ? styles.nameUnread : styles.nameRead,
              isDormant && styles.textMuted,
            ]}
            numberOfLines={1}
          >
            {item.other_user?.name ? item.other_user.name.toUpperCase() : "—"}
          </Text>
          <Text
            style={[
              styles.time,
              isUnread ? styles.timeUnread : styles.timeRead,
              isDormant && styles.textMuted,
            ]}
          >
            {item.last_message_at ? formatRelativeTime(item.last_message_at) : ""}
          </Text>
        </View>
        <Text
          style={[
            styles.preview,
            isUnread ? styles.previewUnread : styles.previewRead,
            isDormant && styles.textMuted,
          ]}
          numberOfLines={1}
        >
          {item.last_message_preview || " "}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export default function ConversationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { containerStyle } = useResponsiveLayout();
  const [list, setList] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const load = useCallback(
    async (opts: { isRefresh?: boolean } = {}) => {
      if (inFlight.current) {
        return inFlight.current;
      }

      const { isRefresh } = opts;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      const p = (async () => {
        try {
          const data = await fetchConversations();
          setList(data);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load");
        } finally {
          setLoading(false);
          setRefreshing(false);
          inFlight.current = null;
        }
      })();

      inFlight.current = p;
      return p;
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    load({ isRefresh: true });
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

  const onPressProfile = useCallback(
    (item: ConversationListItem) => {
      if (!item.other_user?.id) return;
      router.push({ pathname: "/user/[id]", params: { id: item.other_user.id } });
    },
    [router]
  );

  const openHistoryInfo = useCallback(() => {
    Alert.alert(
      "Conversation history",
      "If neither person replies for 2 weeks, the chat history clears automatically."
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ConversationListItem }) => (
      <ConversationRow
        item={item}
        onPress={() => onPressRow(item)}
        onProfilePress={() => onPressProfile(item)}
      />
    ),
    [onPressRow, onPressProfile]
  );

  const header = (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>Conversations</Text>
      <TouchableOpacity
        style={styles.infoButton}
        activeOpacity={0.8}
        onPress={openHistoryInfo}
      >
        <Text style={styles.infoButtonText}>i</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && list.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        {header}
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
        {header}
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
        {header}
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
      {header}
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, containerStyle]}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 18,
  },
  screenTitle: {
    ...typography.heading,
    color: colors.TYPE_DARK,
  },
  infoButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.CARD_GROUND,
  },
  infoButtonText: {
    fontFamily: fontFamily.comico,
    fontSize: 22,
    color: colors.TYPE_DARK,
    marginTop: -1,
  },
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 4,
    paddingBottom: spacing.cardGap + 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.card,
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 14,
    marginBottom: spacing.cardGap,
    minHeight: 86,
  },
  rowUnread: {
    backgroundColor: colors.CARD_GROUND,
    borderWidth: 1,
    borderColor: colors.CARD_BORDER,
  },
  rowRead: {
    backgroundColor: colors.VERMILLION,
    shadowColor: colors.VERMILLION,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  rowDormant: {
    opacity: opacity.dormant,
  },
  avatarWrap: {
    position: "relative",
    marginRight: 14,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarPlc: {
    backgroundColor: colors.PANEL_DEEP,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  name: {
    ...typography.label,
    textTransform: "uppercase",
    flex: 1,
    marginRight: 12,
  },
  nameUnread: {
    color: colors.TYPE_DARK,
  },
  nameRead: {
    color: colors.TYPE_WHITE,
  },
  time: {
    ...typography.metadata,
  },
  timeUnread: {
    color: colors.TYPE_MUTED,
  },
  timeRead: {
    color: "rgba(255,255,255,0.8)",
  },
  preview: {
    ...typography.bodySmall,
  },
  previewUnread: {
    color: colors.TYPE_MUTED,
  },
  previewRead: {
    color: "rgba(255,255,255,0.88)",
  },
  textMuted: {
    color: colors.TYPE_MUTED,
  },
  centered: {
    ...primitives.centered,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.TYPE_MUTED,
    textAlign: "center",
  },
  errorText: {
    ...typography.context,
    fontSize: 16,
    color: colors.TYPE_DARK,
    marginBottom: 12,
  },
  retryText: {
    ...typography.label,
    textTransform: "uppercase",
    color: colors.OLIVE,
  },
  skeletonRow: {
    height: 86,
    backgroundColor: colors.CARD_GROUND,
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.cardGap,
    borderRadius: radii.card,
    opacity: 0.6,
  },
  loader: {
    marginTop: 16,
  },
});
