import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { PhoneBezel } from "./PhoneBezel";
import { AlbumDetailMobileSurface } from "@/components/ui/AlbumDetailMobileSurface";
import { AlbumBonusContent, AlbumLineupRail } from "@/pages/AlbumDetail";

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
  genre?: string | null;
  label?: { id: string; name: string } | null;
  // Task #1078 / #1158 — Apple-style album footer fields so the admin
  // preview's footer matches the fan page line-for-line, including the
  // per-album copyright symbol (℗ default, or ©).
  originalReleaseDate?: string | null;
  copyrightLine?: string | null;
  copyrightSymbol?: string | null;
  songs: AlbumPreviewSong[];
  // Ownership mirrors the real Album type so the preview's footer matches
  // the fan-facing AlbumDetail line-for-line ("You own No. 03 of this LP."
  // / "You own 3 LPs."). Optional — preview hides the line if absent.
  ownedCertificates?: number[] | null;
  certificateNumber?: number | null;
}

/**
 * Derived footer / counts shared by phone + tablet previews. Pulled out
 * so AlbumDesktopPreviewCard's tablet caption stays in lockstep with
 * the phone bezel's caption.
 */
export function albumPreviewSummary(album: AlbumPreviewAlbum) {
  const sorted = [...(album.songs ?? [])].sort(
    (a, b) => a.trackNumber - b.trackNumber,
  );
  const totalSeconds = sorted.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  return { sorted, totalSeconds, totalMinutes, trackCount: sorted.length };
}

/**
 * Maps the admin-side `AlbumPreviewAlbum` shape onto the props the
 * shared `AlbumDetailMobileSurface` consumes. One mapping lives here
 * so AlbumPreviewCard (phone bezel) + AlbumDesktopPreviewCard (tablet
 * bezel) feed the surface identical data.
 */
export function adminAlbumToSurface(album: AlbumPreviewAlbum) {
  const { sorted } = albumPreviewSummary(album);
  return {
    album: {
      id: album.id,
      title: album.title || "Untitled album",
      artist: album.artist || "Unknown artist",
      artwork: album.artwork,
      year: album.year,
      type: album.type,
      description: album.description,
      isExplicit: album.isExplicit,
      genre: album.genre ?? null,
      priceCents: null,
      originalReleaseDate: album.originalReleaseDate ?? null,
      copyrightLine: album.copyrightLine ?? null,
      copyrightSymbol: album.copyrightSymbol ?? null,
    },
    songs: sorted.map((s) => ({
      id: s.id,
      title: s.title,
      trackNumber: s.trackNumber,
      duration: s.duration,
      isExplicit: s.isExplicit,
    })),
  };
}

/**
 * Apple-Music-style album page rendered at phone scale.
 *
 * Hand-built (rather than iframed off `/album/:id`) so the React Query
 * cache shared with the admin page makes saves instantly reflect in the
 * preview without a reload — same reactive contract as LabelPreviewCard.
 *
 * Renders the shared `AlbumDetailMobileSurface` so the admin preview
 * stays bit-identical with the live fan page. Ownership defaults to
 * `[1]` so the Buy CTA stays hidden in the editor (matches today's
 * preview).
 */
export function AlbumPreviewCard({ album }: { album: AlbumPreviewAlbum }) {
  const { trackCount, totalMinutes } = albumPreviewSummary(album);
  const { album: surfaceAlbum, songs: surfaceSongs } = adminAlbumToSurface(album);
  const [, navigate] = useLocation();
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
      {/* pointer-events: none — the preview is a non-interactive mirror.
          Taps must not navigate, open sheets, or play bonus videos. */}
      <div className="w-full h-full" style={{ pointerEvents: "none" }}>
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
export function PreviewBottomNav() {
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
