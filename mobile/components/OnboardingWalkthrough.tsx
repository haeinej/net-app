import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Pressable,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontFamily } from "../theme";
import { BrandLockup } from "./BrandLockup";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WalkthroughStep {
  id: string;
  /** Section number shown above title (null for welcome) */
  section: string | null;
  title: string;
  body: string;
  cta: string;
  /** Key into targetRefs — null means full-screen overlay */
  targetTestID: string | null;
  /** Where the tooltip card sits relative to the spotlight */
  tooltipPosition: "below" | "above" | "center";
}

interface OnboardingWalkthroughProps {
  visible: boolean;
  onComplete: () => void;
  /** Refs map: testID → React ref for spotlight measurement */
  targetRefs: Record<string, React.RefObject<View | null>>;
}

/* ------------------------------------------------------------------ */
/*  Step definitions                                                   */
/* ------------------------------------------------------------------ */

const STEPS: WalkthroughStep[] = [
  {
    id: "welcome",
    section: null,
    title: "where your\nthoughts find\nsomeone.",
    body: "no profiles. no followers. no likes.\njust what's on your mind —\nand who it reaches.",
    cta: "show me",
    targetTestID: null,
    tooltipPosition: "center",
  },
  {
    id: "post",
    section: "01",
    title: "share a thought",
    body: "a question, an observation, something half-formed.\nit gets surfaced to people who resonate.",
    cta: "next",
    targetTestID: "walkthrough-post-button",
    tooltipPosition: "below",
  },
  {
    id: "feed",
    section: "02",
    title: "the feed",
    body: "thoughts from others, surfaced by resonance.\nno popularity contest — scroll, drift, see what catches you.",
    cta: "next",
    targetTestID: "walkthrough-feed-card",
    tooltipPosition: "below",
  },
  {
    id: "reply",
    section: "03",
    title: "reply",
    body: "when a thought moves you, tap and reply.\na reply opens a private conversation with that person.",
    cta: "next",
    targetTestID: "walkthrough-feed-card",
    tooltipPosition: "above",
  },
  {
    id: "conversation",
    section: "04",
    title: "the conversation",
    body: "a private thread — no audience, no likes on messages.\njust two people present with each other.",
    cta: "next",
    targetTestID: "walkthrough-conversations-tab",
    tooltipPosition: "above",
  },
];

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const OVERLAY_COLOR = "rgba(12, 12, 10, 0.82)";
const SPOTLIGHT_PADDING = 10;
const SPOTLIGHT_RADIUS = 16;
const CARD_RADIUS = 14;
const TOOLTIP_H_MARGIN = 20;
const TOOLTIP_GAP = 16;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function OnboardingWalkthrough({
  visible,
  onComplete,
  targetRefs,
}: OnboardingWalkthroughProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);

  // Animation values
  const overlayOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(20);
  const completionScale = useSharedValue(0.92);

  const step = STEPS[currentStep];

  /* ---- Measure spotlight target ---- */
  const measureTarget = useCallback(
    (testID: string | null) => {
      if (!testID) {
        setSpotlightRect(null);
        return;
      }
      const ref = targetRefs[testID];
      if (!ref?.current) {
        setSpotlightRect(null);
        return;
      }
      ref.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setSpotlightRect({
            x: x - SPOTLIGHT_PADDING,
            y: y - SPOTLIGHT_PADDING,
            width: width + SPOTLIGHT_PADDING * 2,
            height: height + SPOTLIGHT_PADDING * 2,
          });
        } else {
          setSpotlightRect(null);
        }
      });
    },
    [targetRefs]
  );

  /* ---- Animate in when step changes ---- */
  useEffect(() => {
    if (!visible) return;

    // Fade out card then back in
    cardOpacity.value = withTiming(0, { duration: 150 }, () => {
      cardTranslateY.value = 20;
      cardOpacity.value = withDelay(
        100,
        withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
      );
      cardTranslateY.value = withDelay(
        100,
        withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) })
      );
    });

    // Measure after layout settles
    const timer = setTimeout(() => {
      measureTarget(STEPS[currentStep]?.targetTestID ?? null);
    }, 200);

    return () => clearTimeout(timer);
  }, [currentStep, visible]);

  /* ---- Initial appearance ---- */
  useEffect(() => {
    if (visible) {
      setCurrentStep(0);
      setShowCompletion(false);
      // Fade in whole overlay
      overlayOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
      // Then card
      cardOpacity.value = 0;
      cardTranslateY.value = 20;
      setTimeout(() => {
        cardOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
        cardTranslateY.value = withTiming(0, {
          duration: 400,
          easing: Easing.out(Easing.cubic),
        });
      }, 300);
    }
  }, [visible]);

  /* ---- Handlers ---- */
  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      setShowCompletion(true);
      completionScale.value = 0.92;
      completionScale.value = withTiming(1, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });
      cardOpacity.value = withTiming(1, { duration: 400 });
      cardTranslateY.value = withTiming(0, { duration: 400 });
    }
  }, [currentStep]);

  const handleDismiss = useCallback(() => {
    cardOpacity.value = withTiming(0, { duration: 200 });
    overlayOpacity.value = withTiming(0, { duration: 350 }, () => {
      runOnJS(onComplete)();
    });
  }, [onComplete]);

  const handleSkip = useCallback(() => {
    handleDismiss();
  }, [handleDismiss]);

  const handleReplay = useCallback(() => {
    setShowCompletion(false);
    setCurrentStep(0);
    cardOpacity.value = 0;
    cardTranslateY.value = 20;
    setTimeout(() => {
      cardOpacity.value = withTiming(1, { duration: 400 });
      cardTranslateY.value = withTiming(0, { duration: 400 });
    }, 200);
  }, []);

  /* ---- Animated styles ---- */
  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const completionAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: completionScale.value }],
  }));

  if (!visible) return null;

  const isFullScreen = !step?.targetTestID || !spotlightRect;
  const showDots = currentStep > 0 && !showCompletion;

  /* ---- Tooltip position calculation ---- */
  const getTooltipStyle = () => {
    if (showCompletion || isFullScreen) {
      return {
        position: "absolute" as const,
        left: TOOLTIP_H_MARGIN,
        right: TOOLTIP_H_MARGIN,
        top: screenHeight * 0.38,
      };
    }

    const tooltipPos = step?.tooltipPosition ?? "below";

    if (tooltipPos === "below") {
      const top = (spotlightRect?.y ?? 0) + (spotlightRect?.height ?? 0) + TOOLTIP_GAP;
      return {
        position: "absolute" as const,
        left: TOOLTIP_H_MARGIN,
        right: TOOLTIP_H_MARGIN,
        top: Math.min(top, screenHeight - 280),
      };
    }

    if (tooltipPos === "above") {
      const bottom = screenHeight - (spotlightRect?.y ?? screenHeight) + TOOLTIP_GAP;
      return {
        position: "absolute" as const,
        left: TOOLTIP_H_MARGIN,
        right: TOOLTIP_H_MARGIN,
        bottom: Math.max(bottom, insets.bottom + 20),
      };
    }

    // center
    return {
      position: "absolute" as const,
      left: TOOLTIP_H_MARGIN,
      right: TOOLTIP_H_MARGIN,
      top: screenHeight * 0.38,
    };
  };

  /* ---- Render ---- */
  return (
    <Animated.View style={[StyleSheet.absoluteFill, overlayAnimatedStyle]} pointerEvents="box-none">
      {/* Dim overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {spotlightRect && !isFullScreen && !showCompletion ? (
          <>
            {/* Top */}
            <View
              style={[
                styles.overlayBlock,
                { top: 0, left: 0, right: 0, height: spotlightRect.y },
              ]}
            />
            {/* Bottom */}
            <View
              style={[
                styles.overlayBlock,
                {
                  top: spotlightRect.y + spotlightRect.height,
                  left: 0,
                  right: 0,
                  bottom: 0,
                },
              ]}
            />
            {/* Left */}
            <View
              style={[
                styles.overlayBlock,
                {
                  top: spotlightRect.y,
                  left: 0,
                  width: spotlightRect.x,
                  height: spotlightRect.height,
                },
              ]}
            />
            {/* Right */}
            <View
              style={[
                styles.overlayBlock,
                {
                  top: spotlightRect.y,
                  left: spotlightRect.x + spotlightRect.width,
                  right: 0,
                  height: spotlightRect.height,
                },
              ]}
            />
            {/* Spotlight border glow */}
            <View
              style={[
                styles.spotlightBorder,
                {
                  top: spotlightRect.y,
                  left: spotlightRect.x,
                  width: spotlightRect.width,
                  height: spotlightRect.height,
                  borderRadius: SPOTLIGHT_RADIUS,
                },
              ]}
            />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.overlayBlock]} />
        )}
      </View>

      {/* Tooltip card */}
      {!showCompletion && step && (
        <Animated.View style={[styles.tooltipCard, getTooltipStyle(), cardAnimatedStyle]}>
          {/* Skip link — shown from step 2 onward */}
          {currentStep > 0 && (
            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>skip</Text>
            </TouchableOpacity>
          )}

          {/* Brand lockup on welcome screen */}
          {currentStep === 0 && (
            <View style={styles.welcomeLogo}>
              <BrandLockup size="md" />
            </View>
          )}

          {/* Section number */}
          {step.section && <Text style={styles.sectionNumber}>{step.section}</Text>}

          <Text style={styles.tooltipTitle}>{step.title}</Text>
          <Text style={styles.tooltipBody}>{step.body}</Text>

          {/* Step dots */}
          {showDots && (
            <View style={styles.dotsRow}>
              {STEPS.map((s, i) => (
                <View
                  key={s.id}
                  style={[styles.stepDot, i === currentStep && styles.stepDotActive]}
                />
              ))}
            </View>
          )}

          {/* CTA button */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>{step.cta}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Completion screen */}
      {showCompletion && (
        <Animated.View
          style={[
            styles.tooltipCard,
            styles.completionCard,
            {
              position: "absolute",
              left: TOOLTIP_H_MARGIN,
              right: TOOLTIP_H_MARGIN,
              top: screenHeight * 0.32,
            },
            completionAnimatedStyle,
          ]}
        >
          <BrandLockup size="md" style={styles.completionLogo} />

          <Text style={styles.completionTitle}>you're ready.</Text>
          <Text style={styles.completionBody}>
            share a thought. see what resonates.{"\n"}the rest will follow.
          </Text>

          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleDismiss}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>begin</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleReplay} style={styles.replayButton}>
            <Text style={styles.replayText}>replay walkthrough</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  overlayBlock: {
    position: "absolute",
    backgroundColor: OVERLAY_COLOR,
  },
  spotlightBorder: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(245, 240, 232, 0.2)",
  },

  tooltipCard: {
    backgroundColor: colors.CARD_GROUND,
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    shadowColor: colors.PANEL_DEEP,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },

  welcomeLogo: {
    marginBottom: 20,
  },

  sectionNumber: {
    fontFamily: fontFamily.comico,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.TYPE_MUTED,
    marginBottom: 8,
  },

  skipButton: {
    position: "absolute",
    top: 16,
    right: 20,
    padding: 4,
  },
  skipText: {
    fontFamily: fontFamily.sentient,
    fontSize: 13,
    color: colors.TYPE_MUTED,
    letterSpacing: 0.2,
  },

  tooltipTitle: {
    fontFamily: fontFamily.comico,
    fontSize: 20,
    lineHeight: 26,
    color: colors.TYPE_DARK,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  tooltipBody: {
    fontFamily: fontFamily.sentient,
    fontSize: 14,
    lineHeight: 21,
    color: colors.TYPE_DARK,
    opacity: 0.68,
    marginBottom: 24,
    letterSpacing: 0.1,
  },

  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(26, 26, 24, 0.15)",
  },
  stepDotActive: {
    width: 18,
    borderRadius: 9,
    backgroundColor: colors.TYPE_DARK,
  },

  ctaButton: {
    backgroundColor: colors.TYPE_DARK,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 28,
    alignItems: "center",
  },
  ctaText: {
    fontFamily: fontFamily.comico,
    fontSize: 14,
    color: colors.TYPE_WHITE,
    letterSpacing: 0.3,
  },

  completionCard: {
    alignItems: "center",
  },
  completionLogo: {
    marginBottom: 24,
  },
  completionTitle: {
    fontFamily: fontFamily.comico,
    fontSize: 28,
    lineHeight: 34,
    color: colors.TYPE_DARK,
    marginBottom: 12,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  completionBody: {
    fontFamily: fontFamily.sentient,
    fontSize: 15,
    lineHeight: 23,
    color: colors.TYPE_DARK,
    opacity: 0.68,
    marginBottom: 28,
    textAlign: "center",
    letterSpacing: 0.1,
  },

  replayButton: {
    marginTop: 16,
    padding: 8,
  },
  replayText: {
    fontFamily: fontFamily.sentient,
    fontSize: 13,
    color: colors.TYPE_MUTED,
    letterSpacing: 0.2,
    textDecorationLine: "underline",
    textDecorationColor: colors.TYPE_MUTED,
  },
});
