// Task #200 — Vinyl + album mock preview.
//
// Renders the artist's album art as a jacket on the left with a vinyl
// record (in the chosen color) peeking out the right side, and a thin
// black innersleeve strip flush with the jacket's right edge so the
// composition reads as "record half-pulled from its sleeve."
//
// Reused on the admin SellPanel (live preview as the artist picks
// color/jacket), fan-side BuySheet "You'll get" box, Welcome receipt,
// and the row + detail surfaces in fan/admin Orders.
//
// Task #374 — layout is now sized entirely off the jacket's own
// footprint, not the parent column. The outer wrapper has a fixed
// aspect ratio that reserves room for the jacket PLUS the disc peek
// past the right edge, so it never overflows its column. Inside, a
// stage matches the jacket's aspect (1:1 standard, 2:1 gatefold) and
// every child (disc, innersleeve, jacket) is positioned as a
// percentage of THAT stage. Because all three share the same
// coordinate system, the composition stays stable at any container
// width and any size variant.
import type { VinylColorOption, JacketUpgrade } from "@shared/pressing";
import type { AlbumFormat } from "@shared/schema";

// Sentinel values that mean "no real art" — the server stamps
// "/album-placeholder.svg" as the default; treat it the same as null so the
// white-background vinyl placeholder renders instead of the old navy square.
const NO_ART_SENTINELS = new Set(["/album-placeholder.svg", "", "null", "undefined"]);
function resolveArtwork(url: string | null | undefined): string | null {
  if (!url) return null;
  const v = url.trim();
  return NO_ART_SENTINELS.has(v) ? null : v;
}

// Shared jacket-art fill resolution: the single source of truth for what a
// "no real art yet" album shows inside a square cover slot. Real art →
// press's uploaded default jacket art (full-bleed) → press-logo on a white
// jacket → GoodTunes vinyl/soundwave branded svg. Never a blank gray box.
// Used by the VinylPreview jacket below AND by operator surfaces (e.g. the
// SellPanel collapsed-format header thumbnail) so the tiny thumbnail, the
// big preview, and the GoodDeed cert all fall back to an identical branded
// default. `placeholderArtworkUrl` + `placeholderLogoUrl` are optional —
// omit them on fan call sites so a press's uploaded jacket art / logo never
// leaks onto a fan cover (it falls straight through to the GoodTunes branded
// svg). Task #2261 — `placeholderArtworkUrl` is the press's uploaded default
// jacket image (`manufacturers.vinyl_placeholder_url`); when present it wins
// over the corporate logo so the admin package designer matches the press
// catalog editor (which renders the same uploaded art full-bleed).
export function JacketArtFill({
  artworkUrl,
  placeholderArtworkUrl,
  placeholderLogoUrl,
}: {
  artworkUrl: string | null | undefined;
  placeholderArtworkUrl?: string | null;
  placeholderLogoUrl?: string | null;
}) {
  const artwork = resolveArtwork(artworkUrl);
  if (artwork) {
    return (
      <img
        src={artwork}
        alt=""
        className="w-full h-full object-cover"
        draggable={false}
      />
    );
  }
  const placeholderArt = resolveArtwork(placeholderArtworkUrl);
  if (placeholderArt) {
    return (
      <img
        src={placeholderArt}
        alt=""
        className="w-full h-full object-cover"
        draggable={false}
        data-testid="img-press-jacket-placeholder"
      />
    );
  }
  if (placeholderLogoUrl) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center p-[16%]">
        <img
          src={placeholderLogoUrl}
          alt=""
          className="max-w-full max-h-full object-contain opacity-80"
          draggable={false}
          data-testid="img-press-logo-placeholder"
        />
      </div>
    );
  }
  return (
    <img
      src="/vinyl-jacket-placeholder.svg"
      alt=""
      className="w-full h-full object-cover"
      draggable={false}
      data-testid="img-vinyl-jacket-placeholder"
    />
  );
}

