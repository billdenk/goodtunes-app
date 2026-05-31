// PROPOSED design: an Instagram-Stories-shaped (9:16) version of the fan
// GoodDeed card, sized to fill a phone story / 1080x1920 export.
//
// ART DIRECTION (Bill-approved): a floating, rounded album-art hero near the top
// with a single baked [GoodTunes | #NN] chip in its bottom-right corner — the
// SAME chip locked into the messaging-app link preview (#6 / OgNativeChip), so
// the share set matches. Below the art: the owner's avatar, then a clean
// certificate statement ("This GoodDeed® certifies that / <Owner> / Owns #NN of
// <Album> by <Artist>"). The brand mark lives in the chip, so there's no
// separate verified pill or footer logo.
//
// IG SAFE ZONE: Instagram overlays its own chrome on the top (~13%) and bottom
// (~16%) of every story. The certificate content (avatar + text) stays inside the
// center safe band so nothing important is ever covered by IG's profile row /
// reply bar. The art is allowed to bleed slightly into the top band (decorative —
// IG's profile row sits over its top edge), while the chip sits low enough on the
// art to stay clear. `StoryCard` is the single source of truth for the card; the
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
      {/* Content column — art hero near the top, certificate block below, all
          held clear of the IG bottom reply bar. */}
      <div
        className="absolute inset-x-0 flex flex-col px-5"
        style={{ top: "4%", bottom: BOTTOM_SAFE }}
      >
        {/* Album-art hero — floating rounded card with the baked brand chip */}
        <div
          className="relative w-full shrink-0 overflow-hidden"
          style={{ aspectRatio: "4 / 3", borderRadius: 20, boxShadow: "0 14px 40px rgba(0,0,0,0.45)" }}
        >
          <img src={ART} alt={album.title} className="w-full h-full object-cover block" />
          {/* Baked [GoodTunes | #NN] chip — matches the locked link-preview chip */}
          <div
            className="absolute flex items-center"
            style={{
              right: 12,
              bottom: 12,
              gap: 9,
              padding: "7px 13px",
              borderRadius: 999,
              background: "rgba(0,6,43,0.62)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
            }}
          >
            <img src={LOGO} alt="GoodTunes" style={{ height: 20, width: "auto", display: "block" }} />
            <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.3)" }} />
            <span className="font-bold text-white" style={{ fontSize: 15, letterSpacing: 0.2 }}>
              #{certNumStr}
            </span>
          </div>
        </div>

        {/* Certificate block — avatar + ownership statement, centered in the
            remaining safe band */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center">
          {/* Owner avatar */}
          <div
            className="rounded-full overflow-hidden shrink-0"
            style={{
              width: 78,
              height: 78,
              border: "2px solid rgba(255,255,255,0.18)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            <img src={OWNER_PHOTO} alt={ownerName} className="w-full h-full object-cover block" />
          </div>

          <p className="text-white/55 text-xs leading-snug mt-5">This GoodDeed® certifies that</p>
          <p className="text-white font-bold leading-tight mt-1.5" style={{ fontSize: 30 }}>
            {ownerName}
          </p>
          <p
            className="text-white/60 text-sm leading-snug mt-2"
            style={{ maxWidth: "15rem" }}
          >
            Owns #{certNumStr} of {album.title} by {album.artist}
          </p>
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
