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
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, fontFamily, IMAGE_ASPECT_RATIO } from "../theme";
import { createThought, fetchProfile, getMyUserId } from "../lib/api";
import { ScreenExitButton } from "../components/ScreenExitButton";
import { BrandLockup } from "../components/BrandLockup";
import { ThoughtImageFrame } from "../components/ThoughtImageFrame";

const SENTENCE_MAX = 200;
const CONTEXT_MAX = 600;

export default function ComposeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [sentence, setSentence] = useState("");
  const [context, setContext] = useState("");
  const [posting, setPosting] = useState(false);
  const [thoughtPhotoUrl, setThoughtPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(true);

  const previewWidth = width - spacing.screenPadding * 2;
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

  const handlePost = useCallback(async () => {
    const s = sentence.trim();
    if (!s || posting) return;
    setPosting(true);
    try {
      await createThought(s, context.trim() || undefined, thoughtPhotoUrl || undefined);
      router.back();
    } catch {
      setPosting(false);
      Alert.alert("Error", "Could not post. Try again.");
    }
  }, [sentence, context, posting, thoughtPhotoUrl, router]);

  const canPost = sentence.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <View style={styles.headerLead}>
          <BrandLockup size="sm" />
          <Text style={styles.headerTitle}>Post a thought</Text>
        </View>
        <ScreenExitButton onPress={() => router.back()} disabled={posting} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.previewWrap, { width: previewWidth, height: previewHeight }]}>
          <ThoughtImageFrame
            thoughtText={sentence || "ohm"}
            imageUrl={thoughtPhotoUrl}
            aspectRatio={IMAGE_ASPECT_RATIO}
            borderRadius={spacing.cardRadius}
            style={styles.previewFrame}
          >
            {sentence.trim().length > 0 ? (
              <Text style={styles.previewSentence} numberOfLines={3}>
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
          <Text style={styles.fieldHint}>
            Optional. Your profile photo is used by default and you can swap it here.
          </Text>
          {loadingPhoto ? (
            <ActivityIndicator size="small" color={colors.TYPE_MUTED} style={styles.photoLoader} />
          ) : null}
          <View style={styles.photoActionRow}>
            <TouchableOpacity style={styles.photoActionBtn} onPress={pickThoughtPhoto} disabled={posting}>
              <Text style={styles.photoActionText}>
                {thoughtPhotoUrl ? "Change photo" : "Add photo"}
              </Text>
            </TouchableOpacity>
            {thoughtPhotoUrl ? (
              <TouchableOpacity style={styles.photoActionBtn} onPress={() => setThoughtPhotoUrl(null)} disabled={posting}>
                <Text style={styles.photoActionText}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {!thoughtPhotoUrl && !loadingPhoto ? (
            <Text style={styles.photoFallbackText}>
              No photo selected. The fallback mesh pattern will be used.
            </Text>
          ) : null}
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>One big thought</Text>
          <Text style={styles.fieldHint}>This becomes the line on the image.</Text>
          <TextInput
            style={[styles.textArea, styles.sentenceInput]}
            placeholder="The one thought you cannot stop turning over."
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
          <Text style={styles.fieldHint}>Three lines that place the thought.</Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(26,26,22,0.06)",
  },
  headerLead: {
    flex: 1,
    gap: 6,
  },
  headerTitle: {
    ...typography.label,
    fontSize: 8.5,
    color: colors.TYPE_MUTED,
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
    bottom: 16,
    fontSize: 25,
    lineHeight: 27,
    letterSpacing: -0.1,
    color: colors.TYPE_WHITE,
    textShadowColor: "rgba(8,6,4,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
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
    marginBottom: 16,
  },
  fieldLabel: {
    ...typography.label,
    fontSize: 8.5,
    color: colors.TYPE_MUTED,
    marginBottom: 6,
  },
  fieldHint: {
    fontFamily: fontFamily.sentient,
    fontSize: 11,
    lineHeight: 16,
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.CARD_GROUND,
  },
  photoActionText: {
    ...typography.label,
    fontSize: 7.5,
    color: colors.TYPE_DARK,
  },
  photoFallbackText: {
    ...typography.context,
    color: colors.TYPE_MUTED,
  },
  textArea: {
    backgroundColor: colors.CARD_GROUND,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sentenceInput: {
    fontFamily: fontFamily.comico,
    fontSize: 18,
    lineHeight: 24,
    color: colors.TYPE_DARK,
    minHeight: 148,
    textAlignVertical: "top",
  },
  contextInput: {
    fontFamily: fontFamily.sentient,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.TYPE_DARK,
    minHeight: 88,
    textAlignVertical: "top",
  },
  postBtn: {
    marginTop: 16,
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
