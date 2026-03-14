import { Platform } from "react-native";

/**
 * Layout constants for ohm. feed and cards.
 */
export const spacing = {
  /** Horizontal padding each side of feed; card width = screen - 2 * this */
  screenPadding: 16,
  /** Gap between thought cards */
  cardGap: 12,
  /** Padding below header on Screen 1 */
  belowHeader: 12,
  /** Thought card corner radius */
  cardRadius: 14,
  /** Left edge warmth bar width */
  warmthBarWidth: 4,
  /** Profile photo size on card */
  profilePhotoSize: 24,
  /** Notification dot diameter */
  notificationDotSize: 20,
  /** Compact card total height (3 cards visible) */
  compactCardHeight: 190,
  /** Compact card footer height */
  compactFooterHeight: 40,
  /** Compact card avatar size */
  compactAvatarSize: 28,
} as const;

/** Image aspect ratio for thought card (4:3) */
export const IMAGE_ASPECT_RATIO = 4 / 3;

// ─────────────────────────────────────────────
// Glass / Depth system — stereoscopic, organic feel
// Inspired by the ohm logo: clay-glass with refracted light
// ─────────────────────────────────────────────

/** Layered shadow system: ambient + key light + contact shadow */
export const shadows = {
  /** Card at rest in feed — no shadow, flat */
  card: Platform.select({
    ios: {},
    android: { elevation: 0 },
  }),
  /** Card at rest — no ambient shadow */
  cardAmbient: Platform.select({
    ios: {},
    android: { elevation: 0 },
  }),
  /** Raised element (buttons, notification dot) — soft organic lift */
  raised: Platform.select({
    ios: {
      shadowColor: "#0A0A08",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
    },
    android: { elevation: 4 },
  }),
  /** Subtle inner edge highlight — used as border */
  innerGlow: {
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.12)",
  },
  /** Organic glass rim — soft top-left light catch for buttons/controls */
  glassRimTop: {
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.18)",
    borderLeftColor: "rgba(255,255,255,0.10)",
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderRightColor: "transparent",
    borderBottomColor: "transparent",
  },
  /** Glass rim for dark panels — very soft catch */
  glassRimDark: {
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.10)",
    borderLeftColor: "rgba(255,255,255,0.06)",
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderRightColor: "transparent",
    borderBottomColor: "transparent",
  },
} as const;

/** Glass overlay colors for inner depth effects */
export const glass = {
  /** Soft white highlight for top edge */
  highlightTop: "rgba(255,255,255,0.08)",
  /** Subtle dark shadow for bottom edge */
  shadowBottom: "rgba(26,26,22,0.06)",
  /** Inner card gradient — warm light from top-left */
  warmLight: ["rgba(255,252,245,0.06)", "rgba(255,252,245,0.0)"] as const,
  /** Dark panel inner glow — organic softness */
  darkGlow: ["rgba(255,255,255,0.06)", "rgba(255,255,255,0.0)"] as const,
  /** Button pressed state overlay */
  pressedOverlay: "rgba(0,0,0,0.08)",
} as const;
