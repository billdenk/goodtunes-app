// Task #200 — Vinyl + album mock preview.
//
// Renders the artist's album art as a square jacket on the left with a
// vinyl record (in the chosen color) peeking out the right side, with
// a thin black innersleeve strip between them. The vinyl is offset so
// only the outer edge shows — no fake label is required, the color is
// what sells the preview.
//
// Reused on the admin SellPanel (live preview as the artist picks
// color/jacket) and ready to drop into the fan-side Preview & Purchase
// surface for the "You'll get" box.
import type { VinylColorOption, JacketUpgrade } from "@shared/pressing";

export function VinylPreview({
  artworkUrl,
  color,
  jacketUpgrade,
  size = "md",
}: {
  artworkUrl: string | null | undefined;
  color: VinylColorOption;
  jacketUpgrade: JacketUpgrade;
  size?: "sm" | "md" | "lg";
}) {
  // Container is a 16:10-ish rectangle so the vinyl has room to peek
  // out the right side without clipping. Square album fills the left
  // 62% (or 100% width if gatefold — gatefold spreads a bit wider).
  const dims =
    size === "sm"
      ? { container: "h-20" }
      : size === "lg"
        ? { container: "h-44" }
        : { container: "h-28" };
  const isGatefold = jacketUpgrade === "gatefold" || jacketUpgrade === "gatefold_insert";
  const albumWidthPct = isGatefold ? 75 : 62;
  // Vinyl center sits just past the right edge of the album so only
  // the outer ring is visible. Label area stays hidden behind the
  // jacket.
  const vinylCenterPct = albumWidthPct + 16;
  return (
    <div
      className={["relative w-full", dims.container].join(" ")}
      data-testid={`vinyl-preview-${color.id}-${jacketUpgrade}`}
    >
      {/* Vinyl record — colored disc behind the jacket */}
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-full shadow-md"
        style={{
          aspectRatio: "1 / 1",
          height: "100%",
          left: `calc(${vinylCenterPct}% - 50% * (var(--vp-h, 0)))`,
          // Position the disc so its center is at vinylCenterPct of
          // the container width. We use the trick of left = X - 50% of
          // its own width via a transform.
          transform: "translate(-50%, -50%)",
          marginTop: 0,
          top: "50%",
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
        {/* Spindle hole + tiny dark "label" disc — kept generic so we
            don't try to fake the artist's actual label artwork */}
        <div className="absolute inset-[34%] rounded-full bg-slate-900/70" />
        <div className="absolute left-1/2 top-1/2 w-[3px] h-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-100" />
      </div>

      {/* Thin black innersleeve strip — sits just inside the right
          edge of the jacket, sandwiched between vinyl and jacket */}
      <div
        className="absolute top-[6%] bottom-[6%] bg-black/85"
        style={{
          left: `calc(${albumWidthPct}% - 6px)`,
          width: "6px",
          borderRadius: "1px",
        }}
        aria-hidden="true"
      />

      {/* Album jacket — square, no rounded corners (per spec) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 left-0 bg-slate-200 overflow-hidden shadow-sm border border-black/10"
        style={{ aspectRatio: "1 / 1", height: "100%" }}
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
