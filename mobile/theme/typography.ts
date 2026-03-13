/**
 * Two runtime type families only: Comico for display and Sentient for reading.
 */
export const fontFamily = {
  /** Reading text: thought sentence, context, replies. */
  sentient: "Sentient-Light",
  /** Bold reading text: sentence overlay on cards. */
  sentientBold: "Sentient-Bold",
  /** Display / structural face. */
  comico: "Comico-Regular",
  /** Fallback when custom fonts not loaded. */
  fallback: "System",
} as const;

export const typography = {
  /** Thought sentence on image surfaces — Comico */
  thoughtDisplay: {
    fontFamily: fontFamily.comico,
    fontSize: 12.5,
    letterSpacing: 0.2,
    lineHeight: 15,
  },
  /** Thought sentence in reading contexts — Sentient Light 12–13px */
  thoughtSentence: {
    fontFamily: fontFamily.sentient,
    fontSize: 12.5,
  },
  /** Thought sentence bold — Sentient Bold */
  thoughtSentenceBold: {
    fontFamily: fontFamily.sentientBold,
    fontSize: 12.5,
  },
  /** Context on Panel 2 — Sentient Light 9–10px, muted */
  context: {
    fontFamily: fontFamily.sentient,
    fontSize: 9.5,
  },
  /** Reply input on Panel 3 — Sentient Light 11–12px */
  replyInput: {
    fontFamily: fontFamily.sentient,
    fontSize: 11.5,
  },
  /** Names, labels — Comico */
  label: {
    fontFamily: fontFamily.comico,
    fontSize: 7.5,
    letterSpacing: 1.2,
  },
  /** Card metadata — Comico */
  metadata: {
    fontFamily: fontFamily.comico,
    fontSize: 7,
    letterSpacing: 0.8,
  },
  /** Logo — Comico */
  logo: {
    fontFamily: fontFamily.comico,
    fontSize: 18,
  },
} as const;
