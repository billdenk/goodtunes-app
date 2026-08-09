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
// Bill (Aug 09 2026): the press-logo and brand-fallback tiles must render
// EXACTLY like the press Catalog editor's placeholder jacket — the white mark
// at ~42% width on the `#1d1d1f` ink jacket (JacketStage's label-logo fill).
// Same look in light AND dark admin themes (the catalog jacket is theme-
// independent), which also kills the muddy gray GoodTunes tile in dark mode.
const INK_JACKET_BG = "#1d1d1f";
const FORCE_WHITE_MARK = "brightness(0) invert(1)";

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
  /** Native img loading hint. Defaults to "lazy". Use "eager" for above-the-fold art. */
  loading?: "lazy" | "eager";
  /** Inline style applied to the real-artwork <img> element.
   *  Used for cases that need non-standard img layout (e.g. cert portrait mask). */
  imgStyle?: React.CSSProperties;
  /**
   * Task #2369 — admin-only: the album's effective press's uploaded jacket-art
   * (manufacturers.vinyl_placeholder_url). When present and the album has no real
   * artwork, renders full-bleed as the cover placeholder — wins over pressLogoUrl.
   * Must never be passed on fan-facing surfaces.
   */
  pressJacketUrl?: string | null;
  /**
   * Admin-only: the album's effective press's domain (manufacturers.domain).
   * Accepted for call-site compatibility but no longer rendered — the bundled
   * per-domain art tiles (white/gray) were replaced by the catalog jacket
   * treatment (Bill, Aug 09 2026). Must never be passed on fan-facing surfaces.
   */
  pressDomain?: string | null;
  /**
   * Admin-only: the album's effective press's light logo
   * (manufacturers.logo_url) — fallback mark when the press has no label
   * branding. Rendered white-forced at ~42% on the label-bg/ink jacket,
   * matching the press Catalog editor's JacketStage placeholder exactly.
   * Must never be passed on fan-facing surfaces.
   */
  pressLogoUrl?: string | null;
  /**
   * Admin-only: the press's label-branding mark + jacket color
   * (manufacturers.label_logo_url / label_bg_color) — the SAME pair the press
   * Catalog editor's placeholder jacket renders. Wins over pressLogoUrl.
   */
  pressLabelLogoUrl?: string | null;
  pressLabelBgColor?: string | null;
  /**
   * Task #2371 — admin-only opt-in. When there is no real art AND no press
   * placeholder resolves, render a grayscale GoodTunes mark on a white tile
   * instead of the ghosted artist photo / dark brand tile. Matches the
   * package designer (VinylPreview/JacketArtFill) so an art-less, press-less
   * album shows the SAME light placeholder on every admin surface. Wins over
   * the ghosted artist photo. Fan surfaces never set it.
   */
  brandFallback?: boolean;
}

// Brand-toned fallback tile (no artist photo): navy base lit by faint blue
// + purple glows, matching the brand palette in replit.md.
const BRAND_TILE_BACKGROUND =
  "radial-gradient(circle at 28% 18%, rgba(49,158,216,0.40), transparent 58%)," +
  "radial-gradient(circle at 82% 88%, rgba(127,16,167,0.40), transparent 55%)," +
  "var(--brand-bg)";

