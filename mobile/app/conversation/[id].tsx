import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Alert,
  AppState,
  type AppStateStatus,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, primitives, opacity, radii } from "../../theme";
import { fontFamily } from "../../theme/typography";
import {
  fetchConversationMessages,
  postConversationMessage,
  fetchConversationDetail,
  getMyUserId,
  startCrossing,
  updateCrossingDraft,
  completeCrossing,
  abandonCrossing,
  blockUser,
  type ConversationMessage,
  type ConversationDetail,
} from "../../lib/api";
import { ReportModal } from "../../components/ReportModal";

const CROSSING_MESSAGE_STEP = 10;

function formatMessageTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatShortDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const intensity = clamp(messageCount / CROSSING_MESSAGE_STEP, 0, 1);
  return {
    bubble: mixHex("#E8CDBE", colors.VERMILLION, intensity),
    text: mixHex("#FFF8F3", colors.TYPE_WHITE, intensity),
    time: mixHex("#C68768", "#FFF0E5", intensity),
  };
}

export default function ConversationThreadScreen() {
  const { id, otherName, otherPhoto, otherId, thoughtSentence } = useLocalSearchParams<{
    id: string;
    otherName?: string;
    otherPhoto?: string;
    otherId?: string;
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
  const [crossingOpen, setCrossingOpen] = useState(false);
  const [crossingSentence, setCrossingSentence] = useState("");
  const [crossingContext, setCrossingContext] = useState("");
  const [crossingSubmitting, setCrossingSubmitting] = useState(false);
  const crossingSubmittingRef = useRef(false);
  const [reportVisible, setReportVisible] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    getMyUserId().then(setMyUserId).catch(() => setMyUserId(null));
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

  const refreshThread = useCallback(() => {
    void loadMessages();
    void loadDetail();
  }, [loadDetail, loadMessages]);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;

      const tick = () => {
        if (appStateRef.current !== "active") return;
        refreshThread();
      };

      tick();

      const intervalId = setInterval(tick, 8000);
      const appStateSubscription = AppState.addEventListener("change", (nextState) => {
        appStateRef.current = nextState;
        if (nextState === "active") {
          tick();
        }
      });

      return () => {
        clearInterval(intervalId);
        appStateSubscription.remove();
      };
    }, [id, refreshThread])
  );

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

  const saveCrossingDraft = useCallback(async () => {
    if (!id || crossingSubmitting) return;
    await updateCrossingDraft(id, {
      sentence: crossingSentence,
      context: crossingContext,
    });
  }, [crossingContext, crossingSentence, crossingSubmitting, id]);

  const crossingDraft = convDetail?.crossing_draft ?? null;
  const messageCount = convDetail?.message_count ?? messages.length;
  const nextCrossingMessageCount =
    convDetail?.next_crossing_message_count ?? CROSSING_MESSAGE_STEP;
  const canCreateCrossing = Boolean(crossingDraft) || Boolean(convDetail?.crossing_available);
  const otherParticipantName =
    otherName ??
    (crossingDraft?.initiator_id === myUserId
      ? "the other person"
      : crossingDraft?.initiator_name ?? "the other person");
  const isCrossingInitiator = crossingDraft?.initiator_id === myUserId;
  const isAwaitingOther = crossingDraft?.status === "awaiting_other";
  const canApproveCrossing = Boolean(crossingDraft && isAwaitingOther && !isCrossingInitiator);
  const waitingForOtherParticipant = Boolean(crossingDraft && isAwaitingOther && isCrossingInitiator);
  const crossingAutoPostLabel = formatShortDateTime(crossingDraft?.auto_post_at ?? null);
  const conversationThoughtSentence = convDetail?.thought?.sentence ?? thoughtSentence ?? "";
  const outgoingPalette = useMemo(() => getOutgoingPalette(messageCount), [messageCount]);

  useEffect(() => {
    if (crossingOpen && crossingDraft) {
      setCrossingSentence(crossingDraft.sentence ?? "");
      setCrossingContext(crossingDraft.context ?? "");
    }
  }, [crossingDraft, crossingOpen]);

  useEffect(() => {
    if (crossingDraft && crossingDraft.status === "draft" && !crossingOpen) {
      setCrossingOpen(true);
    }
  }, [crossingDraft, crossingOpen]);

  const handleStartCrossing = useCallback(async () => {
    if (!id) return;
    try {
      await startCrossing(id);
      setCrossingOpen(true);
      await loadDetail();
    } catch (error) {
      Alert.alert(
        "Could not start crossing",
        error instanceof Error ? error.message : "Please try again."
      );
    }
  }, [id, loadDetail]);

  const handleAbandonCrossing = useCallback(() => {
    if (!id) return;
    Alert.alert(
      "Discard crossing draft?",
      "This will close the current crossing draft.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            try {
              await abandonCrossing(id);
              setCrossingOpen(false);
              setCrossingSentence("");
              setCrossingContext("");
              await loadDetail();
            } catch (error) {
              Alert.alert(
                "Could not discard crossing",
                error instanceof Error ? error.message : "Please try again."
              );
            }
          },
        },
      ]
    );
  }, [id, loadDetail]);

  const handleCreateCrossing = useCallback(async () => {
    if (!id || crossingSubmittingRef.current) return;
    crossingSubmittingRef.current = true;
    setCrossingSubmitting(true);
    try {
      if (!canApproveCrossing) {
        await saveCrossingDraft();
      }
      const result = await completeCrossing(id, {
        sentence: canApproveCrossing ? undefined : crossingSentence.trim(),
        context: canApproveCrossing ? undefined : crossingContext.trim() || undefined,
      });
      setCrossingOpen(false);
      if (result.status === "complete") {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
      await loadDetail();
    } catch (error) {
      Alert.alert(
        "Could not create crossing",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setCrossingSubmitting(false);
      crossingSubmittingRef.current = false;
    }
  }, [
    canApproveCrossing,
    crossingContext,
    crossingSentence,
    id,
    loadDetail,
    saveCrossingDraft,
  ]);

  const handleSaveCrossingDraft = useCallback(async () => {
    if (crossingSubmitting) return;
    setCrossingSubmitting(true);
    try {
      await saveCrossingDraft();
      await loadDetail();
    } catch (error) {
      Alert.alert(
        "Could not save crossing",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setCrossingSubmitting(false);
    }
  }, [crossingSubmitting, loadDetail, saveCrossingDraft]);

  const handleMoreMenu = useCallback(() => {
    if (!otherId) return;
    Alert.alert("Conversation options", undefined, [
      {
        text: "Report",
        onPress: () => setReportVisible(true),
      },
      {
        text: "Block user",
        style: "destructive",
        onPress: () => {
          Alert.alert(
            "Block user?",
            "Their content will be removed from your feed immediately. The ohm. team will be notified and will review the account.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Block",
                style: "destructive",
                onPress: async () => {
                  try {
                    await blockUser(otherId);
                    router.back();
                  } catch {}
                },
              },
            ]
          );
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [otherId, router]);

  if (!id) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Missing conversation</Text>
      </View>
    );
  }

  const renderCrossingBanner = () => {
    if (crossingDraft?.status === "complete") {
      return (
        <View style={styles.crossingWrap}>
          <Text style={styles.crossingCompletedTitle}>Crossing matched</Text>
          <Text style={styles.crossingHint}>Find it in your feed.</Text>
        </View>
      );
    }

    if (!canCreateCrossing) {
      if (messageCount < nextCrossingMessageCount) {
        return (
          <Text style={styles.completeLabel}>
            Next crossing unlocks at {nextCrossingMessageCount} messages.
          </Text>
        );
      }
      return null;
    }

    if (!crossingDraft && !crossingOpen) {
      return (
        <View style={styles.crossingWrap}>
          <Text style={styles.crossingHint}>
            Crossing: a card of two new thoughts — yours and theirs — from one conversation.
          </Text>
          <TouchableOpacity
            style={[styles.crossingPostBtn, crossingSubmitting && styles.crossingPostBtnDisabled]}
            onPress={handleStartCrossing}
            disabled={crossingSubmitting}
          >
            {crossingSubmitting ? (
              <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
            ) : (
              <Text style={styles.crossingPostBtnText}>START CROSSING</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    if (crossingDraft && !crossingOpen) {
      return (
        <TouchableOpacity
          style={styles.waitingCard}
          activeOpacity={0.85}
          onPress={() => setCrossingOpen(true)}
        >
          <Text style={styles.waitingTitle}>
            {waitingForOtherParticipant
              ? "Crossing submitted."
              : `${otherParticipantName} started a crossing.`}
          </Text>
          <Text style={styles.waitingText}>
            {waitingForOtherParticipant
              ? crossingAutoPostLabel
                ? `Waiting for them. If they do nothing by ${crossingAutoPostLabel}, this becomes your thought.`
                : "Waiting for them. If they do nothing, this becomes your thought."
              : "Open it to make it a shared crossing. If you leave it alone, it becomes their thought in 3 days."}
          </Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerIdentity}
          activeOpacity={0.7}
          disabled={!otherId}
          onPress={() => {
            if (!otherId) return;
            router.push({ pathname: "/user/[id]", params: { id: otherId } });
          }}
        >
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
        </TouchableOpacity>
        {otherId ? (
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={handleMoreMenu}
            activeOpacity={0.7}
          >
            <Text style={styles.moreBtnText}>•••</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {otherId ? (
        <ReportModal
          visible={reportVisible}
          onClose={() => setReportVisible(false)}
          targetType="user"
          targetId={otherId}
        />
      ) : null}

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
              { paddingBottom: crossingOpen ? 440 : canCreateCrossing ? 180 : 92 },
            ]}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={0}
            style={styles.inputArea}
          >
            {renderCrossingBanner()}

            {crossingOpen && convDetail ? (
              <ScrollView
                style={styles.crossingPanel}
                contentContainerStyle={styles.crossingPanelContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>One crossing</Text>
                  <Text style={styles.fieldHint}>
                    what changed between you because of this conversation
                  </Text>
                  <TextInput
                    style={[styles.textArea, styles.crossingSentenceInput]}
                    placeholder="the thing that hit different the second time"
                    placeholderTextColor={colors.TYPE_MUTED}
                    value={crossingSentence}
                    onChangeText={(t) => setCrossingSentence(t.slice(0, 500))}
                    maxLength={500}
                    multiline
                    numberOfLines={5}
                    editable={!crossingSubmitting && !canApproveCrossing}
                  />
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Context</Text>
                  <TextInput
                    style={[styles.textArea, styles.crossingContextInput]}
                    placeholder="Where it came from, what triggered it, what is underneath it."
                    placeholderTextColor={colors.TYPE_MUTED}
                    value={crossingContext}
                    onChangeText={(t) => setCrossingContext(t.slice(0, 600))}
                    maxLength={600}
                    multiline
                    numberOfLines={3}
                    editable={!crossingSubmitting && !canApproveCrossing}
                  />
                </View>

                {waitingForOtherParticipant ? (
                  <Text style={styles.crossingStatus}>
                    {crossingAutoPostLabel
                      ? `Waiting for the other person. If they do nothing by ${crossingAutoPostLabel}, this posts as your thought.`
                      : "Waiting for the other person. If they do nothing, this posts as your thought."}
                  </Text>
                ) : null}
                {canApproveCrossing ? (
                  <Text style={styles.crossingStatus}>
                    If you agree, this becomes a shared crossing. If you do nothing, it posts as their thought after 3 days.
                  </Text>
                ) : null}

                <TouchableOpacity
                  style={[styles.crossingPostBtn, (!crossingSentence.trim() && !canApproveCrossing || crossingSubmitting) && styles.crossingPostBtnDisabled]}
                  onPress={handleCreateCrossing}
                  disabled={crossingSubmitting || (!canApproveCrossing && !crossingSentence.trim())}
                >
                  {crossingSubmitting ? (
                    <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
                  ) : (
                    <Text style={styles.crossingPostBtnText}>
                      {canApproveCrossing
                        ? "MAKE CROSSING"
                        : waitingForOtherParticipant
                          ? "UPDATE CROSSING"
                          : "CREATE CROSSING"}
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={styles.crossingSecondaryRow}>
                  {!canApproveCrossing ? (
                    <TouchableOpacity
                      style={styles.crossingSecondaryBtn}
                      onPress={handleSaveCrossingDraft}
                      disabled={crossingSubmitting}
                    >
                      <Text style={styles.crossingSecondaryText}>
                        {waitingForOtherParticipant ? "Save changes" : "Save draft"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.crossingSecondaryBtn}
                    onPress={canApproveCrossing ? () => setCrossingOpen(false) : handleAbandonCrossing}
                  >
                    <Text style={styles.crossingSecondaryText}>
                      {canApproveCrossing ? "Close" : "Discard draft"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}

            {!crossingOpen ? (
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
            ) : null}
            <View style={{ height: Math.max(insets.bottom, 10) }} />
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
    borderBottomColor: colors.CARD_BORDER,
    backgroundColor: colors.WARM_GROUND,
  },
  backBtn: {
    padding: 10,
    marginRight: 8,
  },
  backArrow: {
    fontSize: 36,
    color: colors.TYPE_DARK,
  },
  headerAvatarWrap: {
    marginRight: 10,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerAvatarPlc: {
    backgroundColor: colors.CARD_GROUND,
  },
  headerName: {
    ...typography.label,
    fontSize: 11.5,
    color: colors.TYPE_DARK,
    flex: 1,
  },
  moreBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  moreBtnText: {
    fontSize: 16,
    color: colors.TYPE_MUTED,
    letterSpacing: 2,
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
    borderRadius: radii.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  thoughtLabel: {
    ...typography.metadata,
    fontSize: 10,
    color: colors.TYPE_MUTED,
    marginBottom: 6,
  },
  thoughtSentence: {
    ...typography.thoughtDisplay,
    fontFamily: fontFamily.sentientBold,
    fontSize: 21,
    lineHeight: 27,
    color: colors.TYPE_DARK,
  },
  historyNotice: {
    borderRadius: radii.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(235, 65, 1, 0.08)",
    marginBottom: 14,
  },
  historyNoticeTitle: {
    ...typography.label,
    fontSize: 11,
    color: colors.VERMILLION,
    marginBottom: 4,
  },
  historyNoticeText: {
    ...typography.context,
    fontSize: 14,
    lineHeight: 19,
    color: colors.TYPE_MUTED,
  },
  messageWrap: {
    marginBottom: 12,
  },
  firstMessageLabel: {
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.CARD_BORDER,
  },
  firstMessageLabelText: {
    ...typography.metadata,
    fontSize: 10,
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
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
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
    fontSize: 16,
    lineHeight: 21,
    color: colors.TYPE_DARK,
  },
  bubbleTextSent: {
    color: colors.TYPE_WHITE,
  },
  bubbleTime: {
    ...typography.metadata,
    marginTop: 4,
    fontSize: 10,
    color: colors.TYPE_MUTED,
  },
  inputArea: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 8,
    backgroundColor: colors.WARM_GROUND,
    borderTopWidth: 1,
    borderTopColor: colors.CARD_BORDER,
  },
  crossingWrap: {
    marginBottom: 10,
  },
  crossingHint: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    marginBottom: 8,
  },
  crossingCompletedTitle: {
    ...typography.label,
    fontSize: 14,
    color: colors.OLIVE,
    marginBottom: 4,
  },
  ignoreRow: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  ignoreText: {
    ...typography.metadata,
    fontSize: 11,
    color: colors.VERMILLION,
  },
  historyPolicyText: {
    ...typography.context,
    fontSize: 13.5,
    lineHeight: 18,
    color: colors.TYPE_MUTED,
    marginTop: 6,
  },
  waitingCard: {
    borderRadius: radii.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: colors.CARD_GROUND,
  },
  waitingTitle: {
    ...typography.label,
    fontSize: 11,
    color: colors.TYPE_DARK,
    marginBottom: 5,
  },
  waitingText: {
    ...typography.context,
    fontSize: 15,
    lineHeight: 20,
    color: colors.TYPE_DARK,
  },
  completeLabel: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    marginBottom: 8,
  },
  crossingPanel: {
    maxHeight: 420,
    borderTopWidth: 1,
    borderTopColor: colors.CARD_BORDER,
  },
  crossingPanelContent: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  fieldBlock: {
    ...primitives.fieldBlock,
  },
  fieldLabel: {
    ...primitives.fieldLabel,
  },
  fieldHint: {
    ...typography.bodySmall,
    color: colors.TYPE_MUTED,
    marginBottom: 10,
  },
  textArea: {
    ...primitives.textArea,
  },
  crossingSentenceInput: {
    ...typography.thoughtDisplay,
    color: colors.TYPE_DARK,
    minHeight: 120,
    textAlignVertical: "top",
  },
  crossingContextInput: {
    ...typography.body,
    color: colors.TYPE_DARK,
    minHeight: 80,
    textAlignVertical: "top",
  },
  crossingStatus: {
    ...typography.bodySmall,
    color: colors.TYPE_MUTED,
    marginBottom: 12,
  },
  crossingPostBtn: {
    ...primitives.buttonPrimary,
    backgroundColor: colors.OLIVE,
    marginTop: 4,
  },
  crossingPostBtnDisabled: {
    opacity: opacity.disabled,
  },
  crossingPostBtnText: {
    ...primitives.buttonPrimaryText,
  },
  crossingSecondaryRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 12,
  },
  crossingSecondaryBtn: {
    paddingVertical: 8,
  },
  crossingSecondaryText: {
    ...typography.label,
    color: colors.TYPE_MUTED,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 4,
  },
  input: {
    flex: 1,
    ...typography.replyInput,
    fontSize: 16,
    color: colors.TYPE_DARK,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.CARD_GROUND,
    borderRadius: radii.input,
  },
  sendBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radii.input,
    backgroundColor: colors.OLIVE,
  },
  sendBtnDisabled: {
    opacity: opacity.disabled,
  },
  sendBtnText: {
    ...typography.label,
    fontSize: 11,
    color: colors.TYPE_WHITE,
  },
  errorText: {
    ...typography.context,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    marginTop: 24,
  },
});
