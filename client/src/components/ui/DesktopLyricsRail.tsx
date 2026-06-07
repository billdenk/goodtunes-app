import { useState } from "react";
import { useLocation } from "wouter";
import { Maximize2 } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import {
  useDesktopShell,
  RAIL_INSET,
  LYRICS_RAIL_WIDTH,
} from "@/hooks/useDesktopShell";
import { shouldRenderStorefrontSidebar } from "@/components/StorefrontSidebar";
import { DesktopLyricsBody } from "@/components/ui/DesktopLyricsBody";
import { DesktopQueueBody } from "@/components/ui/DesktopQueueBody";

/**
 * Persistent desktop lyrics rail — the storefront/library/artist counterpart
 * to the album page's in-flow lyrics panel.
 *
 * Renders a fixed, near-full-height panel anchored FLUSH to the right and
 * bottom window edges (Apple-style edge treatment rather than a floating,
 * fully-rounded inset card — Task #1571), on ANY fan route the storefront
 * sidebar covers, so the karaoke rail stays open as the fan navigates between
 * Home, Search, Collection, Artist, etc. The open/closed state is the global
 * `PlayerContext.showLyrics` flag (toggled by the dock's lyrics button), so
 * it persists across navigation for free. The album page keeps its own
 * in-flow panel (which reflows the album column); both render the SAME
 * shared `DesktopLyricsBody`.
 *
 * No backdrop-filter: the rail is a near-opaque solid panel so it never
 * stacks a second blur over the left sidebar's blur (iOS WebKit hazard) and
 * page content can't bleed through behind it.
 *
 * Hovering the rail (pointer devices) — or a single tap (touch) — reveals an
 * expand affordance whose click opens the full-screen immersive player, the
 * exact same action as the dock thumbnail's expand control.
 */

/** Which body the shared storefront rail is showing, or null when closed.
 *  Lyrics and the Up Next queue share the single rail and are mutually
 *  exclusive (PlayerContext.toggleRail enforces it). */
export function useRailMode(): "lyrics" | "queue" | null {
  const isDesktop = useDesktopShell();
  const { showLyrics, showQueue, currentSong } = usePlayer();
  const [location] = useLocation();
  if (
    !isDesktop ||
    !currentSong ||
    !shouldRenderStorefrontSidebar(location)
  ) {
    return null;
  }
  if (showLyrics) return "lyrics";
  if (showQueue) return "queue";
  return null;
}

/** True when the persistent storefront rail (lyrics OR Up Next) is showing.
 *  Shared with FanScreen / ArtistDetail (content reflow) and the dock
 *  (channel) so every reflow + the dock's right channel track both modes. */
export function useLyricsRailOpen(): boolean {
  return useRailMode() !== null;
}

export function DesktopLyricsRail() {
  const mode = useRailMode();
  const open = mode !== null;
  const { setShowPlayer } = usePlayer();
  // Expand affordance reveal — mirrors the dock thumbnail's pointer-vs-touch
  // pattern: pointer devices reveal on hover (CSS group-hover), touch devices
  // reveal on the first tap anywhere in the rail.
  const [canHover] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover)").matches,
  );
  const [revealed, setRevealed] = useState(false);

  if (!open) return null;

  return (
    <aside
      className="group/lyrics fixed z-30 flex flex-col overflow-hidden"
      onClick={!canHover ? () => setRevealed(true) : undefined}
      style={{
        // Flush to the right + bottom window edges. `top` keeps the small
        // RAIL_INSET gap so the rail's top aligns with the left sidebar's
        // top; right/bottom run to the window edges (no outer inset). The
        // panel background reaches the bottom edge; the inner content honors
        // env(safe-area-inset-bottom) below so lyrics never sit under the
        // iPad/Capacitor home indicator.
        top: RAIL_INSET,
        right: 0,
        bottom: 0,
        width: LYRICS_RAIL_WIDTH,
        background: "rgba(10, 14, 42, 0.97)",
        // Round only the interior (top-left) corner; the right + bottom edges
        // butt against the window so they stay square (Apple panel look).
        borderTopLeftRadius: 16,
        borderTop: "1px solid rgba(255,255,255,0.08)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        // Soft inward shadow toward the content (no heavy floating-card drop).
        boxShadow: "-12px 0 40px rgba(0,0,0,0.28)",
      }}
      aria-label={mode === "queue" ? "Up Next" : "Lyrics"}
      data-testid={mode === "queue" ? "queue-rail" : "lyrics-rail"}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowPlayer(true);
          setRevealed(false);
        }}
        aria-label="Expand to full-screen player"
        className={[
          "absolute top-3 right-3 z-10 w-11 h-11 rounded-full flex items-center justify-center transition-opacity duration-150",
          canHover
            ? "opacity-0 group-hover/lyrics:opacity-100"
            : revealed
              ? "opacity-100"
              : "opacity-0 pointer-events-none",
        ].join(" ")}
        style={{ background: "rgba(0,0,0,0.45)" }}
        data-testid="button-expand-lyrics"
      >
        <Maximize2 className="w-4 h-4 text-white" />
        <span className="sr-only">Expand</span>
      </button>
      <div
        className="flex-1 min-h-0 flex flex-col py-6 px-2"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }}
      >
        {mode === "queue" ? <DesktopQueueBody /> : <DesktopLyricsBody />}
      </div>
    </aside>
  );
}
