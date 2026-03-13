import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../../theme";
import { ScreenExitButton } from "../../components/ScreenExitButton";
import { SwipeConfirm } from "../../components/SwipeConfirm";
import {
  fetchConversationMessages,
  postConversationMessage,
  fetchConversationDetail,
  getMyUserId,
  startShift,
  updateShiftDraft,
  completeShift,
  ignoreShift,
  type ConversationMessage,
  type ConversationDetail,
} from "../../lib/api";

function formatMessageTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function mixHex(startHex: string, endHex: string, amount: number): string {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  const t = clamp(amount, 0, 1);
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function getOutgoingPalette(messageCount: number): {
  bubble: string;
  text: string;
  time: string;
} {
  const intensity = clamp(messageCount / 10, 0, 1);
  return {
    bubble: mixHex("#E8CDBE", colors.VERMILLION, intensity),
    text: mixHex("#FFF8F3", colors.TYPE_WHITE, intensity),
    time: mixHex("#C68768", "#FFF0E5", intensity),
  };
}

export default function ConversationThreadScreen() {
  const { id, otherName, otherPhoto, thoughtSentence } = useLocalSearchParams<{
    id: string;
    otherName?: string;
    otherPhoto?: string;
    thoughtSentence?: string;
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
  const [convDetail, setConvDetail] = useState<ConversationDetail | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftBefore, setShiftBefore] = useState("");
  const [shiftAfter, setShiftAfter] = useState("");
  const [shiftSubmitting, setShiftSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getMyUserId().then(setMyUserId);
  }, []);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    try {
      const detail = await fetchConversationDetail(id);
      setConvDetail(detail);
    } catch {
      // Keep the current thread state instead of flashing empty content.
    }
  }, [id]);

  const loadMessages = useCallback(
    async (beforeId?: string) => {
      if (!id) return;
      try {
        if (beforeId) setLoadingOlder(true);
        else setLoading(true);
        const data = await fetchConversationMessages(id, 50, beforeId);
        setMessages((prev) => {
          if (!beforeId) return data;
          const existingIds = new Set(prev.map((message) => message.id));
          const prepend = data.filter((message) => !existingIds.has(message.id));
          return [...prepend, ...prev];
        });
      } catch {
        // Keep whatever is already on screen.
      } finally {
        setLoading(false);
        setLoadingOlder(false);
      }
    },
    [id]
  );

  useEffect(() => {
    if (id) {
      loadMessages();
      loadDetail();
    }
  }, [id, loadMessages, loadDetail]);

  useEffect(() => {
    if (!id) return;
    const tick = () => {
      loadMessages();
      loadDetail();
    };
    pollRef.current = setInterval(tick, 8000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id, loadMessages, loadDetail]);

  const loadOlder = useCallback(() => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    loadMessages(first.id);
  }, [messages, loadingOlder, loadMessages]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (event.nativeEvent.contentOffset.y <= 80 && messages.length > 0 && !loadingOlder) {
        loadOlder();
      }
    },
    [loadOlder, loadingOlder, messages.length]
  );

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
        prev.map((message) =>
          message.id === tempId
            ? {
                id: result.id,
                sender_id: myUserId ?? "",
                text: result.text,
                created_at: result.created_at,
              }
            : message
        )
      );
      await loadDetail();
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 120);
    } catch {
      setFailedMessageId(tempId);
    } finally {
      setSending(false);
    }
  }, [id, loadDetail, myUserId, sending, text]);

  const saveShiftDraft = useCallback(async () => {
    if (!id || !convDetail || shiftSubmitting) return;
    const isParticipantA = myUserId === convDetail.participant_a_id;
    await updateShiftDraft(
      id,
      isParticipantA
        ? { a_before: shiftBefore, a_after: shiftAfter }
        : { b_before: shiftBefore, b_after: shiftAfter }
    );
  }, [convDetail, id, myUserId, shiftAfter, shiftBefore, shiftSubmitting]);

  const shiftDraft = convDetail?.shift_draft ?? null;
  const messageCount = convDetail?.message_count ?? messages.length;
  const shiftCount = convDetail?.shift_count ?? 0;
  const nextShiftMessageCount = convDetail?.next_shift_message_count ?? 10;
  const canCreateCollaborativeCard = Boolean(shiftDraft) || Boolean(convDetail?.shift_available);
  const isParticipantA = convDetail ? myUserId === convDetail.participant_a_id : false;
  const viewerReady = shiftDraft
    ? Boolean(isParticipantA ? shiftDraft.participant_a_ready_at : shiftDraft.participant_b_ready_at)
    : false;
  const otherReady = shiftDraft
    ? Boolean(isParticipantA ? shiftDraft.participant_b_ready_at : shiftDraft.participant_a_ready_at)
    : false;
  const bothReady = viewerReady && otherReady;
  const otherParticipantName =
    otherName ??
    (shiftDraft?.initiator_id === myUserId ? "the other person" : shiftDraft?.initiator_name ?? "the other person");
  const conversationThoughtSentence = convDetail?.thought?.sentence ?? thoughtSentence ?? "";
  const outgoingPalette = useMemo(() => getOutgoingPalette(messageCount), [messageCount]);

  useEffect(() => {
    if (shiftOpen && shiftDraft && convDetail) {
      setShiftBefore((isParticipantA ? shiftDraft.a_before : shiftDraft.b_before) ?? "");
      setShiftAfter((isParticipantA ? shiftDraft.a_after : shiftDraft.b_after) ?? "");
    }
  }, [convDetail, isParticipantA, shiftDraft, shiftOpen]);

  useEffect(() => {
    if (bothReady && !shiftOpen) {
      setShiftOpen(true);
    }
  }, [bothReady, shiftOpen]);

  const handleStartCollaborativeCard = useCallback(async () => {
    if (!id) return;
    await startShift(id);
    await loadDetail();
  }, [id, loadDetail]);

  const handleIgnoreCollaborativeCard = useCallback(() => {
    if (!id) return;
    Alert.alert(
      "Delete this conversation?",
      "Ignoring the collaborative card invite deletes this conversation and its chat history.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await ignoreShift(id);
              router.replace("/(tabs)/conversations");
            } catch {
              // Keep the conversation open if deletion fails.
            }
          },
        },
      ]
    );
  }, [id, router]);

  const handleCreateCollaborativeCard = useCallback(async () => {
    if (!id || shiftSubmitting) return;
    setShiftSubmitting(true);
    try {
      await saveShiftDraft();
      await completeShift(id);
      setShiftOpen(false);
      await loadDetail();
    } finally {
      setShiftSubmitting(false);
    }
  }, [id, loadDetail, saveShiftDraft, shiftSubmitting]);

  const handleSaveCollaborativeDraft = useCallback(async () => {
    if (shiftSubmitting) return;
    setShiftSubmitting(true);
    try {
      await saveShiftDraft();
      await loadDetail();
    } finally {
      setShiftSubmitting(false);
    }
  }, [loadDetail, saveShiftDraft, shiftSubmitting]);

  if (!id) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Missing conversation</Text>
      </View>
    );
  }

  const renderCollaborativeBanner = () => {
    if (!canCreateCollaborativeCard) {
      if (shiftCount > 0 && messageCount < nextShiftMessageCount) {
        return (
          <Text style={styles.completeLabel}>
            Next collaborative card unlocks at {nextShiftMessageCount} messages.
          </Text>
        );
      }
      return null;
    }

    if (!shiftDraft || !viewerReady) {
      const label = shiftDraft && otherReady
        ? `${otherParticipantName} wants to create a collaborative card.`
        : "Crossing? Do you want to create a collaborative card?";
      const hint = shiftDraft && otherReady
        ? "Slide to join. Ignoring deletes this conversation."
        : "Once both of you slide, you can make the card together.";
      return (
        <View style={styles.collaborativeWrap}>
          <SwipeConfirm
            label={label}
            hint={hint}
            completionLabel="Slide to join"
            loading={shiftSubmitting}
            onComplete={handleStartCollaborativeCard}
          />
          {shiftDraft && otherReady && shiftCount === 0 ? (
            <TouchableOpacity style={styles.ignoreRow} onPress={handleIgnoreCollaborativeCard}>
              <Text style={styles.ignoreText}>Ignore and delete conversation</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.historyPolicyText}>
            Chat history clears itself after 2 weeks without a reply.
          </Text>
        </View>
      );
    }

    if (viewerReady && !otherReady) {
      return (
        <View style={styles.waitingCard}>
          <Text style={styles.waitingTitle}>Collaborative card started.</Text>
          <Text style={styles.waitingText}>
            Waiting for {otherParticipantName} to join from this conversation.
          </Text>
          <Text style={styles.historyPolicyText}>
            The invite stays here until they join or ignore it.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.waitingCard}>
        <Text style={styles.waitingTitle}>Both of you are in.</Text>
        <Text style={styles.waitingText}>
          Finish the collaborative card below on both terms.
        </Text>
      </View>
    );
  };

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
        <ScreenExitButton onPress={() => router.back()} style={styles.headerExit} />
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
              <View>
                {conversationThoughtSentence ? (
                  <View style={styles.thoughtCard}>
                    <Text style={styles.thoughtLabel}>Original thought</Text>
                    <Text style={styles.thoughtSentence}>{conversationThoughtSentence}</Text>
                  </View>
                ) : null}
                {convDetail?.history_cleared && messages.length === 0 ? (
                  <View style={styles.historyNotice}>
                    <Text style={styles.historyNoticeTitle}>History cleared.</Text>
                    <Text style={styles.historyNoticeText}>
                      This conversation sat still for 2 weeks, so the old chat disappeared.
                    </Text>
                  </View>
                ) : null}
                {loadingOlder ? (
                  <View style={styles.olderLoader}>
                    <ActivityIndicator size="small" color={colors.TYPE_MUTED} />
                  </View>
                ) : null}
              </View>
            }
            renderItem={({ item, index }) => {
              const sent = item.sender_id === myUserId;
              return (
                <View style={styles.messageWrap}>
                  {index === 0 ? (
                    <View style={styles.firstMessageLabel}>
                      <Text style={styles.firstMessageLabelText}>
                        This reply started the conversation
                      </Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.bubbleWrap,
                      sent ? styles.bubbleWrapSent : styles.bubbleWrapReceived,
                    ]}
                  >
                    <View
                      style={[
                        styles.bubble,
                        sent ? styles.bubbleSent : styles.bubbleReceived,
                        sent && { backgroundColor: outgoingPalette.bubble },
                        item.id === failedMessageId && styles.bubbleFailed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bubbleText,
                          sent && styles.bubbleTextSent,
                          sent && { color: outgoingPalette.text },
                        ]}
                      >
                        {item.text}
                      </Text>
                      <Text
                        style={[
                          styles.bubbleTime,
                          sent && { color: outgoingPalette.time },
                        ]}
                      >
                        {formatMessageTime(item.created_at)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: shiftOpen || canCreateCollaborativeCard ? 180 : 92 },
            ]}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
            style={styles.inputArea}
          >
            {renderCollaborativeBanner()}

            {shiftOpen && convDetail ? (
              <View style={styles.flowPanel}>
                <Text style={styles.flowTitle}>Collaborative card</Text>
                <Text style={styles.flowLabel}>What you were thinking before this conversation</Text>
                <TextInput
                  style={styles.flowInput}
                  placeholder="Before"
                  placeholderTextColor={colors.TYPE_MUTED}
                  value={shiftBefore}
                  onChangeText={setShiftBefore}
                  maxLength={500}
                  editable={!shiftSubmitting}
                />
                <Text style={styles.flowLabel}>What you are thinking now</Text>
                <TextInput
                  style={styles.flowInput}
                  placeholder="After"
                  placeholderTextColor={colors.TYPE_MUTED}
                  value={shiftAfter}
                  onChangeText={setShiftAfter}
                  maxLength={500}
                  editable={!shiftSubmitting}
                />
                <View style={styles.flowRow}>
                  <TouchableOpacity
                    style={[styles.flowBtn, styles.flowBtnSecondary]}
                    onPress={handleSaveCollaborativeDraft}
                    disabled={shiftSubmitting}
                  >
                    <Text style={styles.flowBtnTextSecondary}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.flowBtn, styles.flowBtnPrimary]}
                    onPress={handleCreateCollaborativeCard}
                    disabled={shiftSubmitting || !shiftBefore.trim() || !shiftAfter.trim()}
                  >
                    <Text style={styles.flowBtnTextPrimary}>
                      {shiftSubmitting ? "..." : "Create collaborative card"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setShiftOpen(false)} style={styles.flowClose}>
                  <Text style={styles.flowBtnTextSecondary}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : null}

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
            <View style={{ height: insets.bottom + 24 }} />
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
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(26,26,22,0.06)",
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
  headerAvatarWrap: {
    marginRight: 10,
  },
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
  headerExit: {
    marginLeft: 8,
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
  thoughtCard: {
    backgroundColor: colors.CARD_GROUND,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  thoughtLabel: {
    ...typography.metadata,
    fontSize: 7,
    color: colors.TYPE_MUTED,
    marginBottom: 6,
  },
  thoughtSentence: {
    ...typography.thoughtDisplay,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
    color: colors.TYPE_DARK,
  },
  historyNotice: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(235, 65, 1, 0.08)",
    marginBottom: 14,
  },
  historyNoticeTitle: {
    ...typography.label,
    fontSize: 8,
    color: colors.VERMILLION,
    marginBottom: 4,
  },
  historyNoticeText: {
    ...typography.context,
    fontSize: 10,
    lineHeight: 13,
    color: colors.TYPE_MUTED,
  },
  messageWrap: {
    marginBottom: 12,
  },
  firstMessageLabel: {
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(26,26,22,0.08)",
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
    maxWidth: "84%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleSent: {
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: colors.CARD_GROUND,
    borderBottomLeftRadius: 4,
  },
  bubbleFailed: {
    borderWidth: 1,
    borderColor: colors.OLIVE,
  },
  bubbleText: {
    ...typography.replyInput,
    fontSize: 11.5,
    lineHeight: 15,
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
    borderTopColor: "rgba(26,26,22,0.06)",
  },
  collaborativeWrap: {
    marginBottom: 10,
  },
  ignoreRow: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  ignoreText: {
    ...typography.metadata,
    fontSize: 8,
    color: colors.VERMILLION,
  },
  historyPolicyText: {
    ...typography.context,
    fontSize: 9.5,
    lineHeight: 12,
    color: colors.TYPE_MUTED,
    marginTop: 6,
  },
  waitingCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: colors.CARD_GROUND,
  },
  waitingTitle: {
    ...typography.label,
    fontSize: 8,
    color: colors.TYPE_DARK,
    marginBottom: 5,
  },
  waitingText: {
    ...typography.context,
    fontSize: 10.5,
    lineHeight: 14,
    color: colors.TYPE_DARK,
  },
  completeLabel: {
    ...typography.metadata,
    fontSize: 8,
    color: colors.OLIVE,
    marginBottom: 8,
  },
  flowPanel: {
    paddingTop: 12,
    marginBottom: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(26,26,22,0.06)",
  },
  flowTitle: {
    ...typography.label,
    fontSize: 10,
    color: colors.TYPE_DARK,
    marginBottom: 8,
  },
  flowLabel: {
    ...typography.metadata,
    fontSize: 8,
    color: colors.TYPE_MUTED,
    marginTop: 6,
    marginBottom: 4,
  },
  flowInput: {
    ...typography.replyInput,
    fontSize: 11,
    color: colors.TYPE_DARK,
    backgroundColor: colors.CARD_GROUND,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  flowRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  flowBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  flowBtnPrimary: {
    backgroundColor: colors.OLIVE,
  },
  flowBtnSecondary: {
    backgroundColor: colors.CARD_GROUND,
  },
  flowBtnTextPrimary: {
    ...typography.label,
    fontSize: 8,
    color: colors.TYPE_WHITE,
  },
  flowBtnTextSecondary: {
    ...typography.metadata,
    fontSize: 8,
    color: colors.TYPE_MUTED,
  },
  flowClose: {
    marginTop: 8,
    paddingVertical: 4,
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
    backgroundColor: colors.OLIVE,
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
