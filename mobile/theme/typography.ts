/**
 * Two runtime type families only: Comico for display and Sentient for reading.
 *
 * Semantic scale — every text style in the app derives from one of these.
 * Font sizes follow a deliberate progression:
 *   8.5 → 9.5 → 10.5 → 12 → 13 → 14 → 16 → 22 → 24 → 28 → 32
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

// ─── Semantic typography tokens ─────────────────────────────

export const typography = {
  // ── Display / headings (Comico) ──

  /** Screen titles — Conversations, profile name. */
  heading: {
    fontFamily: fontFamily.comico,
    fontSize: 28,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  /** Profile name on Me screen. */
  headingLg: {
    fontFamily: fontFamily.comico,
    fontSize: 32,
    letterSpacing: -0.5,
    lineHeight: 38,
  },

  // ── Thought display ──

  /** Thought sentence on image surfaces — Sentient Bold */
  thoughtDisplay: {
    fontFamily: fontFamily.sentientBold,
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.3,
  },
  /** Compact card sentence overlay — Sentient Bold, smaller */
  thoughtDisplayCompact: {
    fontFamily: fontFamily.sentientBold,
    fontSize: 16,
    lineHeight: 19,
    letterSpacing: -0.25,
  },

  // ── Body text (Sentient) ──

  /** Primary body — replies, context reading, interest inputs. */
  body: {
    fontFamily: fontFamily.sentient,
    fontSize: 16,
    lineHeight: 22,
  },
  /** Secondary body — smaller reading text, guides. */
  bodySmall: {
    fontFamily: fontFamily.sentient,
    fontSize: 14,
    lineHeight: 19,
  },
  /** Context on Panel 2 — Sentient Medium. */
  context: {
    fontFamily: fontFamily.sentient,
    fontSize: 13,
    lineHeight: 18,
  },

  // ── UI labels (Comico) ──

  /** Primary labels — names, button text, section headers. */
  label: {
    fontFamily: fontFamily.comico,
    fontSize: 10.5,
    letterSpacing: 1.2,
    lineHeight: 13,
  },
  /** Larger label — field labels, button text. */
  labelLg: {
    fontFamily: fontFamily.comico,
    fontSize: 12,
    letterSpacing: 1.0,
    lineHeight: 15,
  },
  /** Button text — primary actions. */
  buttonText: {
    fontFamily: fontFamily.comico,
    fontSize: 14,
    letterSpacing: 1.2,
    lineHeight: 17,
  },

  // ── Metadata (Comico, smallest) ──

  /** Card metadata — timestamps, captions. */
  metadata: {
    fontFamily: fontFamily.comico,
    fontSize: 9.5,
    letterSpacing: 0.8,
    lineHeight: 12,
  },
  /** Tiny metadata — compact card dates, notification previews. */
  metadataSmall: {
    fontFamily: fontFamily.comico,
    fontSize: 8.5,
    letterSpacing: 0.6,
    lineHeight: 10.5,
  },

  // ── Special ──

  /** Logo — Comico */
  logo: {
    fontFamily: fontFamily.comico,
    fontSize: 22,
    letterSpacing: -0.6,
  },

  // ── Legacy aliases (keep imports working) ──

  /** @deprecated use body */
  thoughtSentence: {
    fontFamily: fontFamily.sentient,
    fontSize: 16,
    lineHeight: 22,
  },
  /** @deprecated use thoughtDisplay */
  thoughtSentenceBold: {
    fontFamily: fontFamily.sentientBold,
    fontSize: 16,
    lineHeight: 19,
  },
  /** @deprecated use body */
  replyInput: {
    fontFamily: fontFamily.sentient,
    fontSize: 16,
    lineHeight: 22,
  },
} as const;
