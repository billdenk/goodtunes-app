// PROPOSED design: an Instagram-Stories-shaped (9:16) version of the fan
// GoodDeed card, sized to fill a phone story / 1080x1920 export.
//
// ART DIRECTION (Bill-approved): FULL-BLEED album art as a tall top hero — runs
// edge-to-edge and fades into brand navy — with a single baked [GoodTunes | #NN]
// chip pinned to the RIGHT EDGE, vertically centered on the art. That's the SAME
// chip locked into the messaging-app link preview (#6 / OgNativeChip), so the
// share set matches. Below the art: the owner's avatar, then a clean certificate
// statement ("This GoodDeed® certifies that / <Owner> / Owns #NN of <Album> by
// <Artist>"). The brand mark lives in the chip, so there's no separate verified
// pill or footer logo.
//
// Why full-bleed is OK on Instagram: IG only overlays its own chrome on the top
// (~13%, profile row) and bottom (~16%, reply bar) of a story. Decorative art is
// allowed to bleed under the top band; we only keep the *certificate content*
// (avatar + text) and the chip inside the safe center band so nothing important
// is ever covered. `StoryCard` is the single source of truth; the safe-zone study
// (StoriesSafeZone.tsx) renders this same card with IG chrome drawn on top, so
// the two never drift.
//
// `chipStyle` toggles the baked chip between the dark-navy glass and a lighter
// frosted glass — used by the StoryChipDark / StoryChipLight comparison frames.
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

// Full-bleed art height as a share of the card height.
const ART_HEIGHT = "56%";

export type ChipStyle = "dark" | "light";

export function StoryCard({
  overlay,
  chipStyle = "dark",
}: {
  overlay?: ReactNode;
  chipStyle?: ChipStyle;
}) {
  const chip =
    chipStyle === "light"
      ? { background: "rgba(255,255,255,0.20)", border: "rgba(255,255,255,0.45)", divider: "rgba(255,255,255,0.5)" }
      : { background: "rgba(0,6,43,0.62)", border: "rgba(255,255,255,0.18)", divider: "rgba(255,255,255,0.3)" };

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
      {/* FULL-BLEED album-art hero — edge to edge, fading into brand navy */}
      <div className="absolute top-0 inset-x-0" style={{ height: ART_HEIGHT }}>
        <img src={ART} alt={album.title} className="w-full h-full object-cover block" />
        {/* fade the bottom of the art into navy so the certificate below is seamless */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,6,43,0) 55%, rgba(0,6,43,0.6) 80%, rgba(0,6,43,0.95) 94%, var(--brand-bg) 100%)",
          }}
        />
        {/* Baked [GoodTunes | #NN] chip — pinned to the RIGHT EDGE, vertically
            centered on the art. Matches the locked link-preview chip. */}
        <div
          className="absolute flex items-center"
          style={{
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            gap: 9,
            padding: "7px 14px",
            borderRadius: 999,
            background: chip.background,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: `1px solid ${chip.border}`,
            boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
          }}
        >
          <img src={LOGO} alt="GoodTunes" style={{ height: 20, width: "auto", display: "block" }} />
          <span style={{ width: 1, height: 16, background: chip.divider }} />
          <span className="font-bold text-white" style={{ fontSize: 15, letterSpacing: 0.2 }}>
            #{certNumStr}
          </span>
        </div>
      </div>

      {/* Certificate block — avatar + ownership statement, centered in the safe
          band beneath the art. */}
      <div
        className="absolute inset-x-0 flex flex-col items-center justify-center text-center px-6"
        style={{ top: ART_HEIGHT, bottom: BOTTOM_SAFE }}
      >
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
        <p className="text-white/60 text-sm leading-snug mt-2" style={{ maxWidth: "15rem" }}>
          Owns #{certNumStr} of {album.title} by {album.artist}
        </p>
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
