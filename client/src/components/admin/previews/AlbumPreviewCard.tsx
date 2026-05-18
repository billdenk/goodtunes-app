import { Play, Shuffle, Disc3 } from "lucide-react";
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
  // Ownership mirrors the real Album type so the preview's footer matches
  // the fan-facing AlbumDetail line-for-line ("You own No. 03 of this LP."
  // / "You own 3 LPs."). Optional — preview hides the line if absent.
  ownedCertificates?: number[] | null;
  certificateNumber?: number | null;
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

  // Mirror AlbumDetail's `ownedNums` derivation so the preview reads the
  // same as the fan page when admin seed data carries ownership.
  const ownedNums =
    album.ownedCertificates && album.ownedCertificates.length > 0
      ? album.ownedCertificates
      : album.certificateNumber
        ? [album.certificateNumber]
        : [];
  const ownLabel =
    album.type === "EP" ? "EP" : album.type === "Single" ? "single" : "LP";
  const ownLabelPlural =
    album.type === "EP" ? "EPs" : album.type === "Single" ? "singles" : "LPs";

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
            // Mirror the real fan AlbumDetail track row exactly:
            // 15px number/title, white/0.32 numerals, hairline separators
            // at white/0.07, plus the same right-side download circle and
            // ⋯ glyph. No truncation — show every track; the PhoneBezel
            // scrolls. No more "+ N more". No heart inline (heart lives
            // inside the ⋯ sheet on the real surface).
            <ol>
              {sorted.map((s, i) => (
                <li
                  key={s.id}
                  className="relative flex items-center gap-3 h-14"
                  data-testid={`row-preview-track-${s.id}`}
                >
                  {i > 0 && (
                    <span
                      aria-hidden
                      className="absolute left-0 right-0 top-0 h-px pointer-events-none"
                      style={{ background: "rgba(255,255,255,0.07)" }}
                    />
                  )}
                  <span
                    className="text-[15px] tabular-nums w-6 text-right flex-shrink-0"
                    style={{ color: "rgba(255,255,255,0.32)" }}
                  >
                    {s.trackNumber}
                  </span>
                  <span className="flex-1 min-w-0 text-white text-[15px] font-medium truncate">
                    {s.title}
                  </span>
                  {/* Download circle — outlined, matches fan surface */}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.45)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="flex-shrink-0"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 7v8" />
                    <path d="M8.5 11.5L12 15l3.5-3.5" />
                  </svg>
                  {/* ⋯ glyph */}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="rgba(255,255,255,0.4)"
                    className="flex-shrink-0"
                    aria-hidden
                  >
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                </li>
              ))}
              <li
                aria-hidden
                className="h-px"
                style={{ background: "rgba(255,255,255,0.08)" }}
              />
            </ol>
          )}
        </div>

        {/* Footer metadata — matches the fan AlbumDetail's footer block
            below the tracklist: year on its own line, then count + runtime. */}
        <div
          className="mt-6 self-stretch text-[11px] leading-relaxed"
          style={{ color: "rgba(255,255,255,0.32)" }}
        >
          {album.year && <div>{album.year}</div>}
          <div className="mt-0.5">
            {trackCount} {trackCount === 1 ? "song" : "songs"}
            {totalMinutes > 0 ? `, ${totalMinutes} min` : ""}
          </div>
          {ownedNums.length > 0 && (
            <div className="mt-1" data-testid="text-preview-album-owned">
              {ownedNums.length === 1
                ? `You own No. ${ownedNums[0].toString().padStart(2, "0")} of this ${ownLabel}.`
                : `You own ${ownedNums.length} ${ownLabelPlural}.`}
            </div>
          )}
        </div>
      </div>
    </PhoneBezel>
  );
}
