/**
 * Two runtime type families only: Comico for display and Sentient for reading.
 */
export const fontFamily = {
  /** Reading text: thought sentence, context, replies. */
  sentient: "Sentient-Medium",
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
    fontSize: 15,
    letterSpacing: 0.2,
    lineHeight: 18,
  },
  /** Thought sentence in reading contexts — Sentient Medium */
  thoughtSentence: {
    fontFamily: fontFamily.sentient,
    fontSize: 16,
  },
  /** Thought sentence bold — Sentient Bold */
  thoughtSentenceBold: {
    fontFamily: fontFamily.sentientBold,
    fontSize: 16,
  },
  /** Context on Panel 2 — Sentient Medium */
  context: {
    fontFamily: fontFamily.sentient,
    fontSize: 13,
  },
  /** Reply input on Panel 3 — Sentient Medium */
  replyInput: {
    fontFamily: fontFamily.sentient,
    fontSize: 16,
  },
  /** Names, labels — Comico */
  label: {
    fontFamily: fontFamily.comico,
    fontSize: 10.5,
    letterSpacing: 1.2,
  },
  /** Card metadata — Comico */
  metadata: {
    fontFamily: fontFamily.comico,
    fontSize: 9.5,
    letterSpacing: 0.8,
  },
  /** Logo — Comico */
  logo: {
    fontFamily: fontFamily.comico,
    fontSize: 22,
  },
} as const;
