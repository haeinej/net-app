import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { colors, spacing, typography } from "../theme";
import { WarmthBar } from "./WarmthBar";
import { PanelIndicator } from "./PanelIndicator";
import {
  fetchThought,
  postReply,
  type FeedItemThought,
  type ThoughtDetailResponse,
} from "../lib/api";
import { useEngagementTracking } from "../hooks/useEngagementTracking";

const REPLY_MIN_LENGTH = 50;
const REPLY_MAX_LENGTH = 300;
const FOOTER_HEIGHT = 40;
/** Wider aspect for feed cards so ~3 fit on screen (vs 4:3 in detail view) */
const FEED_IMAGE_ASPECT = 2;

interface SwipeableThoughtCardProps {
  item: FeedItemThought;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

export function SwipeableThoughtCard({ item }: SwipeableThoughtCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - spacing.screenPadding * 2;
  const imageHeight = cardWidth / FEED_IMAGE_ASPECT;
  const cardHeight = imageHeight + FOOTER_HEIGHT;

  const { thought, user, warmth_level } = item;

  // Detail data (panels 2 & 3), lazy-loaded
  const [detail, setDetail] = useState<ThoughtDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailLoadedRef = useRef(false);

  // Reply modal
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // Panel state
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);
  const lastPanelIndex = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  // Engagement
  const {
    recordSwipeP2,
    recordSwipeP3,
    recordTypeStart,
    recordReplySent,
  } = useEngagementTracking({
    thoughtId: thought.id,
    visible: true,
  });

