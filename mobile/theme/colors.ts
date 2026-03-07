/**
 * net. colour palette. Never use pure black (#000000).
 * Orange (#C4622D) — 5 uses only: edge bar full warmth, reply label, notification, post button, logo period.
 */
export const colors = {
  WARM_GROUND: "#F5F0EA",
  CARD_GROUND: "#EDE8E2",
  ACCENT_ORANGE: "#C4622D",
  PANEL_DARK: "#0C0C0A",
  PANEL_DEEP: "#080604",
  TYPE_WHITE: "#FFFFFF",
  TYPE_DARK: "#1A1A18",
  TYPE_MUTED: "#9A9A98",
} as const;

export type ColorKey = keyof typeof colors;
