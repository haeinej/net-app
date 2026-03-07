/**
 * Two typefaces only: General Sans (structural), Sentient (reading).
 * Load via expo-font in root layout; fallback to system when fonts not present.
 */
export const fontFamily = {
  /** Reading text: thought sentence, context, replies. */
  sentient: "Sentient-Light",
  /** Structural: labels, names, logo, nav. */
  generalSans: "GeneralSans-Medium",
  generalSansBold: "GeneralSans-Bold",
  /** Fallback when custom fonts not loaded. */
  fallback: "System",
} as const;

export const typography = {
  /** Thought sentence on Panel 1 — Sentient Light 12–13px, white */
  thoughtSentence: {
    fontFamily: fontFamily.sentient,
    fontSize: 12.5,
    fontWeight: "300" as const,
  },
  /** Context on Panel 2 — Sentient Light 9–10px, muted */
  context: {
    fontFamily: fontFamily.sentient,
    fontSize: 9.5,
    fontWeight: "300" as const,
  },
  /** Reply input on Panel 3 — Sentient Light 11–12px */
  replyInput: {
    fontFamily: fontFamily.sentient,
    fontSize: 11.5,
    fontWeight: "300" as const,
  },
  /** Names, labels — General Sans Medium 7–8px, UPPERCASE, wide tracking */
  label: {
    fontFamily: fontFamily.generalSans,
    fontSize: 7.5,
    fontWeight: "500" as const,
    letterSpacing: 1.2,
  },
  /** Card metadata — General Sans Regular 7px, muted, UPPERCASE */
  metadata: {
    fontFamily: fontFamily.generalSans,
    fontSize: 7,
    fontWeight: "400" as const,
    letterSpacing: 0.8,
  },
  /** Logo — General Sans Bold, ~18px */
  logo: {
    fontFamily: fontFamily.generalSansBold,
    fontSize: 18,
    fontWeight: "700" as const,
  },
} as const;
