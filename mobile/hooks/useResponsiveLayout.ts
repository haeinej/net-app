import { useWindowDimensions } from "react-native";

/**
 * Max content width on tablet-sized screens.
 * Keeps the phone-optimised layout comfortable on iPad without
 * stretching cards across the full 1024+ px width.
 */
const TABLET_BREAKPOINT = 600;
const MAX_CONTENT_WIDTH = 540;

/**
 * Provides responsive layout values that adapt to phone vs tablet screens.
 *
 * On phone-sized screens (<600 px), returns full-width behaviour.
 * On tablet-sized screens (>=600 px), constrains content to a centred column.
 */
export function useResponsiveLayout() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isTablet = screenWidth >= TABLET_BREAKPOINT;
  const contentWidth = isTablet
    ? Math.min(MAX_CONTENT_WIDTH, screenWidth - 48)
    : screenWidth;
  const contentPadding = isTablet
    ? Math.max(24, (screenWidth - contentWidth) / 2)
    : 16;

  return {
    screenWidth,
    screenHeight,
    isTablet,
    /** The max width content should occupy. */
    contentWidth,
    /** Horizontal padding to center content. */
    contentPadding,
    /** Style to apply to a container to constrain and center content. */
    containerStyle: isTablet
      ? ({
          maxWidth: MAX_CONTENT_WIDTH,
          alignSelf: "center" as const,
          width: "100%" as const,
        } as const)
      : undefined,
  };
}
