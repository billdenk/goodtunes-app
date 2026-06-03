import { MiniPlayer } from "@/components/MiniPlayer";
import { BottomNav, NAV_CLEARANCE, DOCK_BOTTOM } from "@/components/BottomNav";

// Task #1092 — single mount point for the customer-shell bottom chrome.
// Each child self-gates by shell:
//   * MiniPlayer renders ONLY on the lg+ web desktop shell (bottom-right
//     now-playing capsule beside the StorefrontSidebar).
//   * BottomNav renders the unified bottom console on mobile/tablet/native
//     (now-playing + progress + Collection · Playlists · Recents · Search).
// Pages render <MobileChrome /> instead of the old <MiniPlayer /> +
// <BottomNav /> pair so there's one place to reason about bottom chrome.
export function MobileChrome() {
  return (
    <>
      <MiniPlayer />
      <BottomNav />
    </>
  );
}

// Re-exported so callers that reserve bottom scroll-gutter / mirror the dock
// geometry can import from the single chrome entry point.
export { NAV_CLEARANCE, DOCK_BOTTOM };
