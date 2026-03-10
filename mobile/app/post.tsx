import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, IMAGE_ASPECT_RATIO } from "../theme";
import { createThought } from "../lib/api";

const SENTENCE_MAX = 200;
const CONTEXT_MAX = 600;
const CONTEXT_COUNT_THRESHOLD = 500;
const DEBOUNCE_MS = 2500;

export default function ComposeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [sentence, setSentence] = useState("");
  const [context, setContext] = useState("");
  const [posting, setPosting] = useState(false);
  const [imageStatus, setImageStatus] = useState<"idle" | "generating" | "after_post">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewWidth = width - spacing.screenPadding * 2;
  const previewHeight = previewWidth / IMAGE_ASPECT_RATIO;

  const pulseOpacity = useSharedValue(0.5);
  useEffect(() => {
    if (imageStatus === "generating") {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600 }),
          withTiming(0.4, { duration: 600 })
        ),
        -1,
        true
      );
    }
    return () => {
      pulseOpacity.value = 0.5;
    };
  }, [imageStatus, pulseOpacity]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  useEffect(() => {
    if (!sentence.trim()) {
      setImageStatus("idle");
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (generatingRef.current) {
        clearTimeout(generatingRef.current);
        generatingRef.current = null;
      }
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setImageStatus("generating");
      generatingRef.current = setTimeout(() => {
        generatingRef.current = null;
        setImageStatus("after_post");
      }, 2500);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (generatingRef.current) clearTimeout(generatingRef.current);
    };
  }, [sentence]);

  const handlePost = useCallback(async () => {
    const s = sentence.trim();
    if (!s || posting) return;
    setPosting(true);
    try {
      await createThought(s, context.trim() || undefined);
      router.back();
    } catch {
      setPosting(false);
      Alert.alert("Error", "Could not post. Try again.");
    }
  }, [sentence, context, posting, router]);

  const canPost = sentence.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          disabled={posting}
        >
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.previewWrap, { width: previewWidth, height: previewHeight }]}>
          <View style={styles.previewPlaceholder} />
          {imageStatus === "generating" && (
            <View style={styles.pulseWrap}>
              <Animated.View style={[styles.pulseDot, pulseStyle]} />
            </View>
          )}
          {imageStatus === "after_post" && (
            <Text style={styles.previewFallback}>
              Image will generate after posting
            </Text>
          )}
        </View>

        <TextInput
          style={styles.sentenceInput}
          placeholder="A thought you are in the middle of."
          placeholderTextColor={colors.TYPE_MUTED}
          value={sentence}
          onChangeText={(t) => setSentence(t.slice(0, SENTENCE_MAX))}
          multiline
          maxLength={SENTENCE_MAX}
          editable={!posting}
        />

        {sentence.trim().length > 0 && (
          <TextInput
            style={styles.contextInput}
            placeholder="600 characters of context — where this thought came from."
            placeholderTextColor={colors.TYPE_MUTED}
            value={context}
            onChangeText={(t) => setContext(t.slice(0, CONTEXT_MAX))}
            multiline
            maxLength={CONTEXT_MAX}
            editable={!posting}
          />
        )}

        <TouchableOpacity
          style={[styles.postBtn, (!canPost || posting) && styles.postBtnDisabled]}
          onPress={handlePost}
          disabled={!canPost || posting}
        >
          {posting ? (
            <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
          ) : (
            <Text style={styles.postBtnText}>POST</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WARM_GROUND,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(26,26,22,0.06)",
  },
  closeBtn: {
    padding: 8,
  },
  closeText: {
    ...typography.label,
    fontSize: 8,
    color: colors.OLIVE,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 24,
  },
  previewWrap: {
    alignSelf: "center",
    marginBottom: 24,
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
    backgroundColor: colors.PANEL_DARK,
    justifyContent: "center",
    alignItems: "center",
  },
  previewPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.PANEL_DARK,
  },
  pulseWrap: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.OLIVE,
    opacity: 0.9,
  },
  previewFallback: {
    ...typography.metadata,
    fontSize: 8,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  sentenceInput: {
    ...typography.thoughtSentence,
    fontSize: 15,
    color: colors.TYPE_DARK,
    paddingVertical: 16,
    paddingHorizontal: 4,
    minHeight: 80,
    textAlignVertical: "top",
  },
  contextInput: {
    ...typography.replyInput,
    fontSize: 11.5,
    color: colors.TYPE_DARK,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 100,
    textAlignVertical: "top",
    marginTop: 8,
  },
  postBtn: {
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: colors.VERMILLION,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  postBtnDisabled: {
    opacity: 0.5,
  },
  postBtnText: {
    ...typography.label,
    fontSize: 10,
    color: colors.TYPE_WHITE,
  },
});
