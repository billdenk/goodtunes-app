import { useState } from "react";
import { DesktopAlbumView, type DesktopAlbumTab } from "@/components/ui/DesktopAlbumView";
import { TabletBezel } from "./TabletBezel";
import type { AlbumPreviewAlbum } from "./AlbumPreviewCard";

/**
 * Admin-side tablet preview of the fan-facing desktop album page.
 * Wraps the shared `DesktopAlbumView` primitive inside a landscape
 * `TabletBezel` so the editor sees the same thing fans see at
 * ≥1024px — pixel-for-pixel, in a believable device frame.
 *
 * Why a transform-scale and not a media query? `DesktopAlbumView`'s
 * hero is sized for 1024px+ (280px cover + flexed text + 40px title).
 * Reflowing it for a smaller width would require parallel responsive
 * styles AND would still NOT show editors the real desktop layout.
 * Scaling preserves intent and stays consistent with `PhoneBezel`'s
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

  // TabletBezel inner display is 676×501. Render the desktop view at
  // a 1024-wide virtual canvas and scale to fit. The scaled height
  // (~768 * 0.66 ≈ 506) is clipped by the bezel's overflow-hidden so
  // the editor sees the above-the-fold of the real fan layout — same
  // contract as the PhoneBezel, which also scrolls/clips internally.
  const VIRTUAL_W = 1024;
  const SCALE = 676 / VIRTUAL_W;

  // Footer caption — mirrors AlbumPreviewCard's footer so the two
  // previews read as siblings.
  const sorted = [...(album.songs ?? [])].sort(
    (a, b) => a.trackNumber - b.trackNumber,
  );
  const totalSeconds = sorted.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  const trackCount = sorted.length;

  return (
    <TabletBezel
      testId="preview-album-desktop"
      footer={
        <>
          Tablet preview of the in-app AlbumDetail — {trackCount}{" "}
          {trackCount === 1 ? "track" : "tracks"}
          {totalMinutes > 0 ? ` · ${totalMinutes} min` : ""}.
        </>
      }
    >
      <div
        style={{
          width: VIRTUAL_W,
          transform: `scale(${SCALE})`,
          transformOrigin: "top left",
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
          // which is what editors typically want to QA against. Also
          // ensures the brand-blue Play pill renders instead of the
          // rose preview pill.
          isOwned
          canPlay
          tab={tab}
          onTabChange={setTab}
          currentSongId={null}
          isPlaying={false}
        />
      </div>
    </TabletBezel>
  );
}
