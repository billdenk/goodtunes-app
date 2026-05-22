import { useState } from "react";
import { DesktopAlbumView, type DesktopAlbumTab } from "@/components/ui/DesktopAlbumView";
import type { AlbumPreviewAlbum } from "./AlbumPreviewCard";

/**
 * Admin-side preview of the fan-facing desktop album page. Wraps the
 * shared `DesktopAlbumView` primitive at full size, then transforms it
 * down to fit the AdminFrame preview column (~440px wide). The result
 * is a true scaled-down view of what fans see at ≥1024px — instead of
 * a hand-built mock that can drift from the real page.
 *
 * Why a transform-scale and not a media query? `DesktopAlbumView`'s
 * hero is sized for 1024px+ (280px cover + flexed text + 40px title).
 * Reflowing it for 440px would require parallel responsive styles and
 * would still NOT show editors the desktop layout. Scaling preserves
 * intent and stays consistent with `PhoneBezel`, which uses the same
 * approach for the mobile preview.
 *
 * Interactivity is suppressed (`pointer-events-none`) — this is a
 * preview, not a live surface. Editors interact with the form on the
 * left, not the preview itself.
 */
export function AlbumDesktopPreviewCard({ album }: { album: AlbumPreviewAlbum }) {
  // Local UI state — preview is non-interactive but the tab strip
  // still needs SOME `tab` value. Keep a state hook so future tweaks
  // (e.g. an admin "preview Videos tab" affordance) plug in easily.
  const [tab, setTab] = useState<DesktopAlbumTab>("music");

  // Render at a fixed virtual width then scale to the preview pane.
  // 1040px gives the hero its full 280-cover + 640-text breathing room
  // and divides cleanly into the AdminFrame preview column at scale
  // ~0.42 (≈437px on screen). Height is left to natural content.
  const VIRTUAL_W = 1040;
  const SCALE = 0.42;

  return (
    <div
      className="w-full overflow-hidden rounded-2xl"
      style={{
        background: "#00062B",
        boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
        // Outer height tracks the scaled content so the preview pane
        // doesn't reserve dead space. Cap so absurdly-long descriptions
        // don't push the preview off-screen.
        maxHeight: "min(72vh, 760px)",
      }}
      data-testid="preview-album-desktop"
      aria-label={`Desktop preview of ${album.title}`}
    >
      <div
        style={{
          width: VIRTUAL_W,
          transform: `scale(${SCALE})`,
          transformOrigin: "top left",
          // Reserve enough height after the scale so the inner column's
          // intrinsic height isn't clipped at the top of the preview.
          height: `${100 / SCALE}%`,
          pointerEvents: "none",
        }}
      >
        <DesktopAlbumView
          album={{
            id: album.id,
            title: album.title,
            artist: album.artist,
            // PreviewAlbum allows null artwork — DesktopAlbumView wants
            // a string. Empty string renders a broken-image fallback,
            // which is the same signal the editor needs to see ("art
            // missing, fix the upload").
            artwork: album.artwork ?? "",
            year: album.year,
            // PreviewAlbum's "Duo" type doesn't exist on the desktop
            // view (the fan API doesn't model it yet). Coerce to "EP"
            // for preview purposes; the desktop fan route never sees
            // Duo, so this only affects the META line in admin.
            type: album.type === "Duo" ? "EP" : album.type,
            description: album.description,
            // PreviewAlbum doesn't carry these — DesktopAlbumView
            // gracefully hides the artist link / Buy Bundle / genre
            // meta when they're absent.
            genre: null,
            priceCents: null,
            primaryArtistId: null,
          }}
          songs={(album.songs ?? []).map((s) => ({
            id: s.id,
            title: s.title,
            trackNumber: s.trackNumber,
            duration: s.duration,
            isExplicit: !!s.isExplicit,
            isPreviewable: null,
          }))}
          videos={[]}
          photos={[]}
          // Preview always shows the owned (no Buy CTA, no locked rows)
          // variant — that's the surface fans land on after purchase,
          // which is what editors typically want to QA against.
          isOwned
          canPlay
          tab={tab}
          onTabChange={setTab}
          currentSongId={null}
          isPlaying={false}
        />
      </div>
    </div>
  );
}
