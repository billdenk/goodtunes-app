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

export function VinylPreview({
  artworkUrl,
  color,
  jacketUpgrade,
  size = "md",
  jacketOverlay,
}: {
  artworkUrl: string | null | undefined;
  color: VinylColorOption;
  jacketUpgrade: JacketUpgrade;
  size?: "sm" | "md" | "lg" | "xl";
  // Task #393 — optional ReactNode rendered absolutely-positioned
  // INSIDE the jacket div, so a hover-pencil from the SellPanel format
  // card can sit on the jacket itself (top-right) without overlapping
  // the disc peek to the right.
  jacketOverlay?: React.ReactNode;
}) {
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
        {/* Vinyl record — sized to jacket height, sits behind jacket */}
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

        {/* Album jacket — fills the inner stage, no rounded corners
            (per spec). Rendered AFTER the disc so the disc is tucked
            behind it visually. */}
        <div
          className="absolute inset-0 bg-slate-200 overflow-hidden shadow-sm border border-black/10"
          data-testid="vinyl-preview-jacket"
        >
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-300 to-slate-400" />
          )}
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
            jacket. Rendered last so it stacks on top of the disc. */}
        <div
          className="absolute top-[6%] bottom-[6%] bg-black/90"
          style={{
            left: "100%",
            width: "5px",
            borderRadius: "1px",
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

// Render the swatch CSS as a vinyl-ish radial. If the swatch is a
// plain hex, layer a subtle dark vignette so the disc reads as vinyl,
// not paint. Gradient swatches (smokey/regrind/etc.) come through
// as-is.
function vinylBackground(swatch: string): string {
  if (swatch.startsWith("linear-gradient") || swatch.startsWith("radial-gradient")) {
    return swatch;
  }
  return `radial-gradient(circle at 30% 30%, ${swatch} 0%, ${swatch} 55%, color-mix(in srgb, ${swatch} 70%, #000) 100%)`;
}
