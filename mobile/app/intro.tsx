import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoView, useVideoPlayer } from "expo-video";
import { colors, fontFamily, spacing } from "../theme";
import { loginDemo, setCachedUserId } from "../lib/api";
import {
  dismissIntro,
  getShouldShowIntro,
  setAuth,
  setOnboardingComplete,
  setOnboardingStep,
} from "../lib/auth-store";
import { resolveStartupRoute } from "../lib/startup-route";

const INTRO_VIDEO = require("../assets/videos/intro.mp4");
const CTA_REVEAL_WINDOW_SECONDS = 3;
const CTA_POLL_INTERVAL_MS = 200;

type IntroLandingProps = {
  buttonLabel?: string;
  secondaryLabel?: string;
  busy?: boolean;
  onContinue: () => void;
  onSecondaryPress?: () => void;
};

export function IntroLanding({
  buttonLabel = "Onboard",
  secondaryLabel = "Preview demo mode",
  busy = false,
  onContinue,
  onSecondaryPress,
}: IntroLandingProps) {
  const insets = useSafeAreaInsets();
  const [showCta, setShowCta] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const player = useVideoPlayer(INTRO_VIDEO, (instance) => {
    instance.loop = false;
    instance.muted = false;
    instance.timeUpdateEventInterval = 0.25;
    instance.play();
  });

  useEffect(() => {
    const revealInterval = setInterval(() => {
      const duration = player.duration;
      const currentTime = player.currentTime;

      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }

      if (duration <= CTA_REVEAL_WINDOW_SECONDS) {
        setShowCta(true);
        return;
      }

      if (currentTime >= duration - CTA_REVEAL_WINDOW_SECONDS) {
        setShowCta(true);
      }
    }, CTA_POLL_INTERVAL_MS);

    const playToEndSubscription = player.addListener("playToEnd", () => {
      setShowCta(true);
    });

    const statusSubscription = player.addListener("statusChange", ({ status }) => {
      if (status === "error") {
        setVideoFailed(true);
        setShowCta(true);
      }
    });

    return () => {
      clearInterval(revealInterval);
      playToEndSubscription.remove();
      statusSubscription.remove();
    };
  }, [player]);

  return (
    <View style={styles.container}>
      {videoFailed ? (
        <View style={styles.copyWrap}>
          <Text style={styles.brand}>ohm.</Text>
          <Text style={styles.copy}>
            One honest thought can open a private conversation.
          </Text>
        </View>
      ) : (
        <VideoView
          player={player}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
      )}

      {showCta ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={onContinue}
            activeOpacity={0.85}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
            ) : (
              <Text style={styles.buttonText}>{buttonLabel}</Text>
            )}
          </TouchableOpacity>
          {onSecondaryPress ? (
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={onSecondaryPress}
              activeOpacity={0.85}
              disabled={busy}
            >
              <Text style={styles.secondaryActionText}>{secondaryLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function IntroScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [shouldShowIntro, setShouldShowIntro] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [nextRoute, introEnabled] = await Promise.all([
          resolveStartupRoute(),
          getShouldShowIntro(),
        ]);

        if (cancelled) return;

        if (nextRoute === "/login" && introEnabled) {
          setShouldShowIntro(true);
          setReady(true);
          return;
        }

        router.replace(nextRoute);
      } catch (error) {
        console.warn("Intro gate resolution failed:", error);

        const introEnabled = await getShouldShowIntro().catch(() => true);
        if (cancelled) return;

        if (introEnabled) {
          setShouldShowIntro(true);
          setReady(true);
          return;
        }

        router.replace("/login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleContinue = useCallback(() => {
    if (busy) return;

    setBusy(true);
    void (async () => {
      try {
        await dismissIntro();
        const nextRoute = await resolveStartupRoute();
        router.replace(nextRoute === "/login" ? "/enter-invite" : nextRoute);
      } catch (error) {
        console.warn("Intro route resolution failed:", error);
        router.replace("/enter-invite");
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, router]);

  const handleDemoPreview = useCallback(() => {
    if (busy) return;

    setBusy(true);
    void (async () => {
      try {
        await dismissIntro();
        const { token, user_id, onboarding_complete, onboarding_step } = await loginDemo();
        await setAuth(token, user_id);
        await setOnboardingComplete(onboarding_complete);
        await setOnboardingStep(onboarding_step);
        setCachedUserId(user_id);
        router.replace("/(tabs)");
      } catch (error) {
        console.warn("Intro demo login failed:", error);
        router.replace("/login");
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, router]);

  if (!ready) {
    return (
      <View style={styles.loadingShell}>
        <ActivityIndicator size="small" color={colors.TYPE_WHITE} />
      </View>
    );
  }

  if (!shouldShowIntro) {
    return null;
  }

  return (
    <IntroLanding
      buttonLabel="Onboard"
      secondaryLabel="Preview demo mode"
      busy={busy}
      onContinue={handleContinue}
      onSecondaryPress={handleDemoPreview}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.PANEL_DEEP,
  },
  loadingShell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.PANEL_DEEP,
  },
  video: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  copyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: spacing.screenPadding,
    backgroundColor: colors.WARM_GROUND,
  },
  brand: {
    fontFamily: fontFamily.comico,
    fontSize: 42,
    color: colors.TYPE_DARK,
  },
  copy: {
    maxWidth: 300,
    textAlign: "center",
    fontFamily: fontFamily.sentient,
    fontSize: 24,
    lineHeight: 30,
    color: colors.TYPE_DARK,
  },
  footer: {
    position: "absolute",
    left: spacing.screenPadding,
    right: spacing.screenPadding,
    bottom: 0,
    alignItems: "center",
    gap: 14,
  },
  button: {
    minWidth: 180,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: colors.VERMILLION,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.85,
  },
  buttonText: {
    fontFamily: fontFamily.comico,
    fontSize: 14,
    letterSpacing: 1.1,
    color: colors.TYPE_WHITE,
  },
  secondaryAction: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  secondaryActionText: {
    fontFamily: fontFamily.sentient,
    fontSize: 15,
    color: colors.TYPE_WHITE,
    textDecorationLine: "underline",
  },
});
