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
  Image as NativeImage,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, typography, fontFamily, IMAGE_ASPECT_RATIO, primitives, radii, opacity } from "../theme";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import {
  register,
  updateProfile,
  createThought,
  setCachedUserId,
  type RegisterBody,
} from "../lib/api";
import {
  setAuth,
  setOnboardingComplete,
  setOnboardingStep,
  getOnboardingStep,
  getStoredUserId,
} from "../lib/auth-store";
import { ScreenExitButton } from "../components/ScreenExitButton";
import { ThoughtImageFrame } from "../components/ThoughtImageFrame";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../assets/images/ohm-logo.png");

const SENTENCE_MAX = 200;
const CONTEXT_MAX = 600;
const PHOTO_SIZE = 80;

function validateStrongPassword(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (!/\d/.test(password)) return "Password must include a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a symbol";
  return null;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { containerStyle, contentWidth } = useResponsiveLayout();
  const [step, setStepState] = useState<1 | 2 | 3>(1);

  // Step 1
  const [name, setName] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sendingStep1, setSendingStep1] = useState(false);

  const [termsAccepted, setTermsAccepted] = useState(false);

  // Step 2
  const [interest1, setInterest1] = useState("");
  const [interest2, setInterest2] = useState("");
  const [interest3, setInterest3] = useState("");
  const [sendingStep2, setSendingStep2] = useState(false);

  // Step 3 (first thought)
  const [sentence, setSentence] = useState("");
  const [context, setContext] = useState("");
  const [thoughtPhotoUrl, setThoughtPhotoUrl] = useState<string | null>(null);
  const [thoughtPhotoInitialized, setThoughtPhotoInitialized] = useState(false);
  const [posting, setPosting] = useState(false);

  const previewWidth = width - spacing.screenPadding * 2;
  const previewHeight = previewWidth / IMAGE_ASPECT_RATIO;
  const selectedProfilePhoto = photoBase64 ?? photoUri;

  // Smooth fade-in for logo and content
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [step, fadeAnim, slideAnim]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [savedStep, storedUserId] = await Promise.all([
        getOnboardingStep(),
        getStoredUserId(),
      ]);
      if (cancelled) return;
      if (storedUserId && savedStep >= 2 && savedStep <= 3) {
        setStepState(savedStep as 1 | 2 | 3);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== 3 || thoughtPhotoInitialized) return;
    setThoughtPhotoUrl(selectedProfilePhoto ?? null);
    setThoughtPhotoInitialized(true);
  }, [selectedProfilePhoto, step, thoughtPhotoInitialized]);

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
      if (result.canceled) return;
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

  const canContinueStep1 =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 10 &&
    confirmPassword.length > 0 &&
    termsAccepted;

  const handleStep1Continue = useCallback(async () => {
    if (!canContinueStep1 || sendingStep1) return;
    const passwordError = validateStrongPassword(password);
    if (passwordError) {
      setRegError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setRegError("Passwords do not match");
      return;
    }
    setRegError(null);
    setSendingStep1(true);
    try {
      const body: RegisterBody = {
        name: name.trim(),
        photo_url: selectedProfilePhoto ?? undefined,
        email: email.trim(),
        password,
        terms_accepted: true,
      };
      const { verification_email } = await register(body);
      router.replace({
        pathname: "/verify-email",
        params: { email: verification_email },
      });
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSendingStep1(false);
    }
  }, [
    canContinueStep1,
    sendingStep1,
    name,
    selectedProfilePhoto,
    email,
    password,
    confirmPassword,
    router,
  ]);

  const handleStep2Continue = useCallback(async () => {
    if (sendingStep2) return;
    setSendingStep2(true);
    try {
      const interests = [interest1.trim(), interest2.trim(), interest3.trim()]
        .filter(Boolean)
        .slice(0, 3);
      await updateProfile({ interests });
      await setOnboardingComplete(false);
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
      await createThought(s, context.trim() || undefined, thoughtPhotoUrl || undefined);
      await setOnboardingComplete(true);
      await setOnboardingStep(1);
      const uid = await getStoredUserId();
      if (uid) setCachedUserId(uid);
      router.replace("/(tabs)");
    } catch {
      setPosting(false);
      Alert.alert("Error", "Could not post. Try again.");
    }
  }, [sentence, context, posting, thoughtPhotoUrl, router]);

  const allInterestsEmpty =
    !interest1.trim() && !interest2.trim() && !interest3.trim();
  const canPostStep3 = sentence.trim().length > 0;
  const onboardingBusy = uploadingPhoto || sendingStep1 || sendingStep2 || posting;

  const handleExit = useCallback(async () => {
    if (onboardingBusy) return;

    if (step === 1) {
      router.replace("/login");
      return;
    }

    await setOnboardingComplete(false);
    await setOnboardingStep(step);
    router.replace("/(tabs)");
  }, [onboardingBusy, router, step]);

  if (step === 1) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.topBar}>
          <ScreenExitButton onPress={handleExit} disabled={onboardingBusy} />
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
          <Animated.View style={[styles.logoHero, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Image source={ohmLogo} style={styles.logoHeroImage} contentFit="contain" />
          </Animated.View>
          <Animated.Text style={[styles.stepTitle, { opacity: fadeAnim }]}>Identity</Animated.Text>

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
              <NativeImage
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
          <Text style={styles.photoGuide}>
            Make sure your full face is visible and clear.
          </Text>
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
            placeholder="Password"
            placeholderTextColor={colors.TYPE_MUTED}
            value={password}
            onChangeText={(t) => { setPassword(t); setRegError(null); }}
            secureTextEntry
            editable={!sendingStep1}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.TYPE_MUTED}
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); setRegError(null); }}
            secureTextEntry
            editable={!sendingStep1}
          />
          <Text style={styles.passwordGuide}>
            Use 10+ characters with uppercase, lowercase, a number, and a symbol.
          </Text>

          <View style={styles.termsRow}>
            <TouchableOpacity
              style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}
              onPress={() => setTermsAccepted((v) => !v)}
              disabled={sendingStep1}
              activeOpacity={0.7}
            >
              {termsAccepted ? <Text style={styles.checkmark}>✓</Text> : null}
            </TouchableOpacity>
            <Text style={styles.termsText}>
              I agree to the{" "}
              <Text
                style={styles.termsLink}
                onPress={() => router.push("/terms" as Href)}
              >
                Terms of Use
              </Text>
              {" "}and{" "}
              <Text
                style={styles.termsLink}
                onPress={() => router.push("/privacy" as Href)}
              >
                Privacy Policy
              </Text>
            </Text>
          </View>

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
        <View style={styles.topBar}>
          <ScreenExitButton onPress={handleExit} disabled={onboardingBusy} />
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
          <Animated.View style={[styles.logoHero, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Image source={ohmLogo} style={styles.logoHeroImage} contentFit="contain" />
          </Animated.View>
          <Animated.Text style={[styles.stepTitle, { opacity: fadeAnim }]}>Right now</Animated.Text>
          <Text style={styles.stepSubtitle}>
            What is alive in your thinking right now. This stays internal.
          </Text>

          <TextInput
            style={styles.interestInput}
            placeholder="what you keep returning to"
            placeholderTextColor={colors.TYPE_MUTED}
            value={interest1}
            onChangeText={setInterest1}
            editable={!sendingStep2}
          />
          <TextInput
            style={styles.interestInput}
            placeholder="what is taking your attention"
            placeholderTextColor={colors.TYPE_MUTED}
            value={interest2}
            onChangeText={setInterest2}
            editable={!sendingStep2}
          />
          <TextInput
            style={styles.interestInput}
            placeholder="what feels quietly important"
            placeholderTextColor={colors.TYPE_MUTED}
            value={interest3}
            onChangeText={setInterest3}
            editable={!sendingStep2}
          />

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
        <View style={styles.headerLead}>
          <Image source={ohmLogo} style={styles.logoHeaderIcon} contentFit="contain" />
        </View>
        <ScreenExitButton onPress={handleExit} disabled={onboardingBusy} />
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
          <ThoughtImageFrame
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
          <View style={styles.photoActionRow}>
            <TouchableOpacity style={styles.photoActionBtn} onPress={pickThoughtPhoto} disabled={posting}>
              <Text style={styles.photoActionText}>Change photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>One big thought</Text>
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
    maxWidth: 540,
    alignSelf: "center" as const,
    width: "100%" as const,
  },
  stepTitle: {
    ...typography.buttonText,
    color: colors.TYPE_DARK,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  stepSubtitle: {
    ...typography.bodySmall,
    color: colors.TYPE_MUTED,
    marginBottom: 20,
  },
  firstThoughtTitle: {
    ...typography.metadataSmall,
    color: colors.TYPE_MUTED,
    textTransform: "uppercase",
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
    borderBottomColor: colors.CARD_BORDER,
  },
  headerLead: {
    flex: 1,
    gap: 6,
  },
  topBar: {
    alignItems: "flex-end",
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 20,
    paddingBottom: 12,
  },
  logoHero: {
    alignSelf: "center",
    marginBottom: 32,
    marginTop: 12,
  },
  logoHeroImage: {
    width: 64,
    height: 64,
  },
  logoHeaderIcon: {
    width: 22,
    height: 22,
  },
  input: {
    ...primitives.input,
    marginBottom: 12,
  },
  passwordGuide: {
    ...typography.context,
    color: colors.TYPE_MUTED,
    marginTop: -2,
    marginBottom: 12,
  },
  photoWrap: {
    alignSelf: "center",
    marginBottom: 10,
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
  photoGuide: {
    ...typography.bodySmall,
    color: colors.TYPE_MUTED,
    textAlign: "center",
    marginBottom: 12,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.TYPE_MUTED,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.OLIVE,
    borderColor: colors.OLIVE,
  },
  checkmark: {
    color: colors.TYPE_WHITE,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
  },
  termsText: {
    flex: 1,
    fontFamily: typography.context.fontFamily,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.TYPE_DARK,
  },
  termsLink: {
    color: colors.OLIVE,
    textDecorationLine: "underline" as const,
  },
  error: {
    ...primitives.errorText,
  },
  continueBtn: {
    ...primitives.buttonPrimary,
    backgroundColor: colors.OLIVE,
    marginTop: 24,
  },
  continueBtnDisabled: {
    opacity: opacity.disabled,
  },
  continueBtnText: {
    ...primitives.buttonPrimaryText,
  },
  interestInput: {
    ...primitives.inputReading,
    marginBottom: 12,
  },
  nudge: {
    ...typography.label,
    color: colors.TYPE_MUTED,
    marginTop: 4,
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
  photoFallbackText: {
    ...typography.context,
    color: colors.TYPE_MUTED,
  },
  textArea: {
    ...primitives.textArea,
  },
  sentenceInput: {
    fontFamily: fontFamily.sentientBold,
    fontSize: 22,
    lineHeight: 29,
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
