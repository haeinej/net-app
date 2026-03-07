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
  fetchConversationDetail,
  getMyUserId,
  startCrossing,
  getCrossingDraft,
  updateCrossingDraft,
  completeCrossing,
  abandonCrossing,
  startShift,
  getShiftDraft,
  updateShiftDraft,
  completeShift,
  abandonShift,
  type ConversationMessage,
  type ConversationDetail,
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
  const [convDetail, setConvDetail] = useState<ConversationDetail | null>(null);
  const [crossingOpen, setCrossingOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [crossingSentence, setCrossingSentence] = useState("");
  const [crossingContext, setCrossingContext] = useState("");
  const [shiftBefore, setShiftBefore] = useState("");
  const [shiftAfter, setShiftAfter] = useState("");
  const [crossingSubmitting, setCrossingSubmitting] = useState(false);
  const [shiftSubmitting, setShiftSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getMyUserId().then(setMyUserId);
  }, []);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    try {
      const d = await fetchConversationDetail(id);
      setConvDetail(d);
    } catch {
      // keep previous
    }
  }, [id]);

  useEffect(() => {
    if (id && myUserId) loadDetail();
  }, [id, myUserId, loadDetail]);

  const isCrossingInitiator = crossingDraft?.initiator_id === myUserId;
  useEffect(() => {
    if (crossingOpen && crossingDraft) {
      setCrossingSentence(
        (isCrossingInitiator ? crossingDraft.sentence_a : crossingDraft.sentence_b ?? crossingDraft.sentence_a) ?? ""
      );
      setCrossingContext(crossingDraft.context ?? "");
    }
  }, [crossingOpen, crossingDraft, isCrossingInitiator]);

  useEffect(() => {
    if (shiftOpen && shiftDraft && convDetail) {
      const isA = myUserId === convDetail.participant_a_id;
      setShiftBefore((isA ? shiftDraft.a_before : shiftDraft.b_before) ?? "");
      setShiftAfter((isA ? shiftDraft.a_after : shiftDraft.b_after) ?? "");
    }
  }, [shiftOpen, shiftDraft, convDetail, myUserId]);

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
    const tick = () => {
      loadMessages();
      loadDetail();
    };
    pollRef.current = setInterval(tick, 8000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id, loadMessages, loadDetail]);

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
  const messageCount = convDetail?.message_count ?? messages.length;
  const canShowCrossingShift = messageCount >= 10;
  const crossingComplete = convDetail?.crossing_complete ?? false;
  const shiftComplete = convDetail?.shift_complete ?? false;
  const crossingDraft = convDetail?.crossing_draft ?? null;
  const shiftDraft = convDetail?.shift_draft ?? null;
  const showCrossingBtn = canShowCrossingShift && !crossingComplete && !crossingDraft && !crossingOpen;
  const showShiftBtn = canShowCrossingShift && !shiftComplete && !shiftDraft && !shiftOpen;
  const showCrossingDraftCard = canShowCrossingShift && crossingDraft && crossingDraft.initiator_id !== myUserId && !crossingOpen;
  const showShiftDraftCard = canShowCrossingShift && shiftDraft && shiftDraft.initiator_id !== myUserId && !shiftOpen;
  const isParticipantA = convDetail && myUserId === convDetail.participant_a_id;

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
            contentContainerStyle={[styles.listContent, { paddingBottom: canShowCrossingShift || crossingOpen || shiftOpen ? 120 : 80 }]}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
            style={[styles.inputArea, { paddingBottom: insets.bottom + 12 }]}
          >
            {showCrossingDraftCard && (
              <TouchableOpacity
                style={styles.draftCard}
                onPress={() => setCrossingOpen(true)}
              >
                <Text style={styles.draftCardText}>
                  {crossingDraft?.initiator_name ?? "Someone"} started a crossing
                </Text>
              </TouchableOpacity>
            )}
            {showShiftDraftCard && (
              <TouchableOpacity
                style={styles.draftCard}
                onPress={() => setShiftOpen(true)}
              >
                <Text style={styles.draftCardText}>
                  {shiftDraft?.initiator_name ?? "Someone"} started a shift
                </Text>
              </TouchableOpacity>
            )}
            {(showCrossingBtn || showShiftBtn) && (
              <View style={styles.crossingShiftRow}>
                {showCrossingBtn && (
                  <TouchableOpacity
                    style={styles.crossingBtn}
                    onPress={async () => {
                      if (!id) return;
                      try {
                        await startCrossing(id);
                        setCrossingOpen(true);
                        loadDetail();
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <Text style={styles.crossingBtnText}>crossing</Text>
                  </TouchableOpacity>
                )}
                {showShiftBtn && (
                  <TouchableOpacity
                    style={styles.crossingBtn}
                    onPress={async () => {
                      if (!id) return;
                      try {
                        await startShift(id);
                        setShiftOpen(true);
                        loadDetail();
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <Text style={styles.crossingBtnText}>shift</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {canShowCrossingShift && crossingComplete && (
              <Text style={styles.completeLabel}>crossing created</Text>
            )}
            {canShowCrossingShift && shiftComplete && (
              <Text style={styles.completeLabel}>shift shared</Text>
            )}
            {crossingOpen && id && (
              <View style={styles.flowPanel}>
                <Text style={styles.flowTitle}>Crossing</Text>
                <TextInput
                  style={styles.flowInput}
                  placeholder="A thought you both share"
                  placeholderTextColor={colors.TYPE_MUTED}
                  value={crossingSentence}
                  onChangeText={setCrossingSentence}
                  multiline
                  maxLength={200}
                  editable={!crossingSubmitting}
                />
                <TextInput
                  style={[styles.flowInput, styles.flowContext]}
                  placeholder="Context (optional, up to 600 chars)"
                  placeholderTextColor={colors.TYPE_MUTED}
                  value={crossingContext}
                  onChangeText={(t) => setCrossingContext(t.slice(0, 600))}
                  multiline
                  maxLength={600}
                  editable={!crossingSubmitting}
                />
                <View style={styles.flowRow}>
                  <TouchableOpacity
                    style={[styles.flowBtn, styles.flowBtnSecondary]}
                    onPress={async () => {
                      if (!id || crossingSubmitting) return;
                      setCrossingSubmitting(true);
                      try {
                        await updateCrossingDraft(id, {
                          sentence_a: isCrossingInitiator ? crossingSentence : undefined,
                          sentence_b: !isCrossingInitiator ? crossingSentence : undefined,
                          context: crossingContext,
                        });
                      } catch {
                        // ignore
                      }
                      setCrossingSubmitting(false);
                    }}
                    disabled={crossingSubmitting}
                  >
                    <Text style={styles.flowBtnTextSecondary}>Save draft</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.flowBtn, styles.flowBtnPrimary]}
                    onPress={async () => {
                      if (!id || !crossingSentence.trim() || crossingSubmitting) return;
                      setCrossingSubmitting(true);
                      try {
                        await completeCrossing(id, {
                          sentence: crossingSentence.trim(),
                          context: crossingContext.trim() || undefined,
                        });
                        setCrossingOpen(false);
                        loadDetail();
                      } catch {
                        // ignore
                      }
                      setCrossingSubmitting(false);
                    }}
                    disabled={!crossingSentence.trim() || crossingSubmitting}
                  >
                    <Text style={styles.flowBtnTextPrimary}>
                      {crossingSubmitting ? "..." : "Complete"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.flowBtn, styles.flowBtnSecondary]}
                    onPress={async () => {
                      if (!id || crossingSubmitting) return;
                      setCrossingSubmitting(true);
                      try {
                        await abandonCrossing(id);
                        setCrossingOpen(false);
                        loadDetail();
                      } catch {
                        // ignore
                      }
                      setCrossingSubmitting(false);
                    }}
                    disabled={crossingSubmitting}
                  >
                    <Text style={styles.flowBtnTextSecondary}>Abandon</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setCrossingOpen(false)} style={styles.flowClose}>
                  <Text style={styles.flowBtnTextSecondary}>Close</Text>
                </TouchableOpacity>
              </View>
            )}
            {shiftOpen && id && convDetail && (
              <View style={styles.flowPanel}>
                <Text style={styles.flowTitle}>Shift</Text>
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
                    onPress={async () => {
                      if (!id || shiftSubmitting) return;
                      setShiftSubmitting(true);
                      try {
                        await updateShiftDraft(id, isParticipantA
                          ? { a_before: shiftBefore, a_after: shiftAfter }
                          : { b_before: shiftBefore, b_after: shiftAfter });
                      } catch {
                        // ignore
                      }
                      setShiftSubmitting(false);
                    }}
                    disabled={shiftSubmitting}
                  >
                    <Text style={styles.flowBtnTextSecondary}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.flowBtn, styles.flowBtnPrimary]}
                    onPress={async () => {
                      if (!id || shiftSubmitting) return;
                      setShiftSubmitting(true);
                      try {
                        await updateShiftDraft(id, isParticipantA
                          ? { a_before: shiftBefore, a_after: shiftAfter }
                          : { b_before: shiftBefore, b_after: shiftAfter });
                        await completeShift(id);
                        setShiftOpen(false);
                        loadDetail();
                      } catch {
                        // ignore
                      }
                      setShiftSubmitting(false);
                    }}
                    disabled={shiftSubmitting}
                  >
                    <Text style={styles.flowBtnTextPrimary}>
                      {shiftSubmitting ? "..." : "Share shift"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.flowBtn, styles.flowBtnSecondary]}
                    onPress={async () => {
                      if (!id || shiftSubmitting) return;
                      setShiftSubmitting(true);
                      try {
                        await abandonShift(id);
                        setShiftOpen(false);
                        loadDetail();
                      } catch {
                        // ignore
                      }
                      setShiftSubmitting(false);
                    }}
                    disabled={shiftSubmitting}
                  >
                    <Text style={styles.flowBtnTextSecondary}>Abandon</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setShiftOpen(false)} style={styles.flowClose}>
                  <Text style={styles.flowBtnTextSecondary}>Close</Text>
                </TouchableOpacity>
              </View>
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
  draftCard: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.CARD_GROUND,
    marginBottom: 6,
  },
  draftCardText: {
    ...typography.metadata,
    fontSize: 8,
    color: colors.TYPE_MUTED,
  },
  crossingShiftRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  crossingBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  crossingBtnText: {
    ...typography.metadata,
    fontSize: 8,
    color: colors.TYPE_MUTED,
  },
  completeLabel: {
    ...typography.metadata,
    fontSize: 8,
    color: colors.TYPE_MUTED,
    marginBottom: 6,
  },
  flowPanel: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
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
  flowContext: {
    minHeight: 60,
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
    backgroundColor: colors.ACCENT_ORANGE,
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
