// PROPOSED design: an Instagram-Stories-shaped (9:16) version of the fan
// GoodDeed card, sized to fill a phone story / 1080x1920 export. FULL-BLEED
// treatment — the album art runs the entire width edge-to-edge as a top hero,
// bleeding up under the verified pill, then fades into brand navy for the
// ownership statement + serial below.
//
// IG SAFE ZONE: Instagram overlays its own chrome on the top (~13%) and bottom
// (~16%) of every story. All real *content* (pill, text, serial, logo) is
// confined to the center safe band so nothing important is ever covered by IG's
// profile row / reply bar. The art itself is allowed to bleed into the top band
// (it's decorative there — IG's profile row sits over it). `StoryCard` is the
// single source of truth for the card; the safe-zone study (StoriesSafeZone.tsx)
// renders this same card with IG chrome drawn on top, so the two never drift.
import type { ReactNode } from "react";
import "./_group.css";

const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const ART = "/__mockup/images/album-guitar-as-a-voice.png";

const album = { title: "Guitar as a Voice", artist: "Fernando Perdomo" };
const ownerName = "Jordan Ellis";
const certNumStr = "07";

// Instagram-reserved bands (share of the 9:16 frame height).
export const TOP_SAFE = "13%";
export const BOTTOM_SAFE = "16%";

export function StoryCard({ overlay }: { overlay?: ReactNode }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: "min(92vw, 340px)",
        aspectRatio: "9 / 16",
        borderRadius: 28,
        boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
        backgroundColor: "var(--brand-bg)",
      }}
    >
      {/* FULL-BLEED album art — spans the entire width as a top hero, bleeding
          to the top edge (and up under the IG profile band). */}
      <div className="absolute top-0 left-0 right-0" style={{ aspectRatio: "1 / 1" }}>
        <img src={ART} alt={album.title} className="w-full h-full object-cover block" />
        {/* fade the bottom of the art into brand navy so text below is seamless */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,6,43,0) 45%, rgba(0,6,43,0.55) 72%, rgba(0,6,43,0.92) 90%, var(--brand-bg) 100%)",
          }}
        />
        {/* slim top scrim so the verified pill stays legible over bright art */}
        <div
          className="absolute top-0 inset-x-0"
          style={{ height: "38%", background: "linear-gradient(180deg, rgba(0,6,43,0.6) 0%, rgba(0,6,43,0) 100%)" }}
        />
      </div>

      {/* Foreground content — confined to the IG safe center band */}
      <div
        className="absolute left-0 right-0 flex flex-col px-6"
        style={{ top: TOP_SAFE, bottom: BOTTOM_SAFE }}
      >
        {/* Verified pill, over the art */}
        <div className="flex justify-center">
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 backdrop-blur-sm"
            style={{ background: "rgba(74,255,202,0.16)", border: "1px solid rgba(74,255,202,0.4)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--brand-mint)" strokeWidth="3" strokeLinecap="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span className="text-[11px] font-bold tracking-wide" style={{ color: "var(--brand-mint)" }}>
              VERIFIED OWNERSHIP
            </span>
          </div>
        </div>

        {/* spacer — pushes the text zone down below the art hero */}
        <div className="flex-1 min-h-0" />

        {/* Title + artist */}
        <div className="text-center shrink-0">
          <p className="text-white text-2xl font-bold leading-tight">{album.title}</p>
          <p className="text-white/65 text-sm leading-tight mt-0.5">{album.artist}</p>
        </div>

        {/* Ownership statement + serial */}
        <div className="flex flex-col items-center text-center gap-1 shrink-0 mt-3">
          <p className="text-white/70 text-xs leading-snug">This GoodDeed® certifies that</p>
          <p className="text-white text-lg font-bold leading-tight">{ownerName}</p>
          <p
            className="font-bold leading-none mt-1"
            style={{ fontVariantNumeric: "tabular-nums", fontSize: "48px", color: "var(--brand-mint)" }}
          >
            No. {certNumStr}
          </p>
        </div>

        {/* Footer mark */}
        <div
          className="flex items-center justify-center mt-3 pt-3 shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}
        >
          <img src={LOGO} alt="GoodTunes" className="h-6 w-auto object-contain" />
        </div>
      </div>

      {overlay}
    </div>
  );
}

export function Stories() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <StoryCard />
    </div>
  );
}
