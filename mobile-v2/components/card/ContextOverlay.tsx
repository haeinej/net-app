import { useState } from "react";
import { StyleSheet, Text, TextInput, View, Pressable, Dimensions, KeyboardAvoidingView, Platform } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import { colors, shared, durations, springs } from "../../theme";
import { PillButton } from "../ui/PillButton";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

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

      {/* Bottom sheet (slide up with spring) */}
      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View
          style={styles.sheet}
          entering={SlideInDown.springify().damping(20).stiffness(300)}
          exiting={SlideOutDown.duration(200)}
        >
          {/* Grabber handle */}
          <View style={styles.grabberRow}>
            <View style={styles.grabber} />
          </View>

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
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#141414",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: SCREEN_HEIGHT * 0.7,
    paddingBottom: 34,
  },
  grabberRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#333",
  },
  sentence: {
    fontSize: 24,
    fontWeight: "700",
    color: shared.VERMILLION,
    lineHeight: 26,
    letterSpacing: -1,
    paddingHorizontal: 24,
    paddingBottom: 12,
    fontFamily: "Helvetica Neue",
  },
  contextBody: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 19,
    paddingHorizontal: 24,
    paddingBottom: 16,
    fontFamily: "Helvetica Neue",
  },
  authorBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
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
    fontFamily: "Helvetica Neue",
  },
  timeAgo: {
    fontSize: 8,
    color: "rgba(240,235,229,0.18)",
    fontFamily: "Helvetica Neue",
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
    fontSize: 12,
    color: "#F0EBE5",
    padding: 0,
    fontFamily: "Helvetica Neue",
  },
  syncRow: {
    alignItems: "center",
    paddingVertical: 16,
  },
});
