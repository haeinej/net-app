import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { colors, shared, typography, computeCardFontSize } from "../../theme";
import { CircleButton } from "../../components/ui/CircleButton";
import { PillButton } from "../../components/ui/PillButton";
import * as api from "../../lib/api";
import { formatRelativeTime } from "../../lib/format";

// ── Keyword highlight ──────────────────────────────
function KeywordText({ sentence, keywords, style }: { sentence: string; keywords?: string[]; style: any }) {
  if (!keywords?.length) return <Text style={style}>{sentence}</Text>;
  const lk = keywords.map((k) => k.toLowerCase());
  const words = sentence.split(/(\s+)/);
  return (
    <Text style={style}>
      {words.map((w, i) => {
        const isKw = lk.includes(w.toLowerCase().replace(/[.,!?;:'"]/g, ""));
        return isKw ? <Text key={i} style={{ color: shared.WARM_ORANGE }}>{w}</Text> : w;
      })}
    </Text>
  );
}

export default function ThoughtDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [detail, setDetail] = useState<api.ThoughtDetailResponse | null>(null);
  const [replies, setReplies] = useState<api.ThoughtPanel3Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.fetchThought(id);
      setDetail(data);
      setReplies(data.panel_3.replies);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleReply = async () => {
    if (!replyText.trim() || !id || sending) return;
    setSending(true);
    try {
      await api.createThought(replyText.trim(), undefined, undefined, id);
      setReplyText("");
      load(); // refresh replies
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  };

  if (loading || !detail) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <CircleButton onPress={() => router.back()} size={32}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M19 12H5M12 19l-7-7 7-7" stroke={colors.TYPE_MUTED} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </CircleButton>
        </View>
        <View style={styles.loadingCenter}>
          <Text style={styles.mutedText}>Loading...</Text>
        </View>
      </View>
    );
  }

  const p1 = detail.panel_1;
  const p2 = detail.panel_2;
  const p3 = detail.panel_3;
  const isPhoto = !!p1.photo_url;
  const isDark = isPhoto || (p1.sentence?.charCodeAt(0) ?? 0) % 2 === 1;
  const fontSize = computeCardFontSize(p2.sentence.length);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <CircleButton onPress={() => router.back()} size={32}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M12 19l-7-7 7-7" stroke={colors.TYPE_MUTED} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </CircleButton>
        <Text style={styles.headerTitle}>Thought</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Poster card */}
        <View style={[styles.posterCard, {
          backgroundColor: isPhoto ? "#0A0A0A" : isDark ? "#0A0A0A" : "#FFFFFF",
        }]}>
          {isPhoto && p1.photo_url && (
            <>
              <Image source={{ uri: p1.photo_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={styles.photoOverlay} />
            </>
          )}
          <View style={styles.posterContent}>
            <KeywordText
              sentence={p2.sentence}
              style={[
                styles.posterText,
                { fontSize, color: isDark ? "#F0EBE5" : "#1A1A16" },
              ]}
            />
          </View>
          {/* Author bar */}
          {p1.user && (
            <View style={styles.authorBar}>
              {p1.user.photo_url ? (
                <Image source={{ uri: p1.user.photo_url }} style={styles.authorDot} />
              ) : (
                <View style={[styles.authorDot, { backgroundColor: "#666" }]} />
              )}
              <Text style={[styles.authorName, { color: isDark ? "rgba(240,235,229,0.3)" : "rgba(26,26,22,0.25)" }]}>
                {p1.user.name ?? ""}
              </Text>
              {p1.created_at && (
                <Text style={[styles.authorName, { color: isDark ? "rgba(240,235,229,0.15)" : "rgba(26,26,22,0.15)" }]}>
                  {" · "}{formatRelativeTime(p1.created_at)}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Context */}
        {p2.context ? (
          <View style={styles.contextSection}>
            <Text style={styles.contextText}>{p2.context}</Text>
          </View>
        ) : null}

        {/* Replies */}
        {replies.length > 0 && (
          <View style={styles.repliesSection}>
            <Text style={styles.sectionLabel}>Replies</Text>
            {replies.map((reply) => (
              <View key={reply.id} style={styles.replyRow}>
                <View style={[styles.replyDot, { backgroundColor: "#888" }]} />
                <View style={styles.replyBody}>
                  <Text style={styles.replyAuthor}>
                    {reply.user?.name ?? "Someone"}
                    {reply.created_at && (
                      <Text style={styles.replyTime}>{" · "}{formatRelativeTime(reply.created_at)}</Text>
                    )}
                  </Text>
                  <Text style={styles.replyText}>{reply.text}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Reply input */}
      {p3.can_reply && (
        <View style={[styles.replyBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.replyInput}
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Reply..."
            placeholderTextColor={colors.TYPE_MUTED}
            maxLength={200}
            multiline
          />
          <PillButton
            label="Send"
            onPress={handleReply}
            variant="vermillion"
            disabled={!replyText.trim() || sending}
            style={{ paddingHorizontal: 16, paddingVertical: 8 }}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    ...typography.screenTitle,
    color: colors.TYPE_PRIMARY,
  },
  scroll: { flex: 1 },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  mutedText: { color: colors.TYPE_MUTED, fontSize: 14, fontFamily: "Helvetica Neue" },

  // Poster card
  posterCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    overflow: "hidden",
    minHeight: 280,
    position: "relative",
  },
  photoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  posterContent: {
    flex: 1,
    padding: 24,
    paddingTop: 32,
    justifyContent: "flex-end",
  },
  posterText: {
    fontFamily: "Helvetica Neue",
    fontWeight: "700",
    lineHeight: undefined, // let RN compute
    letterSpacing: -1.2,
  },
  authorBar: {
    position: "absolute",
    bottom: 12,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  authorDot: { width: 16, height: 16, borderRadius: 8 },
  authorName: { fontSize: 9, fontWeight: "400", fontFamily: "Helvetica Neue" },

  // Context
  contextSection: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.SURFACE,
    borderRadius: 12,
  },
  contextText: {
    fontSize: 14,
    color: colors.TYPE_SECONDARY,
    lineHeight: 20,
    fontFamily: "Helvetica Neue",
  },

  // Replies
  repliesSection: { marginHorizontal: 16, marginTop: 24 },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.TYPE_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
    fontFamily: "Helvetica Neue",
  },
  replyRow: { flexDirection: "row", marginBottom: 16, gap: 10 },
  replyDot: { width: 24, height: 24, borderRadius: 12, marginTop: 2 },
  replyBody: { flex: 1 },
  replyAuthor: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.TYPE_PRIMARY,
    marginBottom: 2,
    fontFamily: "Helvetica Neue",
  },
  replyTime: { fontWeight: "400", color: colors.TYPE_MUTED },
  replyText: {
    fontSize: 13,
    color: colors.TYPE_SECONDARY,
    lineHeight: 18,
    fontFamily: "Helvetica Neue",
  },

  // Reply bar
  replyBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.CARD_BORDER,
    backgroundColor: colors.BG,
  },
  replyInput: {
    flex: 1,
    backgroundColor: colors.SURFACE,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.TYPE_PRIMARY,
    maxHeight: 80,
    fontFamily: "Helvetica Neue",
  },
});
