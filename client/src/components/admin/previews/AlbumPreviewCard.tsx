import { Heart, MoreHorizontal, Play, Shuffle, Disc3 } from "lucide-react";
import { PhoneBezel } from "./PhoneBezel";

export interface AlbumPreviewSong {
  id: string;
  title: string;
  trackNumber: number;
  duration: number;
}

export interface AlbumPreviewAlbum {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
  year: number | null;
  type: "Single" | "EP" | "LP";
  description: string | null;
  isHidden: boolean;
  label?: { id: string; name: string } | null;
  songs: AlbumPreviewSong[];
}

/**
 * Apple-Music-style album page rendered at phone scale.
 *
 * Hand-built (rather than iframed off `/album/:id`) so the React Query
 * cache shared with the admin page makes saves instantly reflect in the
 * preview without a reload — same reactive contract as LabelPreviewCard.
 *
 * Surfaces only what already lives on AlbumFull; no extra fetches.
 */
export function AlbumPreviewCard({ album }: { album: AlbumPreviewAlbum }) {
  // Defensive against a backend contract drift that returns null for
  // `songs` — the preview should still render the album shell.
  const sorted = [...(album.songs ?? [])].sort(
    (a, b) => a.trackNumber - b.trackNumber,
  );
  const totalSeconds = sorted.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  const trackCount = sorted.length;
  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <PhoneBezel
      testId="preview-album"
      footer={
        <>
          Preview of the in-app AlbumDetail — {trackCount}{" "}
          {trackCount === 1 ? "track" : "tracks"}
          {totalMinutes > 0 ? ` · ${totalMinutes} min` : ""}.
        </>
      }
    >
      <div className="px-5 pt-3 pb-6 flex flex-col items-center">
        {/* Cover */}
        <div
          className="w-full aspect-square rounded-2xl overflow-hidden bg-white/5"
          style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.55)" }}
          data-testid="img-preview-album-cover"
        >
          {album.artwork ? (
            <img
              src={album.artwork}
              alt={album.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white/30"
              aria-hidden
            >
              <Disc3 className="w-16 h-16" />
            </div>
          )}
        </div>

        {/* Title + artist */}
        <div className="mt-4 w-full text-center">
          <h2
            className="text-white text-[22px] font-bold leading-tight tracking-tight"
            data-testid="text-preview-album-title"
          >
            {album.title || "Untitled album"}
          </h2>
          <p className="text-[#319ED8] text-[15px] font-semibold mt-0.5 truncate">
            {album.artist || "Unknown artist"}
          </p>
          <p
            className="text-[12px] mt-1"
            style={{ color: "rgba(235,235,245,0.55)" }}
          >
            {album.type}
            {album.year ? ` · ${album.year}` : ""}
            {album.label?.name ? ` · ${album.label.name}` : ""}
            {album.isHidden ? " · Hidden" : ""}
          </p>
        </div>

        {/* Play + shuffle row — visual-only inside the preview pane.
            Rendered as static divs (not buttons) so screen readers and
            keyboard users aren't told they're interactive. The real
            controls live on the actual fan-side AlbumDetail. */}
        <div
          className="mt-4 w-full grid grid-cols-2 gap-2"
          aria-hidden
        >
          <div
            className="h-10 rounded-lg inline-flex items-center justify-center gap-1.5 text-[14px] font-semibold text-white"
            style={{ background: "rgba(255,255,255,0.10)" }}
          >
            <Play className="w-4 h-4 fill-current" />
            Play
          </div>
          <div
            className="h-10 rounded-lg inline-flex items-center justify-center gap-1.5 text-[14px] font-semibold text-white"
            style={{ background: "rgba(255,255,255,0.10)" }}
          >
            <Shuffle className="w-4 h-4" />
            Shuffle
          </div>
        </div>

        {/* Description (line-clamped) */}
        {album.description && (
          <p
            className="mt-4 text-[12.5px] leading-relaxed line-clamp-4 self-stretch"
            style={{ color: "rgba(235,235,245,0.72)" }}
            data-testid="text-preview-album-description"
          >
            {album.description}
          </p>
        )}

        {/* Tracks */}
        <div className="mt-4 self-stretch">
          {sorted.length === 0 ? (
            <p
              className="text-[13px] py-6 text-center"
              style={{ color: "rgba(235,235,245,0.5)" }}
            >
              No tracks yet. Add them from the Tracks tab.
            </p>
          ) : (
            <ol className="divide-y divide-white/5">
              {sorted.slice(0, 8).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 py-2.5"
                  data-testid={`row-preview-track-${s.id}`}
                >
                  <span
                    className="text-[12px] tabular-nums w-5 text-right flex-shrink-0"
                    style={{ color: "rgba(235,235,245,0.5)" }}
                  >
                    {s.trackNumber}
                  </span>
                  <span className="flex-1 min-w-0 text-white text-[13.5px] truncate">
                    {s.title}
                  </span>
                  <span
                    className="text-[11.5px] tabular-nums flex-shrink-0"
                    style={{ color: "rgba(235,235,245,0.45)" }}
                  >
                    {fmt(s.duration || 0)}
                  </span>
                  <Heart
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: "rgba(235,235,245,0.3)" }}
                  />
                </li>
              ))}
              {sorted.length > 8 && (
                <li
                  className="py-2.5 text-center text-[12px]"
                  style={{ color: "rgba(235,235,245,0.5)" }}
                >
                  + {sorted.length - 8} more
                </li>
              )}
            </ol>
          )}
        </div>

        {/* ⋯ bottom action — visual only */}
        <div className="mt-5 self-stretch flex items-center justify-center">
          <MoreHorizontal
            className="w-5 h-5"
            style={{ color: "rgba(235,235,245,0.5)" }}
          />
        </div>
      </div>
    </PhoneBezel>
  );
}
