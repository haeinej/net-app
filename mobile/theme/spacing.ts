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
  cardRadius: 8,
  /** Left edge warmth bar width */
  warmthBarWidth: 2,
  /** Profile photo size on card */
  profilePhotoSize: 24,
  /** Notification dot diameter */
  notificationDotSize: 20,
} as const;

/** Image aspect ratio for thought card (4:3) */
export const IMAGE_ASPECT_RATIO = 4 / 3;
