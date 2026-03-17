/**
 * ohm. colour palette. Never use pure black (#000000).
 * Vermillion (#EB4101) — 5 uses only: edge bar full warmth, reply label,
 * notification, post button, logo period.
 */
export const colors = {
  WARM_GROUND: "#F5F0EA",
  CARD_GROUND: "#EDE8E2",
  CARD_BORDER: "rgba(26, 26, 22, 0.08)",
  VERMILLION: "#EB4101",
  OLIVE: "#979C5B",
  CHARTREUSE: "#D0D37C",
  PANEL_DARK: "#0C0C0A",
  PANEL_DEEP: "#080604",
  TYPE_WHITE: "#FFFFFF",
  TYPE_DARK: "#1A1A16",
  TYPE_MUTED: "#9A9A98",
} as const;

export type ColorKey = keyof typeof colors;
