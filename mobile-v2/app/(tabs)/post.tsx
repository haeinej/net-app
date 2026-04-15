import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, Platform, Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { colors, shared } from "../../theme";
import { PillButton } from "../../components/ui/PillButton";
import { AnimatedPressable } from "../../components/ui/AnimatedPressable";
import { createThought } from "../../lib/api";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../../assets/images/ohm-logo.png");

type CardBg = "white" | "black";

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sentence, setSentence] = useState("");
  const [context, setContext] = useState("");
  const [bg, setBg] = useState<CardBg>("black");
  const [posting, setPosting] = useState(false);

  const canPost = sentence.trim().length > 0 && context.trim().length > 0;

  async function handlePost() {
    if (!canPost || posting) return;
    setPosting(true);
    try {
      await createThought(sentence.trim(), context.trim());
      setSentence("");
      setContext("");
      // Navigate to profile to see the new thought
      router.push("/(tabs)/me");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to post";
      if (Platform.OS === "web") {
        alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setPosting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Centered ohm logo */}
      <View style={styles.logoRow}>
        <Image source={ohmLogo} style={styles.logo} contentFit="contain" />
      </View>

      {/* Compose area */}
      <View style={styles.compose}>
        <TextInput
          style={styles.sentenceInput}
          placeholder="What are you thinking about?"
          placeholderTextColor={colors.TYPE_MUTED}
          value={sentence}
          onChangeText={setSentence}
          multiline
          maxLength={200}
        />
        <Text style={styles.charCount}>{sentence.length}/200</Text>

        <View style={styles.divider} />

        <TextInput
          style={styles.contextInput}
          placeholder="Add context"
          placeholderTextColor={colors.TYPE_MUTED}
          value={context}
          onChangeText={setContext}
          multiline
          maxLength={600}
        />
        <Text style={styles.charCount}>{context.length}/600</Text>
      </View>

      {/* Bottom toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.toolRow}>
          <AnimatedPressable style={styles.toolBtn}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z" stroke={colors.TYPE_MUTED} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </AnimatedPressable>
          <AnimatedPressable style={styles.toolBtn}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke={colors.TYPE_MUTED} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </AnimatedPressable>
          <View style={styles.bgPicker}>
            <AnimatedPressable
              style={[styles.bgCircle, styles.bgWhite, bg === "white" && styles.bgSelected]}
              onPress={() => setBg("white")}
            />
            <AnimatedPressable
              style={[styles.bgCircle, styles.bgBlack, bg === "black" && styles.bgSelected]}
              onPress={() => setBg("black")}
            />
          </View>
        </View>
        <PillButton
          label={posting ? "Posting..." : "Post"}
          onPress={handlePost}
          variant="vermillion"
          disabled={!canPost || posting}
        />
      </View>
    </View>
    </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.BG },
  logoRow: { alignItems: "center", paddingVertical: 8 },
  logo: { width: 24, height: 24 },
  compose: { flex: 1, paddingHorizontal: 20, paddingTop: 28 },
  sentenceInput: { fontSize: 24, fontWeight: "700", color: colors.TYPE_PRIMARY, lineHeight: 28, letterSpacing: -1, fontFamily: "Helvetica Neue" },
  contextInput: { fontSize: 14, color: colors.TYPE_PRIMARY, lineHeight: 20, fontFamily: "Helvetica Neue" },
  charCount: { fontSize: 10, color: colors.TYPE_MUTED, textAlign: "right", marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.SURFACE, marginTop: 16, marginBottom: 14 },
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, paddingBottom: 24 },
  toolRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  toolBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.SURFACE, alignItems: "center", justifyContent: "center" },
  bgPicker: { flexDirection: "row", gap: 6, marginLeft: 6 },
  bgCircle: { width: 22, height: 22, borderRadius: 11 },
  bgWhite: { backgroundColor: "#FFFFFF" },
  bgBlack: { backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: colors.TYPE_MUTED },
  bgSelected: { borderWidth: 2, borderColor: colors.TYPE_PRIMARY },
});
