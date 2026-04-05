import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, fontFamily, IMAGE_ASPECT_RATIO, primitives, opacity } from "../../theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { createThought, fetchProfile, getMyUserId } from "../../lib/api";
import { ThoughtImageFrame } from "../../components/ThoughtImageFrame";
import { pickComposePrompt, COMPOSE_SUBTITLE } from "../../constants/prompts";

const SENTENCE_MAX = 200;
const CONTEXT_MAX = 600;

export default function PostTabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useResponsiveLayout();
  const params = useLocalSearchParams<{
    in_response_to_id?: string;
    in_response_to_sentence?: string;
  }>();

  const [sentence, setSentence] = useState("");
  const [context, setContext] = useState("");
  const [posting, setPosting] = useState(false);
  const [thoughtPhotoUrl, setThoughtPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(true);
  const [composePlaceholder] = useState(() => pickComposePrompt());

  const [responseToId, setResponseToId] = useState<string | null>(
    params.in_response_to_id ?? null
  );
  const [responseToSentence, setResponseToSentence] = useState<string | null>(
    params.in_response_to_sentence ?? null
  );

  // Update response-to state when params change
  useEffect(() => {
    if (params.in_response_to_id) {
      setResponseToId(params.in_response_to_id);
      setResponseToSentence(params.in_response_to_sentence ?? null);
    }
  }, [params.in_response_to_id, params.in_response_to_sentence]);

  const previewWidth = contentWidth - spacing.screenPadding * 2;
  const previewHeight = previewWidth / IMAGE_ASPECT_RATIO;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const userId = await getMyUserId();
        if (!userId) return;
        const profile = await fetchProfile(userId);
        if (!cancelled) {
          setThoughtPhotoUrl(profile.photo_url ?? null);
        }
      } catch {
        if (!cancelled) {
          setThoughtPhotoUrl(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingPhoto(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const pickThoughtPhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      setThoughtPhotoUrl(
        asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri
      );
    } catch {
      Alert.alert("Error", "Could not select thought photo");
    }
  }, []);

  const clearResponseTo = useCallback(() => {
    setResponseToId(null);
    setResponseToSentence(null);
  }, []);

  const handlePost = useCallback(async () => {
    const s = sentence.trim();
    if (!s || posting) return;
    setPosting(true);
    try {
      const result = await createThought(
        s,
        context.trim() || undefined,
        thoughtPhotoUrl || undefined,
        responseToId || undefined
      );
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      // Reset form
      setSentence("");
      setContext("");
      setResponseToId(null);
      setResponseToSentence(null);
      setPosting(false);
      // Navigate to feed with anchor so it refreshes based on the new post
      router.replace(`/(tabs)?anchor=${result.id}`);
    } catch {
      setPosting(false);
      Alert.alert("Error", "Could not post. Try again.");
    }
  }, [sentence, context, posting, thoughtPhotoUrl, responseToId, router]);

  const canPost = sentence.trim().length > 0;

  const truncatedResponseSentence =
    responseToSentence && responseToSentence.length > 80
      ? responseToSentence.slice(0, 80) + "..."
      : responseToSentence;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <Text style={styles.brandWordmark}>
          ohm<Text style={styles.brandPeriod}>.</Text>
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {responseToId && responseToSentence ? (
          <View style={styles.responseBanner}>
            <View style={styles.responseBannerContent}>
              <Text style={styles.responseBannerLabel}>in response to</Text>
              <Text style={styles.responseBannerSentence} numberOfLines={2}>
                {truncatedResponseSentence}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.responseBannerClose}
              onPress={clearResponseTo}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.responseBannerCloseText}>x</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={[styles.previewWrap, { width: previewWidth, height: previewHeight }]}>
          <ThoughtImageFrame
            imageUrl={thoughtPhotoUrl}
            aspectRatio={IMAGE_ASPECT_RATIO}
            borderRadius={spacing.cardRadius}
            style={styles.previewFrame}
          >
            {sentence.trim().length > 0 ? (
              <Text style={styles.previewSentence} numberOfLines={4}>
                {sentence}
              </Text>
            ) : (
              <Text style={styles.previewHint}>
                Your thought will appear here.
              </Text>
            )}
          </ThoughtImageFrame>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Photo</Text>
          {loadingPhoto ? (
            <ActivityIndicator size="small" color={colors.TYPE_MUTED} style={styles.photoLoader} />
          ) : null}
          <View style={styles.photoActionRow}>
            <TouchableOpacity style={styles.photoActionBtn} onPress={pickThoughtPhoto} disabled={posting}>
              <Text style={styles.photoActionText}>Change photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>One big thought</Text>
          <Text style={styles.fieldHint}>{COMPOSE_SUBTITLE}</Text>
          <TextInput
            style={[styles.textArea, styles.sentenceInput]}
            placeholder={composePlaceholder}
            placeholderTextColor={colors.TYPE_MUTED}
            value={sentence}
            onChangeText={(t) => setSentence(t.slice(0, SENTENCE_MAX))}
            multiline
            numberOfLines={5}
            maxLength={SENTENCE_MAX}
            editable={!posting}
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Context</Text>
          <TextInput
            style={[styles.textArea, styles.contextInput]}
            placeholder="Where it came from, what triggered it, what is underneath it."
            placeholderTextColor={colors.TYPE_MUTED}
            value={context}
            onChangeText={(t) => setContext(t.slice(0, CONTEXT_MAX))}
            multiline
            numberOfLines={3}
            maxLength={CONTEXT_MAX}
            editable={!posting}
          />
        </View>

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
    alignItems: "flex-start",
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.CARD_BORDER,
  },
  brandWordmark: {
    ...typography.logo,
    color: colors.TYPE_DARK,
  },
  brandPeriod: {
    color: colors.VERMILLION,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 24,
    maxWidth: 540,
    alignSelf: "center" as const,
    width: "100%" as const,
  },
  responseBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.CARD_GROUND,
    borderRadius: spacing.cardRadius,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.CARD_BORDER,
  },
  responseBannerContent: {
    flex: 1,
    marginRight: 8,
  },
  responseBannerLabel: {
    ...typography.metadata,
    color: colors.TYPE_MUTED,
    marginBottom: 4,
  },
  responseBannerSentence: {
    ...typography.body,
    color: colors.TYPE_DARK,
  },
  responseBannerClose: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  responseBannerCloseText: {
    ...typography.bodySmall,
    color: colors.TYPE_MUTED,
    lineHeight: 18,
  },
  previewWrap: {
    alignSelf: "center",
    marginBottom: 24,
  },
  previewFrame: {
    width: "100%",
    height: "100%",
  },
  previewSentence: {
    ...typography.thoughtDisplay,
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 14,
    color: colors.TYPE_WHITE,
  },
  previewHint: {
    ...typography.metadata,
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    color: "rgba(255,255,255,0.75)",
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
  photoLoader: {
    marginBottom: 10,
    alignSelf: "flex-start",
  },
  photoActionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  photoActionBtn: {
    ...primitives.buttonPill,
  },
  photoActionText: {
    ...primitives.buttonPillText,
  },
  textArea: {
    ...primitives.textArea,
  },
  sentenceInput: {
    ...typography.thoughtDisplay,
    color: colors.TYPE_DARK,
    minHeight: 148,
    textAlignVertical: "top",
  },
  contextInput: {
    ...typography.body,
    color: colors.TYPE_DARK,
    minHeight: 88,
    textAlignVertical: "top",
  },
  postBtn: {
    ...primitives.buttonPrimary,
    backgroundColor: colors.VERMILLION,
    marginTop: 16,
  },
  postBtnDisabled: {
    opacity: opacity.disabled,
  },
  postBtnText: {
    ...primitives.buttonPrimaryText,
  },
});
