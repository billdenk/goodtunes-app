import { useLocation } from "wouter";
import { usePlayer } from "@/context/PlayerContext";
import {
  useDesktopShell,
  RAIL_INSET,
  LYRICS_RAIL_WIDTH,
} from "@/hooks/useDesktopShell";
import { shouldRenderStorefrontSidebar } from "@/components/StorefrontSidebar";
import { DesktopLyricsBody } from "@/components/ui/DesktopLyricsBody";

/**
 * Persistent desktop lyrics rail — the storefront/library/artist counterpart
 * to the album page's in-flow lyrics panel.
 *
 * Renders a fixed, full-height card pinned to the right edge (mirroring the
 * left StorefrontSidebar's geometry) on ANY fan route the storefront sidebar
 * covers, so the karaoke rail stays open as the fan navigates between Home,
 * Search, Collection, Artist, etc. The open/closed state is the global
 * `PlayerContext.showLyrics` flag (toggled by the dock's lyrics button), so
 * it persists across navigation for free. The album page keeps its own
 * in-flow panel (which reflows the album column); both render the SAME
 * shared `DesktopLyricsBody`.
 *
 * No backdrop-filter: the rail is a near-opaque solid panel so it never
 * stacks a second blur over the left sidebar's blur (iOS WebKit hazard) and
 * page content can't bleed through behind it.
 */

/** True when the persistent storefront lyrics rail should be showing. Shared
 *  with FanScreen / ArtistDetail (content reflow) and the dock (channel). */
export function useLyricsRailOpen(): boolean {
  const isDesktop = useDesktopShell();
  const { showLyrics, currentSong } = usePlayer();
  const [location] = useLocation();
  return (
    isDesktop &&
    showLyrics &&
    !!currentSong &&
    shouldRenderStorefrontSidebar(location)
  );
}

export function DesktopLyricsRail() {
  const open = useLyricsRailOpen();
  if (!open) return null;

  return (
    <aside
      className="fixed z-30 flex flex-col overflow-hidden"
      style={{
        top: RAIL_INSET,
        right: RAIL_INSET,
        // Full height — matches the left rail's geometry so the two rails read
        // as a matched pair (Task #1523). `100dvh` tracks the visible viewport
        // on iPad Safari; the bottom gap honors the device safe-area inside
        // the Capacitor webview while falling back to RAIL_INSET on the web.
        height: `calc(100dvh - ${RAIL_INSET}px - max(${RAIL_INSET}px, env(safe-area-inset-bottom, 0px)))`,
        width: LYRICS_RAIL_WIDTH,
        background: "rgba(10, 14, 42, 0.97)",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.32)",
      }}
      aria-label="Lyrics"
      data-testid="lyrics-rail"
    >
      <div className="flex-1 min-h-0 flex flex-col py-6 px-2">
        <DesktopLyricsBody />
      </div>
    </aside>
  );
}
