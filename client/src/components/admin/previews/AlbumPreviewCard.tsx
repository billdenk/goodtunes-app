import type { ReactNode } from "react";
import { Play, Shuffle, Disc3, ChevronLeft, Share, MoreHorizontal } from "lucide-react";
import { PhoneBezel } from "./PhoneBezel";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";

export interface AlbumPreviewSong {
  id: string;
  title: string;
  trackNumber: number;
  duration: number;
  // Per-track explicit flag — surfaced as an "E" chip next to the
  // title in the preview's tracklist so the admin sees the same
  // marker the fan sees in AlbumDetail's song row.
  isExplicit?: boolean | null;
}

export interface AlbumPreviewAlbum {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
  year: number | null;
  type: "Single" | "Duo" | "EP" | "LP";
  description: string | null;
  isHidden: boolean;
  // Derived server-side from the album's songs — true if any song on the
  // album has its per-track Explicit toggle on. Surfaced on the preview
  // so the admin sees the same "E" chip the fan sees, without needing
  // an album-level toggle.
  isExplicit?: boolean;
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
    album.type === "EP"
      ? "EP"
      : album.type === "Single"
        ? "single"
        : album.type === "Duo"
          ? "duo"
          : "LP";
  const ownLabelPlural =
    album.type === "EP"
      ? "EPs"
      : album.type === "Single"
        ? "singles"
        : album.type === "Duo"
          ? "duos"
          : "LPs";

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
      bottomNav={<PreviewBottomNav />}
    >
      <div className="px-5 pt-3 pb-6 flex flex-col items-center">
        {/* Header chrome — mirrors the live AlbumDetail floating chrome:
            back chip on the left, share + ⋯ connected pill on the right.
            Static divs (visual-only); the real interactive controls live
            on the fan-facing AlbumDetail page. Sizes match the live
            IconButton `md` (44×44) primitive. */}
        <div
          className="w-full flex items-center justify-between mb-3"
          aria-hidden
        >
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white"
            style={{ background: "rgba(255,255,255,0.17)" }}
          >
            <ChevronLeft strokeWidth={2.5} className="w-[19px] h-[19px] -translate-x-[1px]" />
          </div>
          <div
            className="flex items-center rounded-full"
            style={{ background: "rgba(255,255,255,0.17)" }}
          >
            <div className="w-11 h-11 flex items-center justify-center text-white">
              <Share strokeWidth={2} className="w-[19px] h-[19px]" />
            </div>
            <div className="w-px h-4 bg-white/25" />
            <div className="w-11 h-11 flex items-center justify-center text-white">
              <MoreHorizontal strokeWidth={2} className="w-[19px] h-[19px]" />
            </div>
          </div>
        </div>

        {/* Cover */}
        <div
          className="w-[72%] max-w-[260px] aspect-square rounded-xl overflow-hidden bg-white/5"
          style={{ boxShadow: "0 18px 50px rgba(0,0,0,0.55)" }}
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
            className="text-white text-[22px] font-bold leading-tight tracking-tight flex items-center justify-center gap-2.5 flex-wrap"
            data-testid="text-preview-album-title"
          >
            <span>{album.title || "Untitled album"}</span>
            {album.isExplicit && <ExplicitBadge />}
          </h2>
          <p className="text-[#319ED8] text-[15px] font-semibold mt-0.5 truncate">
            {album.artist || "Unknown artist"}
          </p>
          <p
            className="text-[12px] mt-1 flex items-center justify-center gap-1.5"
            style={{ color: "rgba(235,235,245,0.55)" }}
          >
            <span>
              {album.type}
              {album.year ? ` · ${album.year}` : ""}
              {album.label?.name ? ` · ${album.label.name}` : ""}
              {album.isHidden ? " · Hidden" : ""}
            </span>
            {album.isExplicit && <ExplicitBadge />}
          </p>
        </div>

        {/* Transport cluster — mirrors the live AlbumDetail three-control
            row: shuffle circle · large white Play pill · download circle.
            Visual-only static divs; the real interactive controls live
            on the fan-facing AlbumDetail page. */}
        <div
          className="mt-4 flex items-center justify-center gap-3"
          aria-hidden
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <Shuffle strokeWidth={2.2} className="w-5 h-5" />
          </div>
          <div
            className="flex items-center justify-center gap-2.5 h-12 px-10 rounded-full font-semibold text-[17px]"
            style={{ background: "#fff", color: "#00062B" }}
          >
            <Play className="w-[22px] h-[22px] fill-current" />
            Play
          </div>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v12" />
              <path d="M7 12.5L12 17.5l5-5" />
            </svg>
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
                  <span className="flex-1 min-w-0 flex items-center gap-2.5">
                    <span className="text-white text-[15px] font-medium truncate">
                      {s.title}
                    </span>
                    {s.isExplicit && <ExplicitBadge />}
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

/**
 * Visual-only mirror of the live fan-side `BottomNav` (Collection /
 * Playlists / Chat / Account), rendered inside the phone bezel so the
 * preview reads as a real phone surface rather than a card. Static —
 * mirror the glyphs + glass treatment, not the interactivity. Defaults
 * to "Collection" as the active tab since the live AlbumDetail sits
 * under the Collection section.
 */
function PreviewBottomNav() {
  const items: Array<{ label: string; active: boolean; icon: ReactNode }> = [
    {
      label: "Collection",
      active: true,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="4" height="18" rx="1" />
          <rect x="9" y="3" width="3" height="18" rx="1" />
          <rect x="14" y="3" width="7" height="11" rx="1" />
          <rect x="14" y="16" width="7" height="5" rx="1" />
        </svg>
      ),
    },
    {
      label: "Playlists",
      active: false,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18M3 10h14M3 14h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M17 14v6M14 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "Chat",
      active: false,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      ),
    },
    {
      label: "Account",
      active: false,
      icon: (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
          style={{
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "rgba(255,255,255,0.75)",
          }}
        >
          ?
        </div>
      ),
    },
  ];
  return (
    <div className="px-3 pb-3 pt-1">
      <div
        className="flex items-center justify-around px-2 py-2 rounded-full"
        style={{
          background: "rgba(28, 30, 48, 0.55)",
          backdropFilter: "blur(36px) saturate(200%)",
          WebkitBackdropFilter: "blur(36px) saturate(200%)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 8px 36px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset",
        }}
      >
        {items.map((it) => (
          <div
            key={it.label}
            className="relative flex flex-col items-center gap-[2px] min-w-[60px]"
          >
            <span
              className="absolute rounded-full"
              style={{
                background: it.active ? "rgba(49,158,216,0.18)" : "transparent",
                left: "-4px",
                right: "-4px",
                top: "-3px",
                bottom: "-4px",
              }}
            />
            <div
              className="relative w-12 h-6 flex items-center justify-center"
              style={{ color: it.active ? "#319ED8" : "rgba(255,255,255,0.35)" }}
            >
              {it.icon}
            </div>
            <span
              className="relative text-[9px] font-medium"
              style={{ color: it.active ? "#319ED8" : "rgba(255,255,255,0.35)" }}
            >
              {it.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
