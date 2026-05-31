// ORANGE-BORDER variant of the 4:5 portrait feed card (1080×1350) — the format
// Instagram and Facebook now DEFAULT to for feed posts (taller than the square,
// so it fills more of the scroll). Same approved GoodDeed signature as the
// Story (StoriesBordered), texting (OgBordered), and square (SquareBordered):
// the whole card is FRAMED edge-to-edge in GoodTunes orange (#FF7C06).
//
// Layout mirrors the approved Story: album-art band at the top with a long fade
// into navy, the owner avatar pulled UP so it straddles the seam, then
// "certifies" → owner name → [GoodTunes | #NN] pill, with the album caption
// pinned to the bottom. 4:5 is taller than the square, so the art band gets more
// height and the ownership block breathes.
//
// Sizing follows the SHIPPED Square.tsx pattern: a fixed w with u = w/1080 scale
// math (definite pixel heights resolve cleanly; % heights under aspect-ratio do
// not). Exports as 1080x1350. Optional ?r=NN overrides the corner radius
// (default 22, the approved Story curve) for A/B on the canvas.
import "./_group.css";
import type { ReactNode } from "react";
import type { StoryData } from "./Stories";

const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const GOODTUNES_ORANGE = "var(--brand-orange)";

const data: StoryData = {
  art: "/__mockup/images/album-california-way.png",
  ownerPhoto: "/__mockup/images/sample-owner-photo.png",
  album: { title: "California Way", artist: "TOMMYGUNN" },
  ownerName: "Jordan Ellis",
  certNumStr: "12",
};

// Auto-shrink the owner name so it stays on ONE line (matches the Story card).
function nameFontSize(name: string, u: number): number {
  const n = name.trim().length;
  const base = n <= 12 ? 88 : n <= 15 ? 76 : n <= 18 ? 66 : n <= 22 ? 57 : n <= 26 ? 50 : 44;
  return base * u;
}

export function BorderedPortraitCard({ overlay, radius = 22 }: { overlay?: ReactNode; radius?: number }) {
  const { art, ownerPhoto, album, ownerName, certNumStr } = data;

  // Preview at w = 360 with the same u = w/1080 scale the exporter uses. 4:5 →
  // height = w * 1350/1080.
  const w = 360;
  const u = w / 1080;
  const h = w * (1350 / 1080);

  const captionOneLine = `${album.title} by ${album.artist} #${certNumStr}`;
  const captionWraps = captionOneLine.length > 34;

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        width: w,
        height: h,
        boxSizing: "border-box",
        border: `${45 * u}px solid ${GOODTUNES_ORANGE}`,
        borderRadius: radius,
        backgroundColor: "var(--brand-bg)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
      }}
    >
      {/* Album-art band at the top, with a long soft fade into navy (matches the
          approved Story blend so the seam is seamless). 4:5 affords a taller,
          near-square art window. */}
      <div className="relative w-full shrink-0" style={{ height: 760 * u }}>
        <img src={art} alt={album.title} className="w-full h-full object-cover object-top block" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,6,43,0) 48%, rgba(0,6,43,0.6) 76%, rgba(0,6,43,0.95) 93%, var(--brand-bg) 100%)",
          }}
        />
      </div>

      {/* Lower section — relative+z so the avatar paints ON TOP of the album art */}
      <div
        className="relative z-10 flex-1 flex flex-col items-center text-center"
        style={{ paddingLeft: 56 * u, paddingRight: 56 * u, paddingBottom: 56 * u }}
      >
        <div
          className="rounded-full overflow-hidden shrink-0"
          style={{
            width: 210 * u,
            height: 210 * u,
            marginTop: -153 * u, // straddle the seam between art and navy
            border: `${Math.max(1, 6 * u)}px solid rgba(255,255,255,0.18)`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <img src={ownerPhoto} alt={ownerName} className="w-full h-full object-cover block" />
        </div>

        <p className="text-white/55 leading-snug" style={{ fontSize: 33 * u, marginTop: 34 * u }}>
          This GoodDeed® certifies
        </p>
        <p
          className="text-white font-bold leading-tight max-w-full whitespace-nowrap"
          style={{ fontSize: nameFontSize(ownerName, u), marginTop: 10 * u }}
        >
          {ownerName}
        </p>

        {/* [GoodTunes | #NN] number pill — directly under the name */}
        <div
          className="flex items-center"
          style={{
            marginTop: 26 * u,
            gap: 22 * u,
            padding: `${24 * u}px ${44 * u}px`,
            borderRadius: 999,
            background: "rgba(0,6,43,0.62)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
          }}
        >
          <img src={LOGO} alt="GoodTunes" style={{ height: 64 * u, width: "auto", display: "block" }} />
          <span style={{ width: 1, height: 50 * u, background: "rgba(255,255,255,0.3)" }} />
          <span className="font-bold text-white" style={{ fontSize: 42 * u, letterSpacing: 0.2 }}>
            #{certNumStr}
          </span>
        </div>

        {/* secondary caption sits directly under the pill as part of the block */}
        {captionWraps ? (
          <div className="text-white/60 leading-snug" style={{ fontSize: 30 * u, marginTop: 22 * u }}>
            <p className="whitespace-nowrap">{album.title} #{certNumStr}</p>
            <p className="whitespace-nowrap">by {album.artist}</p>
          </div>
        ) : (
          <p className="text-white/60 leading-snug whitespace-nowrap" style={{ fontSize: 30 * u, marginTop: 22 * u }}>
            {captionOneLine}
          </p>
        )}
      </div>

      {overlay}
    </div>
  );
}

export function PortraitBordered() {
  // Approved/locked card radius is 22 (matches the Story). Optional ?r=NN A/B.
  const raw = Number(new URLSearchParams(window.location.search).get("r") ?? "22");
  const r = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 22;
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <BorderedPortraitCard radius={r} />
    </div>
  );
}
