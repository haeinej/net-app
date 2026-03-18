import { useWindowDimensions, type ViewStyle } from "react-native";
import { spacing } from "../theme";

/** Breakpoints (width in points) */
const TABLET_MIN = 600;
const DESKTOP_MIN = 1024;

/** Maximum content width on wider screens so the UI doesn't stretch edge-to-edge */
const MAX_CONTENT_WIDTH = 540;

export interface ResponsiveLayout {
  /** True when the window is tablet-width or wider */
  isTablet: boolean;
  /** True when the window is desktop-width or wider */
  isDesktop: boolean;
  /** The usable content width — capped on wider screens */
  contentWidth: number;
  /** Style object that centers and caps the main content column */
  containerStyle: ViewStyle;
  /** Current window width */
  windowWidth: number;
  /** Current window height */
  windowHeight: number;
}

/**
 * Returns layout helpers that adapt to the current window size.
 * On phones the content fills the screen; on tablets and larger the
 * content is centred in a capped-width column so the UI stays
 * comfortable and readable per Apple Guideline 4.
 */
export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();

  const isTablet = width >= TABLET_MIN;
  const isDesktop = width >= DESKTOP_MIN;

  const availableWidth = width - spacing.screenPadding * 2;
  const contentWidth = isTablet
    ? Math.min(availableWidth, MAX_CONTENT_WIDTH)
    : availableWidth;

  const containerStyle: ViewStyle = isTablet
    ? {
        maxWidth: MAX_CONTENT_WIDTH,
        alignSelf: "center",
        width: "100%",
      }
    : {};

  return {
    isTablet,
    isDesktop,
    contentWidth,
    containerStyle,
    windowWidth: width,
    windowHeight: height,
  };
}