  const loadDetail = useCallback(async () => {
    if (detailLoadedRef.current || detailLoading) return;
    detailLoadedRef.current = true;
    setDetailLoading(true);
    try {
      const d = await fetchThought(thought.id);
      setDetail(d);
    } catch {
      detailLoadedRef.current = false;
    } finally {
      setDetailLoading(false);
    }
  }, [thought.id, detailLoading]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const newIndex = Math.round(x / cardWidth);
      if (newIndex !== lastPanelIndex.current) {
        const fromIndex = lastPanelIndex.current;
        const toIndex = newIndex;
        if (fromIndex === 0 && toIndex === 1) {
          recordSwipeP2();
          loadDetail();
        } else if (fromIndex === 1 && toIndex === 2) {
          recordSwipeP3();
        }
        lastPanelIndex.current = toIndex;
        setCurrentPanelIndex(toIndex);
      }
    },
    [cardWidth, recordSwipeP2, recordSwipeP3, loadDetail]
  );

  // Reply modal handlers
  const openReplyModal = useCallback(() => {
    setReplyModalVisible(true);
    recordTypeStart();
  }, [recordTypeStart]);

  const closeReplyModal = useCallback(() => {
    setReplyModalVisible(false);
  }, []);

  const handleSendReply = useCallback(async () => {
    const text = replyText.trim();
    if (!text || text.length < REPLY_MIN_LENGTH || sending) return;
    if (!detail?.panel_3.can_reply) return;

    setSending(true);
    try {
      await postReply(thought.id, text);
      recordReplySent({ reply_length_chars: text.length });
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
      setReplyText("");
      setReplyModalVisible(false);
      // Refetch and snap back to P1
      const fresh = await fetchThought(thought.id);
      setDetail(fresh);
      scrollRef.current?.scrollTo({ x: 0, animated: true });
      lastPanelIndex.current = 0;
      setCurrentPanelIndex(0);
    } catch {
      // keep modal open on error
    } finally {
      setSending(false);
    }
  }, [thought.id, replyText, detail?.panel_3.can_reply, sending, recordReplySent]);

  const panelContentWidth = cardWidth - spacing.warmthBarWidth;

  return (
    <View style={[styles.card, { borderRadius: spacing.cardRadius, height: cardHeight }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onScroll}
        style={{ width: cardWidth, height: cardHeight }}
        contentContainerStyle={{ width: cardWidth * 3, height: cardHeight }}
        bounces={false}
        nestedScrollEnabled
      >
        {/* Panel 1: Image + sentence + footer */}
        <View style={[styles.panel, { width: cardWidth, height: cardHeight }]}>
          <View style={styles.panel1Inner}>
            <WarmthBar warmthLevel={warmth_level} height={imageHeight + FOOTER_HEIGHT} />
            <View style={{ width: panelContentWidth, height: imageHeight }}>
              <View style={styles.imageWrap}>
                {thought.image_url ? (
                  <Image
                    source={{ uri: thought.image_url }}
                    style={styles.image}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.image, styles.imagePlaceholder]} />
                )}
                <Text style={styles.sentence} numberOfLines={2}>
                  {thought.sentence}
                </Text>
              </View>
            </View>
          </View>
          <View style={[styles.footer, { height: FOOTER_HEIGHT }]}>
            <View style={styles.profileRow}>
              {user.photo_url ? (
                <Image source={{ uri: user.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <Text style={styles.name} numberOfLines={1}>
                {user.name ? user.name.toUpperCase() : "\u2014"}
              </Text>
            </View>
            <Text style={styles.timestamp}>{formatRelativeTime(thought.created_at)}</Text>
          </View>
        </View>

        {/* Panel 2: Context */}
        <View style={[styles.panel, styles.panel2, { width: cardWidth, height: cardHeight }]}>
          {detailLoading ? (
            <View style={styles.panelCentered}>
              <ActivityIndicator size="small" color={colors.TYPE_MUTED} />
            </View>
          ) : detail ? (
            <ScrollView
              contentContainerStyle={styles.panel2Content}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <Text style={styles.sentenceP2}>{detail.panel_2.sentence}</Text>
              {detail.panel_2.context ? (
                <Text style={styles.contextP2}>{detail.panel_2.context}</Text>
              ) : null}
            </ScrollView>
          ) : (
            <View style={styles.panelCentered}>
              <Text style={styles.panelHint}>swipe to reveal</Text>
            </View>
          )}
        </View>

        {/* Panel 3: Replies */}
        <View style={[styles.panel, styles.panel3, { width: cardWidth, height: cardHeight }]}>
          {detail ? (
            <View style={styles.panel3Inner}>
              <ScrollView
                contentContainerStyle={styles.repliesContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                style={styles.repliesScroll}
              >
                {detail.panel_3.accepted_replies.length > 0 ? (
                  detail.panel_3.accepted_replies.map((r) => (
                    <View key={r.id} style={styles.replyRow}>
                      {r.user?.photo_url ? (
                        <Image source={{ uri: r.user.photo_url }} style={styles.replyAvatar} />
                      ) : (
                        <View style={[styles.replyAvatar, styles.avatarPlaceholder]} />
                      )}
                      <View style={styles.replyBody}>
                        <Text style={styles.replyName}>
                          {r.user?.name ? r.user.name.toUpperCase() : "\u2014"}
                        </Text>
                        <Text style={styles.replyText} numberOfLines={3}>
                          {r.text}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.panelHint}>no replies yet</Text>
                )}
              </ScrollView>
              {detail.panel_3.can_reply && (
                <TouchableOpacity style={styles.replyTrigger} onPress={openReplyModal}>
                  <Text style={styles.replyTriggerLabel}>reply.</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.panelCentered}>
              <ActivityIndicator size="small" color={colors.TYPE_MUTED} />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Panel indicator */}
      <View style={[styles.indicatorWrap, { bottom: FOOTER_HEIGHT }]} pointerEvents="none">
        <PanelIndicator currentIndex={currentPanelIndex} />
      </View>

      {/* Reply Modal */}
      <Modal
        visible={replyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeReplyModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={styles.modalBackdrop} onPress={closeReplyModal} activeOpacity={1} />
          <View style={styles.modalContent}>
            <Text style={styles.modalSentence} numberOfLines={2}>
              {thought.sentence}
            </Text>
            <Text style={styles.modalReplyLabel}>reply.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="what this thought surfaces in you..."
              placeholderTextColor={colors.TYPE_MUTED}
              value={replyText}
              onChangeText={(t) => setReplyText(t.slice(0, REPLY_MAX_LENGTH))}
              editable={!sending}
              multiline
              maxLength={REPLY_MAX_LENGTH}
              autoFocus
            />
            <View style={styles.modalFooter}>
              <Text style={styles.modalHint}>
                {replyText.trim().length}/{REPLY_MAX_LENGTH} (min {REPLY_MIN_LENGTH})
              </Text>
              <TouchableOpacity
                style={[styles.sendBtn, (replyText.trim().length < REPLY_MIN_LENGTH || sending) && styles.sendBtnDisabled]}
                onPress={handleSendReply}
                disabled={replyText.trim().length < REPLY_MIN_LENGTH || sending}
              >
                <Text style={styles.sendBtnText}>{sending ? "..." : "Send"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: colors.CARD_GROUND,
  },
  panel: {
    overflow: "hidden",
  },
  panel1Inner: {
    flexDirection: "row",
    flex: 1,
  },
  imageWrap: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: colors.PANEL_DARK,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    backgroundColor: colors.PANEL_DARK,
  },
  sentence: {
    ...typography.thoughtSentence,
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    color: colors.TYPE_WHITE,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    backgroundColor: colors.CARD_GROUND,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  avatar: {
    width: spacing.profilePhotoSize,
    height: spacing.profilePhotoSize,
    borderRadius: spacing.profilePhotoSize / 2,
  },
  avatarPlaceholder: {
    backgroundColor: colors.TYPE_MUTED,
  },
  name: {
    ...typography.label,
    color: colors.TYPE_DARK,
    flex: 1,
  },
  timestamp: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
  },

  // Panel 2
  panel2: {
    backgroundColor: colors.PANEL_DARK,
    paddingHorizontal: 20,
  },
  panel2Content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 20,
  },
  sentenceP2: {
    ...typography.thoughtSentence,
    fontSize: 11,
    color: colors.TYPE_WHITE,
    marginBottom: 14,
  },
  contextP2: {
    ...typography.context,
    fontSize: 9.5,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 15,
  },

  // Panel 3
  panel3: {
    backgroundColor: colors.PANEL_DEEP,
    paddingHorizontal: 14,
  },
  panel3Inner: {
    flex: 1,
  },
  repliesScroll: {
    flex: 1,
  },
  repliesContent: {
    paddingVertical: 12,
  },
  replyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  replyAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: 8,
  },
  replyBody: { flex: 1 },
  replyName: {
    ...typography.metadata,
    fontSize: 7,
    color: colors.TYPE_MUTED,
    marginBottom: 2,
  },
  replyText: {
    ...typography.context,
    fontSize: 9.5,
    color: colors.TYPE_WHITE,
  },
  replyTrigger: {
    paddingVertical: 8,
    alignItems: "center",
  },
  replyTriggerLabel: {
    ...typography.replyInput,
    color: colors.VERMILLION,
    fontSize: 11,
  },

  // Shared panel helpers
  panelCentered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  panelHint: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    fontSize: 9,
  },

  // Indicator
  indicatorWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },

  // Reply modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    backgroundColor: colors.PANEL_DEEP,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  modalSentence: {
    ...typography.thoughtSentence,
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 16,
  },
  modalReplyLabel: {
    ...typography.replyInput,
    color: colors.VERMILLION,
    marginBottom: 8,
  },
  modalInput: {
    ...typography.replyInput,
    color: colors.TYPE_WHITE,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.2)",
    paddingVertical: 10,
    minHeight: 60,
    textAlignVertical: "top",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  modalHint: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
  },
  sendBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: colors.OLIVE,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: {
    ...typography.label,
    color: colors.TYPE_WHITE,
  },
});
