import { useLocation } from "wouter";
import { TabletBezel } from "./TabletBezel";
import {
  PreviewBottomNav,
  adminAlbumToSurface,
  albumPreviewSummary,
  type AlbumPreviewAlbum,
} from "./AlbumPreviewCard";
import { AlbumDetailMobileSurface } from "@/components/ui/AlbumDetailMobileSurface";
import { AlbumBonusContent, AlbumLineupRail } from "@/pages/AlbumDetail";

/**
 * Admin-side tablet preview of the fan-facing AlbumDetail page.
 *
 * Per `replit.md`, the GoodTunes player is Apple-Music mobile chrome —
 * the same surface fans see on every device class. The preview wraps
 * the shared `AlbumDetailMobileSurface` (the single visual source of
 * truth — also rendered by the live fan route and the phone-bezel
 * preview) inside a landscape `TabletBezel`, so the tablet variant of
 * the preview shows the exact same chrome the phone variant does and
 * matches what fans see in the live app.
 *
 * Interactivity is suppressed (`pointer-events-none`) — this is a
 * preview, not a live surface. Editors interact with the form on the
 * left, not the preview itself.
 */
export function AlbumDesktopPreviewCard({ album }: { album: AlbumPreviewAlbum }) {
  const { trackCount, totalMinutes } = albumPreviewSummary(album);
  const { album: surfaceAlbum, songs: surfaceSongs } = adminAlbumToSurface(album);
  const [, navigate] = useLocation();

  // TabletBezel inner display is 676×501. Render the mobile shell at
  // its natural ~440px width, centered, so the chrome reads as the same
  // Apple-Music surface fans see — just framed in a tablet bezel. The
  // bezel's `overflow-hidden` clips below the fold; same scroll/clip
  // contract as the PhoneBezel.
  const COLUMN_W = 440;

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
        className="w-full h-full flex justify-center"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="flex flex-col h-full bg-[#00062B]"
          style={{ width: COLUMN_W, maxWidth: "100%" }}
        >
          <div className="flex-1 overflow-hidden">
            <AlbumDetailMobileSurface
              album={surfaceAlbum}
              songs={surfaceSongs}
              ownedNums={[1]}
              currentSongId={null}
              isPlaying={false}
              bonusSlot={<AlbumBonusContent albumId={album.id} />}
              lineupSlot={
                <AlbumLineupRail
                  albumId={album.id}
                  onPickMember={(name) => navigate(`/artist/${encodeURIComponent(name)}`)}
                />
              }
            />
          </div>
          <div className="flex-shrink-0" aria-hidden>
            <PreviewBottomNav />
          </div>
        </div>
      </div>
    </TabletBezel>
  );
}
