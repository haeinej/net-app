/**
 * Two runtime type families only: Comico for display and Sentient for reading.
 */
export const fontFamily = {
  /** Reading text: thought sentence, context, replies. */
  sentient: "Sentient-Light",
  /** Display / structural face. */
  comico: "Comico-Regular",
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
  /** Names, labels — Comico */
  label: {
    fontFamily: fontFamily.comico,
    fontSize: 7.5,
    fontWeight: "500" as const,
    letterSpacing: 1.2,
  },
  /** Card metadata — Comico */
  metadata: {
    fontFamily: fontFamily.comico,
    fontSize: 7,
    fontWeight: "400" as const,
    letterSpacing: 0.8,
  },
  /** Logo — Comico */
  logo: {
    fontFamily: fontFamily.comico,
    fontSize: 18,
    fontWeight: "400" as const,
  },
} as const;
