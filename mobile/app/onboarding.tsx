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
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, fontFamily, IMAGE_ASPECT_RATIO } from "../theme";
import {
  register,
  updateProfile,
  createThought,
  type RegisterBody,
} from "../lib/api";
import {
  setAuth,
  setOnboardingComplete,
  setOnboardingStep,
  getOnboardingStep,
  getStoredUserId,
} from "../lib/auth-store";
import { setCachedUserId } from "../lib/api";

const COHORT_YEARS = [2026, 2027, 2028, 2029];
const SENTENCE_MAX = 200;
const CONTEXT_MAX = 600;
const CONTEXT_COUNT_THRESHOLD = 500;
const DEBOUNCE_MS = 2500;
const PHOTO_SIZE = 80;

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [step, setStepState] = useState<1 | 2 | 3>(1);

  // Step 1
  const [name, setName] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [cohortYear, setCohortYear] = useState<number | null>(null);
  const [currentCity, setCurrentCity] = useState("");
  const [concentration, setConcentration] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sendingStep1, setSendingStep1] = useState(false);

  // Step 2
  const [interest1, setInterest1] = useState("");
  const [interest2, setInterest2] = useState("");
  const [interest3, setInterest3] = useState("");
  const [sendingStep2, setSendingStep2] = useState(false);

  // Step 3 (first thought)
  const [sentence, setSentence] = useState("");
  const [context, setContext] = useState("");
  const [posting, setPosting] = useState(false);
  const [imageStatus, setImageStatus] = useState<
    "idle" | "generating" | "after_post"
  >("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewWidth = width - spacing.screenPadding * 2;
  const previewHeight = previewWidth / IMAGE_ASPECT_RATIO;
  const pulseOpacity = useSharedValue(0.5);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, token] = await Promise.all([
        getOnboardingStep(),
        getStoredUserId(), // if we have userId we're past step 1
      ]);
      if (cancelled) return;
      if (token && s >= 2 && s <= 3) setStepState(s as 1 | 2 | 3);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    } else {
      pulseOpacity.value = 0.5;
    }
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

  const pickPhoto = useCallback(async () => {
    setUploadingPhoto(true);
    setRegError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled) {
        setUploadingPhoto(false);
        return;
      }
      const asset = result.assets[0];
      if (asset?.uri) {
        setPhotoUri(asset.uri);
        if (asset.base64) {
          const dataUrl = `data:image/jpeg;base64,${asset.base64}`;
          setPhotoBase64(dataUrl);
        } else {
          setPhotoBase64(asset.uri);
        }
      }
    } catch {
      setRegError("Could not select photo");
    } finally {
      setUploadingPhoto(false);
    }
  }, []);

  const canContinueStep1 =
    name.trim().length > 0 &&
    (photoUri !== null || photoBase64 !== null) &&
    cohortYear !== null &&
    currentCity.trim().length > 0 &&
    concentration.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8;

  const handleStep1Continue = useCallback(async () => {
    if (!canContinueStep1 || sendingStep1) return;
    setRegError(null);
    setSendingStep1(true);
    try {
      const body: RegisterBody = {
        name: name.trim(),
        photo_url: photoBase64 ?? photoUri ?? undefined,
        cohort_year: cohortYear!,
        current_city: currentCity.trim(),
        concentration: concentration.trim(),
        email: email.trim(),
        password,
      };
      const { token, user_id } = await register(body);
      await setAuth(token, user_id);
      await setOnboardingStep(2);
      setCachedUserId(user_id);
      setStepState(2);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSendingStep1(false);
    }
  }, [
    canContinueStep1,
    sendingStep1,
    name,
    photoBase64,
    photoUri,
    cohortYear,
    currentCity,
    concentration,
    email,
    password,
  ]);

  const handleStep2Continue = useCallback(async () => {
    if (sendingStep2) return;
    setSendingStep2(true);
    try {
      const interests = [interest1.trim(), interest2.trim(), interest3.trim()]
        .filter(Boolean)
        .slice(0, 3);
      await updateProfile({ interests });
      await setOnboardingStep(3);
      setStepState(3);
    } catch {
      Alert.alert("Error", "Could not save. Try again.");
    } finally {
      setSendingStep2(false);
    }
  }, [interest1, interest2, interest3, sendingStep2]);

  const handleStep3Post = useCallback(async () => {
    const s = sentence.trim();
    if (!s || posting) return;
    setPosting(true);
    try {
      await createThought(s, context.trim() || undefined);
      await setOnboardingComplete(true);
      await setOnboardingStep(1);
      const uid = await getStoredUserId();
      if (uid) setCachedUserId(uid);
      router.replace("/(tabs)");
    } catch {
      setPosting(false);
      Alert.alert("Error", "Could not post. Try again.");
    }
  }, [sentence, context, posting, router]);

  const allInterestsEmpty =
    !interest1.trim() && !interest2.trim() && !interest3.trim();
  const canPostStep3 = sentence.trim().length > 0;

  if (step === 1) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepTitle}>Identity</Text>

          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor={colors.TYPE_MUTED}
            value={name}
            onChangeText={(t) => { setName(t); setRegError(null); }}
            editable={!sendingStep1}
          />

          <TouchableOpacity
            style={styles.photoWrap}
            onPress={pickPhoto}
            disabled={uploadingPhoto || sendingStep1}
          >
            {photoUri || photoBase64 ? (
              <Image
                source={{
                  uri: photoUri ?? (photoBase64 ?? undefined),
                }}
                style={styles.photoCircle}
              />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderText}>+</Text>
              </View>
            )}
            {uploadingPhoto && (
              <View style={styles.photoOverlay}>
                <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>Cohort year</Text>
          <View style={styles.cohortRow}>
            {COHORT_YEARS.map((y) => (
              <TouchableOpacity
                key={y}
                style={[
                  styles.cohortBtn,
                  cohortYear === y && styles.cohortBtnActive,
                ]}
                onPress={() => setCohortYear(y)}
                disabled={sendingStep1}
              >
                <Text
                  style={[
                    styles.cohortBtnText,
                    cohortYear === y && styles.cohortBtnTextActive,
                  ]}
                >
                  {y}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Current city"
            placeholderTextColor={colors.TYPE_MUTED}
            value={currentCity}
            onChangeText={(t) => { setCurrentCity(t); setRegError(null); }}
            editable={!sendingStep1}
          />
          <TextInput
            style={styles.input}
            placeholder="Concentration"
            placeholderTextColor={colors.TYPE_MUTED}
            value={concentration}
            onChangeText={(t) => { setConcentration(t); setRegError(null); }}
            editable={!sendingStep1}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.TYPE_MUTED}
            value={email}
            onChangeText={(t) => { setEmail(t); setRegError(null); }}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!sendingStep1}
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min 8 characters)"
            placeholderTextColor={colors.TYPE_MUTED}
            value={password}
            onChangeText={(t) => { setPassword(t); setRegError(null); }}
            secureTextEntry
            editable={!sendingStep1}
          />

          {regError ? <Text style={styles.error}>{regError}</Text> : null}

          <TouchableOpacity
            style={[
              styles.continueBtn,
              (!canContinueStep1 || sendingStep1) && styles.continueBtnDisabled,
            ]}
            onPress={handleStep1Continue}
            disabled={!canContinueStep1 || sendingStep1}
          >
            {sendingStep1 ? (
              <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
            ) : (
              <Text style={styles.continueBtnText}>CONTINUE</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (step === 2) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepTitle}>Right now</Text>
          <Text style={styles.stepSubtitle}>
            What is alive in your thinking right now. This stays internal.
          </Text>

          <TextInput
            style={styles.interestInput}
            placeholder="what you are into right now"
            placeholderTextColor={colors.TYPE_MUTED}
            value={interest1}
            onChangeText={setInterest1}
            editable={!sendingStep2}
          />
          <TextInput
            style={styles.interestInput}
            placeholder="what you are into right now"
            placeholderTextColor={colors.TYPE_MUTED}
            value={interest2}
            onChangeText={setInterest2}
            editable={!sendingStep2}
          />
          <TextInput
            style={styles.interestInput}
            placeholder="what you are into right now"
            placeholderTextColor={colors.TYPE_MUTED}
            value={interest3}
            onChangeText={setInterest3}
            editable={!sendingStep2}
          />

          {allInterestsEmpty && (
            <Text style={styles.nudge}>
              These only help with cold start. Your thoughts and replies matter more.
            </Text>
          )}

          <TouchableOpacity
            style={[styles.continueBtn, sendingStep2 && styles.continueBtnDisabled]}
            onPress={handleStep2Continue}
            disabled={sendingStep2}
          >
            {sendingStep2 ? (
              <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
            ) : (
              <Text style={styles.continueBtnText}>CONTINUE</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Step 3 — first thought
  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <Text style={styles.firstThoughtTitle}>Your first thought</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.previewWrap,
            { width: previewWidth, height: previewHeight },
          ]}
        >
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
          style={[
            styles.postBtn,
            (!canPostStep3 || posting) && styles.postBtnDisabled,
          ]}
          onPress={handleStep3Post}
          disabled={!canPostStep3 || posting}
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 24,
  },
  stepTitle: {
    fontFamily: typography.label.fontFamily,
    fontSize: 14,
    color: colors.TYPE_DARK,
    marginBottom: 8,
    letterSpacing: 1,
  },
  stepSubtitle: {
    fontFamily: fontFamily.sentient,
    fontSize: 11,
    color: colors.TYPE_MUTED,
    marginBottom: 20,
  },
  firstThoughtTitle: {
    fontFamily: typography.label.fontFamily,
    fontSize: 14,
    color: colors.TYPE_DARK,
    letterSpacing: 1,
  },
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(26,26,22,0.06)",
  },
  input: {
    fontFamily: typography.label.fontFamily,
    fontSize: 14,
    color: colors.TYPE_DARK,
    backgroundColor: colors.CARD_GROUND,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  label: {
    fontFamily: typography.label.fontFamily,
    fontSize: 10,
    color: colors.TYPE_MUTED,
    marginBottom: 6,
    letterSpacing: 1,
  },
  photoWrap: {
    alignSelf: "center",
    marginBottom: 20,
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    overflow: "hidden",
    backgroundColor: colors.CARD_GROUND,
  },
  photoCircle: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.CARD_GROUND,
  },
  photoPlaceholderText: {
    fontSize: 28,
    color: colors.TYPE_MUTED,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26,26,22,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  cohortRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  cohortBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.CARD_GROUND,
    alignItems: "center",
  },
  cohortBtnActive: {
    backgroundColor: colors.OLIVE,
  },
  cohortBtnText: {
    fontFamily: typography.label.fontFamily,
    fontSize: 12,
    color: colors.TYPE_DARK,
  },
  cohortBtnTextActive: {
    color: colors.TYPE_WHITE,
  },
  error: {
    fontFamily: typography.label.fontFamily,
    fontSize: 12,
    color: colors.OLIVE,
    marginBottom: 12,
  },
  continueBtn: {
    backgroundColor: colors.OLIVE,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 8,
    marginTop: 24,
  },
  continueBtnDisabled: {
    opacity: 0.5,
  },
  continueBtnText: {
    fontFamily: typography.label.fontFamily,
    fontSize: 12,
    color: colors.TYPE_WHITE,
    letterSpacing: 1.2,
  },
  interestInput: {
    fontFamily: fontFamily.sentient,
    fontSize: 11.5,
    color: colors.TYPE_DARK,
    backgroundColor: colors.CARD_GROUND,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  nudge: {
    fontFamily: typography.label.fontFamily,
    fontSize: 8,
    color: colors.TYPE_MUTED,
    marginTop: 4,
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
