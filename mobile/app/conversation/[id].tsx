import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../../theme";
import {
  fetchConversationMessages,
  postConversationMessage,
  getMyUserId,
  type ConversationMessage,
} from "../../lib/api";

function formatMessageTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function ConversationThreadScreen() {
  const { id, otherName, otherPhoto } = useLocalSearchParams<{
    id: string;
    otherName?: string;
    otherPhoto?: string;
    otherId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failedMessageId, setFailedMessageId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getMyUserId().then(setMyUserId);
  }, []);

  const loadMessages = useCallback(
    async (beforeId?: string) => {
      if (!id) return;
      try {
        if (beforeId) setLoadingOlder(true);
        else setLoading(true);
        const data = await fetchConversationMessages(id, 50, beforeId);
        setMessages((prev) => {
          if (beforeId) {
            const existingIds = new Set(prev.map((m) => m.id));
            const prepend = data.filter((m) => !existingIds.has(m.id));
            return [...prepend, ...prev];
          }
          return data;
        });
      } catch {
        // keep existing
      } finally {
        setLoading(false);
        setLoadingOlder(false);
      }
    },
    [id]
  );

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!id) return;
    pollRef.current = setInterval(() => loadMessages(), 8000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id, loadMessages]);

  const sendMessage = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !id || sending) return;
    setText("");
    const tempId = `temp-${Date.now()}`;
    const optimistic: ConversationMessage = {
      id: tempId,
      sender_id: myUserId ?? "",
      text: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    setFailedMessageId(null);
    try {
      const result = await postConversationMessage(id, trimmed);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                id: result.id,
                sender_id: m.sender_id,
                text: result.text,
                created_at: result.created_at,
              }
            : m
        )
      );
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch {
      setFailedMessageId(tempId);
    } finally {
      setSending(false);
    }
  }, [id, text, sending, myUserId]);

  const loadOlder = useCallback(() => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    loadMessages(first.id);
  }, [messages, loadingOlder, loadMessages]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset } = e.nativeEvent;
      if (contentOffset.y <= 80 && messages.length > 0 && !loadingOlder) loadOlder();
    },
    [messages.length, loadingOlder, loadOlder]
  );

  const isSent = (msg: ConversationMessage) => msg.sender_id === myUserId;
  const messageCount = messages.length;
  const showCrossing = messageCount >= 10;

  if (!id) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Missing conversation</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerAvatarWrap}>
          {otherPhoto ? (
            <Image source={{ uri: otherPhoto }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarPlc]} />
          )}
        </View>
        <Text style={styles.headerName} numberOfLines={1}>
          {otherName ? otherName.toUpperCase() : "Conversation"}
        </Text>
      </View>

      {loading && messages.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.TYPE_MUTED} />
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            onScroll={onScroll}
            scrollEventThrottle={200}
            ListHeaderComponent={
              loadingOlder ? (
                <View style={styles.olderLoader}>
                  <ActivityIndicator size="small" color={colors.TYPE_MUTED} />
                </View>
              ) : null
            }
            renderItem={({ item, index }) => (
              <View style={styles.messageWrap}>
                {index === 0 && (
                  <View style={styles.firstMessageLabel}>
                    <Text style={styles.firstMessageLabelText}>
                      This reply started the conversation
                    </Text>
                  </View>
                )}
                <View
                  style={[
                    styles.bubbleWrap,
                    isSent(item) ? styles.bubbleWrapSent : styles.bubbleWrapReceived,
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      isSent(item) ? styles.bubbleSent : styles.bubbleReceived,
                      item.id === failedMessageId && styles.bubbleFailed,
                    ]}
                  >
                    <Text style={[styles.bubbleText, isSent(item) && styles.bubbleTextSent]}>
                      {item.text}
                    </Text>
                    <Text style={styles.bubbleTime}>{formatMessageTime(item.created_at)}</Text>
                  </View>
                </View>
              </View>
            )}
            contentContainerStyle={[styles.listContent, { paddingBottom: showCrossing ? 100 : 80 }]}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
            style={[styles.inputArea, { paddingBottom: insets.bottom + 12 }]}
          >
            {showCrossing && (
              <TouchableOpacity style={styles.crossingBtn} disabled>
                <Text style={styles.crossingBtnText}>crossing</Text>
              </TouchableOpacity>
            )}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="..."
                placeholderTextColor={colors.TYPE_MUTED}
                value={text}
                onChangeText={setText}
                onSubmitEditing={sendMessage}
                returnKeyType="send"
                editable={!sending}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
                onPress={sendMessage}
                disabled={!text.trim() || sending}
              >
                <Text style={styles.sendBtnText}>Send</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </>
      )}
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
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    backgroundColor: colors.WARM_GROUND,
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  backArrow: {
    fontSize: 24,
    color: colors.TYPE_DARK,
  },
  headerAvatarWrap: { marginRight: 10 },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerAvatarPlc: {
    backgroundColor: colors.CARD_GROUND,
  },
  headerName: {
    ...typography.label,
    fontSize: 8,
    color: colors.TYPE_DARK,
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 16,
  },
  olderLoader: {
    paddingVertical: 12,
    alignItems: "center",
  },
  messageWrap: {
    marginBottom: 12,
  },
  firstMessageLabel: {
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  firstMessageLabelText: {
    ...typography.metadata,
    fontSize: 7,
    color: colors.TYPE_MUTED,
  },
  bubbleWrap: {
    flexDirection: "row",
  },
  bubbleWrapSent: {
    justifyContent: "flex-end",
  },
  bubbleWrapReceived: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleSent: {
    backgroundColor: "rgba(196, 98, 45, 0.25)",
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: colors.CARD_GROUND,
    borderBottomLeftRadius: 4,
  },
  bubbleFailed: {
    borderWidth: 1,
    borderColor: colors.ACCENT_ORANGE,
  },
  bubbleText: {
    ...typography.replyInput,
    fontSize: 11,
    color: colors.TYPE_DARK,
  },
  bubbleTextSent: {
    color: colors.TYPE_WHITE,
  },
  bubbleTime: {
    ...typography.metadata,
    marginTop: 4,
    color: colors.TYPE_MUTED,
  },
  inputArea: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    backgroundColor: colors.WARM_GROUND,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  crossingBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "transparent",
    marginBottom: 8,
  },
  crossingBtnText: {
    ...typography.metadata,
    fontSize: 8,
    color: colors.TYPE_MUTED,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    ...typography.replyInput,
    color: colors.TYPE_DARK,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.CARD_GROUND,
    borderRadius: 8,
  },
  sendBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.ACCENT_ORANGE,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    ...typography.label,
    fontSize: 8,
    color: colors.TYPE_WHITE,
  },
  errorText: {
    ...typography.context,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    marginTop: 24,
  },
});
