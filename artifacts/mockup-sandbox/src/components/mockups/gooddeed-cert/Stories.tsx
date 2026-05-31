// PROPOSED design: an Instagram-Stories-shaped (9:16) version of the fan
// GoodDeed card, sized to fill a phone story / 1080x1920 export. The album art
// is an immersive backdrop with a brand-navy gradient and a mint verified mark.
//
// IG SAFE ZONE: Instagram overlays its own chrome on the top (~13%) and bottom
// (~16%) of every story. All real content is therefore confined to the center
// safe band so nothing important is ever covered by IG's profile row / reply
// bar. The empty navy gutters top & bottom are intentional — that's where IG's
// UI lands. `StoryCard` is the single source of truth for the card; the
// safe-zone study (StoriesSafeZone.tsx) renders this same card with IG chrome
// drawn on top, so the two never drift.
import type { ReactNode } from "react";
import "./_group.css";

const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const ART = "/__mockup/images/album-guitar-as-a-voice.png";
const OWNER_PHOTO = "/__mockup/images/sample-owner-photo.png";

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
      {/* Immersive blurred backdrop from the album art */}
      <img
        src={ART}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: "blur(28px) saturate(120%)", transform: "scale(1.25)", opacity: 0.5 }}
      />
      {/* Navy gradient scrim for legibility top-to-bottom */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,6,43,0.55) 0%, rgba(0,6,43,0.35) 38%, rgba(0,6,43,0.85) 72%, var(--brand-bg) 100%)",
        }}
      />

      {/* Foreground content — confined to the IG safe center band */}
      <div
        className="absolute left-0 right-0 flex flex-col px-7"
        style={{ top: TOP_SAFE, bottom: BOTTOM_SAFE }}
      >
        {/* Verified pill */}
        <div className="flex justify-center">
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{ background: "rgba(74,255,202,0.14)", border: "1px solid rgba(74,255,202,0.35)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--brand-mint)" strokeWidth="3" strokeLinecap="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span className="text-[11px] font-bold tracking-wide" style={{ color: "var(--brand-mint)" }}>
              VERIFIED OWNERSHIP
            </span>
          </div>
        </div>

        {/* Hero album art */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3">
          <div
            className="rounded-2xl overflow-hidden shrink-0"
            style={{ width: "48%", aspectRatio: "1/1", boxShadow: "0 18px 50px rgba(0,0,0,0.6)" }}
          >
            <img src={ART} alt={album.title} className="w-full h-full object-cover block" />
          </div>
          <div className="text-center">
            <p className="text-white text-xl font-bold leading-tight">{album.title}</p>
            <p className="text-white/65 text-sm leading-tight mt-0.5">{album.artist}</p>
          </div>
        </div>

        {/* Ownership statement + serial */}
        <div className="flex flex-col items-center text-center gap-1.5 shrink-0">
          <img src={OWNER_PHOTO} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white/25" />
          <p className="text-white/70 text-xs leading-snug">This GoodDeed® certifies that</p>
          <p className="text-white text-lg font-bold leading-tight">{ownerName}</p>
          <p
            className="font-bold leading-none mt-0.5"
            style={{ fontVariantNumeric: "tabular-nums", fontSize: "46px", color: "var(--brand-mint)" }}
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
