import { useState } from "react";
import { StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { colors, shared, durations } from "../../theme";
import { PillButton } from "../ui/PillButton";

interface ContextOverlayProps {
  visible: boolean;
  thoughtId: string;
  sentence: string;
  context: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl?: string;
  timeAgo?: string;
  onClose: () => void;
  onSync: (replyText: string) => void;
}

export function ContextOverlay({
  visible,
  thoughtId,
  sentence,
  context,
  authorId,
  authorName,
  authorPhotoUrl,
  timeAgo = "",
  onClose,
  onSync,
}: ContextOverlayProps) {
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  if (!visible) return null;

  const handleSync = async () => {
    if (sending) return;
    setSending(true);
    onSync(replyText.trim());
    setReplyText("");
    setSending(false);
  };

  return (
    <Animated.View
      style={styles.overlay}
      entering={FadeIn.duration(durations.normal)}
      exiting={FadeOut.duration(durations.fast)}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View
        style={styles.card}
        entering={FadeIn.duration(durations.normal).delay(50)}
      >
        {/* Vermillion title */}
        <Text style={styles.sentence}>{sentence}</Text>

        {/* Context body */}
        {context ? (
          <Text style={styles.contextBody}>{context}</Text>
        ) : (
          <Text style={[styles.contextBody, { fontStyle: "italic" }]}>Loading...</Text>
        )}

        {/* Author */}
        <View style={styles.authorBar}>
          <View style={styles.authorAvatar} />
          <View>
            <Text style={styles.authorName}>{authorName}</Text>
            {timeAgo ? <Text style={styles.timeAgo}>{timeAgo}</Text> : null}
          </View>
        </View>

        {/* Reply input */}
        <View style={styles.replyInput}>
          <TextInput
            style={styles.replyTextInput}
            placeholder={`Reply to ${authorName}...`}
            placeholderTextColor="rgba(240,235,229,0.15)"
            value={replyText}
            onChangeText={setReplyText}
            maxLength={200}
            multiline
          />
        </View>

        {/* Sync button */}
        <View style={styles.syncRow}>
          <PillButton label={sending ? "Syncing..." : "Sync"} onPress={handleSync} variant="vermillion" disabled={sending} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  card: {
    width: "85%",
    maxHeight: "80%",
    backgroundColor: "#141414",
    borderRadius: 20,
    overflow: "hidden",
    padding: 0,
  },
  sentence: {
    fontSize: 28,
    fontWeight: "700",
    color: shared.VERMILLION,
    lineHeight: 28,
    letterSpacing: -1.2,
    padding: 24,
    paddingBottom: 12,
  },
  contextBody: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 18,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  authorBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  authorAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#444",
  },
  authorName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#F0EBE5",
  },
  timeAgo: {
    fontSize: 8,
    color: "rgba(240,235,229,0.18)",
  },
  replyInput: {
    marginHorizontal: 24,
    marginTop: 8,
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 10,
    paddingHorizontal: 14,
    minHeight: 40,
  },
  replyTextInput: {
    fontSize: 11,
    color: "#F0EBE5",
    padding: 0,
  },
  syncRow: {
    alignItems: "center",
    paddingVertical: 16,
  },
});
