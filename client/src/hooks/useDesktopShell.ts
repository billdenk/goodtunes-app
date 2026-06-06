import { useMediaQuery } from "@/hooks/useMediaQuery";
import { isNative } from "@/lib/platform";

/**
 * True when the customer storefront should render its desktop chrome
 * (fixed left sidebar instead of the floating bottom-nav pill, wider
 * content area, multi-column grids).
 *
 * Web only — Capacitor-wrapped iOS/Android always stay on the mobile
 * shell regardless of viewport width (task #547: "iOS native still
 * uses the mobile layout").
 *
 * Threshold matches Tailwind's `lg` breakpoint (1024px). Tablet
 * (768–1023) keeps the bottom-nav pill but pages widen their content
 * container + reflow grids to a multi-column rhythm.
 */
export function useDesktopShell(): boolean {
  const lg = useMediaQuery("(min-width: 1024px)");
  return lg && !isNative;
}

/**
 * Tablet+ (≥768px). Pages can use this to widen the mobile-first
 * `max-w-[390px]` container into a 2- or 3-column rhythm without
 * crossing into the desktop sidebar layout.
 */
export function useTabletShell(): boolean {
  const md = useMediaQuery("(min-width: 768px)");
  return md && !isNative;
}

/** Width of the desktop sidebar (px). Pages offset their content by
 * this much when the sidebar is mounted. */
export const STOREFRONT_SIDEBAR_WIDTH = 260;

/** Gap between the window edge and the floating rail card (px). */
export const RAIL_INSET = 12;

/** Gap between the rail card's right edge and the main content (px). */
export const RAIL_GAP = 12;

/**
 * Total left padding that content pages apply so their content starts
 * flush to the right of the floating rail card:
 *   RAIL_INSET (12) + STOREFRONT_SIDEBAR_WIDTH (260) + RAIL_GAP (12) = 284
 */
export const STOREFRONT_CONTENT_OFFSET =
  RAIL_INSET + STOREFRONT_SIDEBAR_WIDTH + RAIL_GAP;
