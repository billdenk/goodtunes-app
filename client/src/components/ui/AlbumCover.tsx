// Shared branded album-cover treatment (Task #1884).
//
// ONE place that decides what fills an album's square cover so a cover never
// renders the browser's broken-image "?" glyph. Before this, every surface
// dropped a raw `<img src={album.artwork}>` inline, which showed the broken
// glyph whenever an album had no artwork or its stored URL pointed at a
// deleted object.
//
// Decision order:
//   1. Real artwork present and loads → show it (unchanged behavior).
//   2. Artwork missing OR its URL is dead (load error) → show the primary
//      artist's profile photo, ghosted (dimmed/desaturated), with the album
//      name overlaid so it's obvious the art is a placeholder, not final.
//   3. No artist photo to fall back to → a brand-toned tile with the name.
//
// It's a drop-in fill: it renders something that is `w-full h-full`, so it
// goes exactly where the old `<img>` lived. Callers keep their own sized,
// rounded, overflow-hidden wrapper plus any overlays (play button, badges).
import { useEffect, useState } from "react";

export interface AlbumCoverProps {
  /** The album's chosen artwork URL. Empty/null/dead → placeholder. */
  artwork?: string | null;
  /** Primary artist's profile photo — the ghosted placeholder image. */
  artistPhoto?: string | null;
  /** Album name, overlaid on the placeholder (and used as real-art alt). */
  title: string;
  /**
   * Whether to overlay the album name on the placeholder. Tiny surfaces
   * (collapsed dock, mini player, cert thumbnail) pass `false` — the name
   * is shown beside them and would be unreadable inside a ~44px tile.
   */
  showName?: boolean;
  /** Extra classes for the rendered fill (e.g. opacity for stacked cards). */
  className?: string;
  /**
   * Mark the cover purely decorative (stacked multi-owned copies). Skips the
   * name overlay and empties the alt text.
   */
  decorative?: boolean;
}

// Brand-toned fallback tile (no artist photo): navy base lit by faint blue
// + purple glows, matching the brand palette in replit.md.
const BRAND_TILE_BACKGROUND =
  "radial-gradient(circle at 28% 18%, rgba(49,158,216,0.40), transparent 58%)," +
  "radial-gradient(circle at 82% 88%, rgba(127,16,167,0.40), transparent 55%)," +
  "var(--brand-bg)";

// Navy scrim over the ghosted artist photo so the overlaid name always reads.
const GHOST_SCRIM =
  "linear-gradient(to bottom, rgba(var(--brand-bg-rgb), 0.30) 0%, rgba(var(--brand-bg-rgb), 0.78) 100%)";

export function AlbumCover({
  artwork,
  artistPhoto,
  title,
  showName = true,
  className = "",
  decorative = false,
}: AlbumCoverProps) {
  // Track load failures so a dead artwork/photo URL falls through to the next
  // tier instead of showing the broken glyph. Reset when the URL changes so
  // adding real art (or a new photo) re-attempts the image immediately.
  const [artFailed, setArtFailed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setArtFailed(false), [artwork]);
  useEffect(() => setPhotoFailed(false), [artistPhoto]);

  const hasArt = !!artwork && !artFailed;
  if (hasArt) {
    return (
      <img
        src={artwork as string}
        alt={decorative ? "" : title}
        aria-hidden={decorative || undefined}
        loading="lazy"
        decoding="async"
        onError={() => setArtFailed(true)}
        className={`w-full h-full object-cover ${className}`}
        data-testid="album-cover-art"
      />
    );
  }

  const hasPhoto = !!artistPhoto && !photoFailed;
  const overlayName = showName && !decorative;

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{
        // Container-query context so the overlaid name scales with the
        // cover's actual rendered size (large on the detail hero, hidden
        // on tiny surfaces via showName=false).
        containerType: "size",
        background: hasPhoto ? "var(--brand-bg)" : BRAND_TILE_BACKGROUND,
      }}
      data-testid={hasPhoto ? "album-cover-ghost" : "album-cover-brandtile"}
    >
      {hasPhoto && (
        <img
          src={artistPhoto as string}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          onError={() => setPhotoFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
          // Ghost the photo: desaturate + darken so it never reads as the
          // album's real, chosen art.
          style={{ filter: "grayscale(0.35) brightness(0.5)" }}
        />
      )}
      {/* Scrim — over the ghosted photo for legibility; a soft vignette on
          the brand tile to give the name a little lift. */}
      <div
        className="absolute inset-0"
        style={{
          background: hasPhoto
            ? GHOST_SCRIM
            : "radial-gradient(circle at 50% 50%, transparent 35%, rgba(var(--brand-bg-rgb), 0.45) 100%)",
        }}
      />
      {overlayName && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-[8%]">
          <span
            className="font-semibold text-white leading-tight line-clamp-4"
            style={{
              // 12% of the cover's width, clamped so it stays readable on a
              // small card yet doesn't dominate the large detail hero.
              fontSize: "clamp(11px, 12cqw, 34px)",
              textShadow: "0 1px 8px rgba(0,0,0,0.5)",
            }}
            data-testid="album-cover-name"
          >
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
