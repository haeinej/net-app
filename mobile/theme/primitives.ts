import { StyleSheet } from "react-native";
import { colors } from "./colors";
import { fontFamily, typography } from "./typography";
import { spacing, shadows } from "./spacing";

/**
 * Shared style primitives — reusable patterns that keep
 * every surface coherent. Import these instead of writing
 * one-off input / button / card styles in each screen.
 */

// ─── Radii ──────────────────────────────────────────────────
export const radii = {
  /** Cards, panels, text areas. */
  card: spacing.cardRadius,         // 14
  /** Standard inputs. */
  input: 10,
  /** Pill buttons, tags. */
  pill: 999,
  /** Primary action buttons. */
  button: 12,
} as const;

// ─── Opacity ────────────────────────────────────────────────
export const opacity = {
  disabled: 0.5,
  dormant: 0.55,
  muted: 0.4,
  /** Glass button on dark surfaces. */
  glassBg: 0.08,
  /** Subtle borders on light surfaces. */
  borderLight: 0.08,
  /** Subtle borders on dark surfaces. */
  borderDark: 0.15,
} as const;

// ─── Shared StyleSheet ──────────────────────────────────────
export const primitives = StyleSheet.create({
  // ── Inputs ──
  input: {
    fontFamily: fontFamily.comico,
    fontSize: 14,
    letterSpacing: 0.4,
    color: colors.TYPE_DARK,
    backgroundColor: colors.CARD_GROUND,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: "transparent",
  },
  inputFocused: {
    borderColor: colors.CARD_BORDER,
  },
  /** Reading-weight input — interests, replies. */
  inputReading: {
    fontFamily: fontFamily.sentient,
    fontSize: 16,
    lineHeight: 22,
    color: colors.TYPE_DARK,
    backgroundColor: colors.CARD_GROUND,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: radii.input,
  },
  /** Multi-line text area. */
  textArea: {
    backgroundColor: colors.CARD_GROUND,
    borderRadius: radii.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  /** Dark surface input (Me screen edit). */
  inputDark: {
    fontFamily: fontFamily.sentient,
    fontSize: 15,
    color: colors.WARM_GROUND,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: `rgba(245,240,234,${opacity.borderDark})`,
    borderRadius: radii.pill,
  },

  // ── Buttons ──
  /** Primary action — OLIVE / VERMILLION background. */
  buttonPrimary: {
    paddingVertical: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: radii.button,
    minHeight: 48,
  },
  buttonPrimaryText: {
    ...typography.buttonText,
    color: colors.TYPE_WHITE,
  },
  /** Glass pill — used on dark surfaces (Me screen). */
  buttonGlass: {
    backgroundColor: `rgba(245,240,234,${opacity.glassBg})`,
    borderRadius: radii.pill,
    paddingVertical: 11,
    paddingHorizontal: 24,
    ...shadows.raised,
  },
  buttonGlassText: {
    fontFamily: fontFamily.comico,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    color: `rgba(245,240,234,0.45)`,
  },
  /** Pill button on light surface — photo actions, tags. */
  buttonPill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.CARD_GROUND,
  },
  buttonPillText: {
    ...typography.label,
    color: colors.TYPE_DARK,
  },
  buttonDisabled: {
    opacity: opacity.disabled,
  },

  // ── Links ──
  link: {
    ...typography.labelLg,
    color: colors.TYPE_MUTED,
    textDecorationLine: "underline" as const,
  },
  linkSubtle: {
    ...typography.label,
    color: colors.TYPE_MUTED,
  },

  // ── Layout helpers ──
  /** Standard field block with label + input. */
  fieldBlock: {
    marginBottom: 16,
  },
  fieldLabel: {
    ...typography.labelLg,
    color: colors.TYPE_MUTED,
    marginBottom: 6,
    textTransform: "uppercase" as const,
  },
  /** Centered empty / error state. */
  centered: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  /** Screen-level horizontal padding. */
  screenPad: {
    paddingHorizontal: spacing.screenPadding,
  },

  // ── Error text ──
  errorText: {
    ...typography.labelLg,
    color: colors.OLIVE,
    marginBottom: 12,
  },
});