// Task #2371 — the GoodTunes brand mark used for the admin-only brandFallback
// tier. Rendered grayscale on a white tile to match VinylPreview/JacketArtFill.
const GOODTUNES_FALLBACK_LOGO = "/goodtunes-logo-color.png";

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
  loading = "lazy",
  imgStyle,
  pressJacketUrl,
  pressDomain: _pressDomain,
  pressLogoUrl,
  pressLabelLogoUrl,
  pressLabelBgColor,
  brandFallback = false,
}: AlbumCoverProps) {
  // Track load failures so a dead artwork/photo URL falls through to the next
  // tier instead of showing the broken glyph. Reset when the URL changes so
  // adding real art (or a new photo) re-attempts the image immediately.
  const [artFailed, setArtFailed] = useState(false);
  const [pressJacketFailed, setPressJacketFailed] = useState(false);
  const [pressLabelLogoFailed, setPressLabelLogoFailed] = useState(false);
  const [pressLogoFailed, setPressLogoFailed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setArtFailed(false), [artwork]);
  useEffect(() => setPressJacketFailed(false), [pressJacketUrl]);
  useEffect(() => setPressLabelLogoFailed(false), [pressLabelLogoUrl]);
  useEffect(() => setPressLogoFailed(false), [pressLogoUrl]);
  useEffect(() => setPhotoFailed(false), [artistPhoto]);

  const hasArt = !!artwork && !artFailed;
  if (hasArt) {
    return (
      <img
        src={artwork as string}
        alt={decorative ? "" : title}
        aria-hidden={decorative || undefined}
        crossOrigin="anonymous"
        loading={loading}
        decoding="async"
        onError={() => setArtFailed(true)}
        className={`w-full h-full object-cover ${className}`}
        style={imgStyle}
        data-testid="album-cover-art"
      />
    );
  }

  // Task #2369 — press jacket art (full-bleed, like real art).
  const hasPressJacket = !!pressJacketUrl && !pressJacketFailed;
  if (hasPressJacket) {
    return (
      <img
        src={pressJacketUrl as string}
        alt={decorative ? "" : title}
        aria-hidden={decorative || undefined}
        crossOrigin="anonymous"
        loading={loading}
        decoding="async"
        onError={() => setPressJacketFailed(true)}
        className={`w-full h-full object-cover ${className}`}
        data-testid="album-cover-press-jacket"
      />
    );
  }

  // Press tile — the catalog placeholder jacket: the press's label-branding
  // mark (fallback: profile logo) white-forced at ~42% width on the press's
  // label-bg (fallback: ink) jacket, matching JacketStage exactly.
  // Failure-aware: a dead label logo falls back to the profile logo before
  // the tier gives up entirely (each mark tracks its own load failure).
  const labelMarkUsable = !!pressLabelLogoUrl && !pressLabelLogoFailed;
  const profileMarkUsable = !!pressLogoUrl && !pressLogoFailed;
  const pressMarkUrl = labelMarkUsable ? pressLabelLogoUrl : profileMarkUsable ? pressLogoUrl : null;
  const hasPressLogo = !!pressMarkUrl;
  if (hasPressLogo) {
    return (
      <div
        className={`relative w-full h-full overflow-hidden ${className}`}
        style={{ background: pressLabelBgColor || INK_JACKET_BG }}
        data-testid="album-cover-press-logo"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={pressMarkUrl as string}
            alt=""
            aria-hidden
            crossOrigin="anonymous"
            loading={loading}
            decoding="async"
            onError={() =>
              labelMarkUsable ? setPressLabelLogoFailed(true) : setPressLogoFailed(true)
            }
            style={{ width: "42%", height: "42%", objectFit: "contain", filter: FORCE_WHITE_MARK, opacity: 0.92 }}
          />
        </div>
      </div>
    );
  }

  // Task #2371 — admin opt-in brand fallback: grayscale GoodTunes mark on a
  // white tile, matching VinylPreview/JacketArtFill so an art-less, press-less
  // album shows the SAME light placeholder in the Albums list, detail header,
  // package designer, and GoodDeed cert (instead of the dark ghost/brand tile).
  // Wins over the ghosted artist photo. Fan surfaces never opt in.
  if (brandFallback) {
    return (
      <div
        className={`relative w-full h-full overflow-hidden ${className}`}
        style={{ background: INK_JACKET_BG }}
        data-testid="album-cover-brand-fallback"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={GOODTUNES_FALLBACK_LOGO}
            alt=""
            aria-hidden
            loading={loading}
            decoding="async"
            style={{ width: "42%", height: "42%", objectFit: "contain", filter: FORCE_WHITE_MARK, opacity: 0.92 }}
          />
        </div>
      </div>
    );
  }

  return (
    <AlbumCoverPlaceholder
      artistPhoto={artistPhoto ?? null}
      title={title}
      showName={showName && !decorative}
      className={className}
    />
  );
}

interface PlaceholderInnerProps {
  artistPhoto: string | null;
  title: string;
  showName: boolean;
  photoFailed: boolean;
  onPhotoError: () => void;
  className?: string;
}

/** Internal placeholder renderer shared by AlbumCover and AlbumCoverPlaceholder. */
function PlaceholderInner({
  artistPhoto,
  title,
  showName,
  photoFailed,
  onPhotoError,
  className = "",
}: PlaceholderInnerProps) {
  const hasPhoto = !!artistPhoto && !photoFailed;
  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{
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
          crossOrigin="anonymous"
          loading="lazy"
          decoding="async"
          onError={onPhotoError}
          className="absolute inset-0 w-full h-full object-cover"
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
      {showName && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-[8%]">
          <span
            className="font-semibold text-white leading-tight line-clamp-4"
            style={{
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

/**
 * Standalone branded placeholder — the ghosted-artist-photo + album-name tile
 * shown when no artwork is available.
 *
 * Exported for surfaces that render the real artwork themselves with custom
 * layout (e.g. the GoodDeed cert portrait/story shape where the img needs
 * `height:auto` + a bottom-dissolve mask that can't live inside AlbumCover).
 */
export function AlbumCoverPlaceholder({
  artistPhoto,
  title,
  showName = true,
  className = "",
}: {
  artistPhoto?: string | null;
  title: string;
  showName?: boolean;
  className?: string;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [artistPhoto]);

  return (
    <PlaceholderInner
      artistPhoto={artistPhoto ?? null}
      title={title}
      showName={showName}
      photoFailed={photoFailed}
      onPhotoError={() => setPhotoFailed(true)}
      className={className}
    />
  );
}