export function VinylPreview({
  artworkUrl,
  color,
  jacketUpgrade,
  size = "md",
  jacketOverlay,
  format,
  placeholderArtworkUrl,
  placeholderLogoUrl,
}: {
  artworkUrl: string | null | undefined;
  color: VinylColorOption;
  jacketUpgrade: JacketUpgrade;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  // Task #2117 — when an album has no artwork yet, operator/press
  // surfaces (SellPanel, press catalog preview) can pass the press's
  // logo to render a *branded placeholder* in the jacket instead of a
  // plain gray gradient. Real album art always wins (this only shows
  // when `artworkUrl` is empty). Optional/undefined keeps the plain
  // gradient for fan-facing call sites, so a press logo never leaks
  // onto a fan album cover.
  placeholderLogoUrl?: string | null;
  // Task #2261 — the press's uploaded default jacket image
  // (`manufacturers.vinyl_placeholder_url`). When present (and the album
  // has no real art), it renders FULL-BLEED as the jacket — winning over
  // `placeholderLogoUrl` — so the admin package designer shows the same
  // uploaded art the press catalog editor shows. Optional/undefined keeps
  // the logo/gradient fallback, so press jacket art never leaks onto a fan
  // album cover.
  placeholderArtworkUrl?: string | null;
  // Task #393 — optional ReactNode rendered absolutely-positioned
  // INSIDE the jacket div, so a hover-pencil from the SellPanel format
  // card can sit on the jacket itself (top-right) without overlapping
  // the disc peek to the right.
  jacketOverlay?: React.ReactNode;
  // Task #982 — the format being previewed. Real 7" singles ship with
  // no inner sleeve, so when format is "7_inch" we omit the thin black
  // innersleeve strip. Larger vinyl formats (12" LP etc.) keep it.
  // Optional/undefined keeps the strip for back-compat call sites.
  format?: AlbumFormat;
}) {
  // Task #982 — 7" singles have no inner sleeve in real life.
  const showInnerSleeve = format !== "7_inch";
  // Strip legacy sentinel values ("/album-placeholder.svg", etc.) so they
  // are treated as "no real art" and the white-background placeholder wins.
  const artwork = resolveArtwork(artworkUrl);
  // Task #1310 — cassette renders as a tall J-card case, not a vinyl
  // disc. The J-card is printed both sides with the album cover, so we
  // show the art in a portrait cassette-case frame with a folded spine
  // strip on the left and a soft plastic sheen. No disc, no inner
  // sleeve, no color axis (cassette is a single one-color imprint). The
  // "cassette peeking out" idea Bill floated is deferred — this is the
  // flat-art version he asked for first.
  if (format === "cassette") {
    const cassetteDims =
      size === "sm"
        ? "h-20"
        : size === "lg"
          ? "h-44"
          : size === "xl"
            ? "h-56"
            : size === "2xl"
              ? "h-72"
              : "h-28";
    return (
      <div
        className={["relative inline-block align-top", cassetteDims].join(" ")}
        style={{ aspectRatio: "0.68 / 1" }}
        data-testid="cassette-preview"
      >
        <div className="absolute inset-0 overflow-hidden shadow-md border border-black/15 bg-slate-200">
          {artwork ? (
            <img
              src={artwork}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : resolveArtwork(placeholderArtworkUrl) ? (
            <img
              src={resolveArtwork(placeholderArtworkUrl)!}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
              data-testid="img-press-jacket-placeholder"
            />
          ) : placeholderLogoUrl ? (
            <div className="w-full h-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center p-[18%]">
              <img
                src={placeholderLogoUrl}
                alt=""
                className="max-w-full max-h-full object-contain opacity-80"
                draggable={false}
                data-testid="img-press-logo-placeholder"
              />
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-300 to-slate-400" />
          )}
          {/* Folded J-card spine — a thin strip on the left edge that
              reads as the wrap-around fold (same art, darkened). */}
          <div className="absolute top-0 bottom-0 left-0" style={{ width: "11%" }} aria-hidden="true">
            {artwork && (
              <img src={artwork} alt="" className="w-full h-full object-cover" draggable={false} />
            )}
            <div className="absolute inset-0 bg-black/35" />
            <div className="absolute top-0 bottom-0 right-0 w-px bg-black/40" />
          </div>
          {/* Plastic case sheen */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(115deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 78%, rgba(255,255,255,0.12) 100%)",
            }}
            aria-hidden="true"
          />
          {jacketOverlay}
        </div>
      </div>
    );
  }
  // Height drives the scale. The width is derived from the aspect
  // ratio of (jacket footprint + disc peek), so the outer wrapper
  // reserves real layout space for the disc instead of letting it
  // overflow into the next column.
  const dims =
    size === "sm"
      ? { container: "h-20" }
      : size === "lg"
        ? { container: "h-44" }
        : size === "xl"
          ? { container: "h-56" }
          : size === "2xl"
            ? { container: "h-72" }
            : { container: "h-28" };
  const isGatefold = jacketUpgrade === "gatefold" || jacketUpgrade === "gatefold_insert";
  // Jacket aspect: 1:1 standard, 2:1 gatefold (held at every size).
  const jacketAspect = isGatefold ? 2 : 1;
  // Disc center expressed as a fraction of the jacket's own width.
  // Square jacket: 78% tucks roughly three-quarters of the disc
  // behind the jacket, leaving the outer ring peeking past the
  // right edge. Wide gatefold: the disc still lives at the right
  // edge, so the center moves to ~89% of the (2x) jacket width to
  // keep the same proportional peek.
  const discCenterPctOfJacket = isGatefold ? 89 : 78;
  // Total visual footprint = jacket width + the part of the disc
  // that peeks past the jacket's right edge. Disc width equals the
  // jacket height (1 unit), so disc right edge sits at
  // jacketAspect * (discCenter%/100) + 0.5 units past the stage's
  // left. The outer wrapper's aspect-ratio uses this total so the
  // disc never overhangs the wrapper.
  const discRightEdgeUnits = jacketAspect * (discCenterPctOfJacket / 100) + 0.5;
  const totalAspect = Math.max(jacketAspect, discRightEdgeUnits);
  return (
    <div
      className={["relative inline-block align-top", dims.container].join(" ")}
      style={{ aspectRatio: `${totalAspect} / 1` }}
      data-testid={`vinyl-preview-${color.id}-${jacketUpgrade}`}
    >
      {/* Inner stage = the jacket footprint, anchored to the left of
          the outer wrapper. Every child position below is a fraction
          of THIS stage's width (= jacket width), so disc/innersleeve
          never drift away from the jacket regardless of how wide the
          parent grows. */}
      <div
        className="absolute top-0 bottom-0 left-0"
        style={{ aspectRatio: `${jacketAspect} / 1` }}
      >
        {/* Vinyl record — sized to jacket height, sits behind jacket.
            Task #672 — when the picked color carries a real swatch
            photo (`thumbnailUrl`, e.g. MRP's masked per-color disc),
            render that image as the disc and skip the synthetic grooves
            + generic label, since the photo already shows the real
            stock. Otherwise fall back to the name-appropriate hex/
            gradient swatch. */}
        {color.thumbnailUrl ? (
          // Task #755 — the masked MRP per-color disc PNGs are a colored
          // disc inscribed in a transparent frame: the disc only reaches
          // ~96% of the frame, leaving a thin transparent margin all the
          // way around. The old `bg-slate-900` container fill showed
          // through that margin (and through the ring between the disc
          // edge and the `rounded-full` clip), reading as a heavy black
          // border. Drop the dark fallback so the margin shows nothing,
          // and zoom the image just past the clip boundary so the
          // colored disc edge (plus its anti-aliasing) reaches the rim.
          <div
            className="absolute top-0 bottom-0 rounded-full shadow-md overflow-hidden"
            style={{
              aspectRatio: "1 / 1",
              left: `${discCenterPctOfJacket}%`,
              transform: "translateX(-50%)",
            }}
            aria-hidden="true"
          >
            <img
              src={color.thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{ transform: "scale(1.07)" }}
              draggable={false}
            />
          </div>
        ) : (
          <div
            className="absolute top-0 bottom-0 rounded-full shadow-md"
            style={{
              aspectRatio: "1 / 1",
              left: `${discCenterPctOfJacket}%`,
              transform: "translateX(-50%)",
              background: vinylBackground(color.swatch),
            }}
            aria-hidden="true"
          >
            {/* Inner concentric rings for groove texture */}
            <div
              className="absolute inset-[12%] rounded-full opacity-40"
              style={{
                background:
                  "repeating-radial-gradient(circle, rgba(0,0,0,0.18) 0 1px, transparent 1px 3px)",
              }}
            />
            {/* Spindle hole + tiny dark "label" disc — kept generic so
                we don't try to fake the artist's actual label artwork */}
            <div className="absolute inset-[34%] rounded-full bg-slate-900/70" />
            <div className="absolute left-1/2 top-1/2 w-[3px] h-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-100" />
          </div>
        )}

        {/* Album jacket — fills the inner stage, no rounded corners
            (per spec). Rendered AFTER the disc so the disc is tucked
            behind it visually. */}
        <div
          className="absolute inset-0 bg-slate-200 overflow-hidden shadow-sm border border-black/10"
          data-testid="vinyl-preview-jacket"
        >
          <JacketArtFill artworkUrl={artworkUrl} placeholderArtworkUrl={placeholderArtworkUrl} placeholderLogoUrl={placeholderLogoUrl} />
          {/* Gatefold cue — thin centered fold seam, so a gatefold
              reads as two-panel even before you notice the wider
              footprint. */}
          {isGatefold && (
            <div
              className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 bg-black/25"
              style={{ width: "1px" }}
              aria-hidden="true"
            />
          )}
          {jacketOverlay}
        </div>

        {/* Thin black innersleeve strip — sits just OUTSIDE the
            jacket's right edge (left: 100% of the stage) so it's
            visible against the disc instead of being covered by the
            jacket. Rendered last so it stacks on top of the disc.
            Task #982 — omitted for 7" singles, which ship without an
            inner sleeve. */}
        {showInnerSleeve && (
          <div
            className="absolute top-[2%] bottom-[2%] bg-black/90"
            style={{
              left: "100%",
              width: "5px",
              borderRadius: "1px",
            }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

// Render the swatch CSS as a vinyl-ish radial. If the swatch is a
// plain hex, hold the true color almost all the way to the rim so a
// COLORED disc reads as that color when it peeks past the jacket —
// the old version darkened the outer 45% toward black, and since the
// disc sits ~78% behind the jacket, that dark band was the only part
// that peeked out, reading as a heavy black border. Now only the final
// few percent get a whisper of darkening (a thin edge for definition
// against light backgrounds), plus a soft off-center sheen so it still
// reads as vinyl rather than flat paint. Gradient swatches
// (smokey/regrind/etc.) come through as-is.
function vinylBackground(swatch: string): string {
  if (swatch.startsWith("linear-gradient") || swatch.startsWith("radial-gradient")) {
    return swatch;
  }
  return `radial-gradient(circle at 32% 28%, color-mix(in srgb, ${swatch} 86%, #fff) 0%, ${swatch} 42%, ${swatch} 94%, color-mix(in srgb, ${swatch} 94%, #000) 100%)`;
}
