import { Easing } from "react-native-reanimated";

/**
 * ohm. Motion System — based on ohm-motion + emil-design-eng principles.
 *
 * Springs > durations. Everything feels physical.
 * Velocity carries over from gestures. Coupled properties.
 * Press feedback on every touchable element.
 */

export const springs = {
  // PRIMARY — cards, modals, sheets, most UI elements
  // Feels like: a firm tap that settles quickly
  snap: { damping: 20, stiffness: 300, mass: 0.8 },

  // GENTLE — page transitions, background elements, ambient motion
  // Feels like: a slow exhale
  gentle: { damping: 25, stiffness: 150, mass: 1 },

  // BOUNCY — success states, playful confirmations, card arrivals
  // Feels like: a ball landing on a cushion (visible overshoot)
  bouncy: { damping: 12, stiffness: 200, mass: 0.6 },

  // STIFF — micro-interactions, toggles, small state changes
  // Feels like: a physical switch clicking
  stiff: { damping: 30, stiffness: 400, mass: 0.5 },

  // HEAVY — dragging, pulling, large elements
  // Feels like: sliding a heavy book across a table
  heavy: { damping: 28, stiffness: 180, mass: 1.5 },

  // CARD — underdamped for swipe physics (metaball overshoot)
  card: { damping: 12, stiffness: 180 },

  // BOTTOM SHEET — firm but with life
  bottomSheet: { damping: 20, stiffness: 180 },
} as const;

export const easings = {
  // Strong ease-out for UI interactions (not the weak default)
  out: Easing.bezier(0.23, 1, 0.32, 1),
  // Strong ease-in-out for on-screen movement
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  // iOS-like drawer curve
  drawer: Easing.bezier(0.32, 0.72, 0, 1),
} as const;

export const durations = {
  // Exit animations are faster than enter (ohm-motion rule 8)
  fast: 150,
  normal: 200,
  slow: 280,
  // Only use for opacity and color transitions
  fadeIn: 250,
  fadeOut: 150,
  skeleton: 1500,
} as const;

export const motion = {
  // Press feedback: every touchable gets this (emil: 0.95-0.98 range)
  buttonActiveScale: 0.97,
  cardScaleOnPress: 0.98,

  // Gallery stagger: 40-60ms per item (ohm-motion rule 6)
  staggerDelay: 50,

  // Card physics
  cardRotationMax: 8,

  // Card stack depth (parallax)
  stackScaleMiddle: 0.95,
  stackScaleBack: 0.9,
  stackOffsetMiddle: 10,
  stackOffsetBack: 20,
} as const;
