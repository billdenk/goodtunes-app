// ALTERNATE Story concept (Bill's sketch): instead of full-bleed art, FRAME the
// card in GoodTunes orange so the format is instantly recognizable as a
// GoodDeed share. True RECTANGLE (square corners) — the orange border runs
// edge-to-edge. The album art is shown UNCROPPED as a clean square; the owner's
// avatar is pulled UP so it straddles the seam between the art and the solid
// navy below (and paints ON TOP of the cover, bridging the transition).
//
// Reading order puts the NUMBER above the fold: avatar → "certifies that" →
// Owner name → [GoodTunes | #NN] pill, then the "Owns #NN of …" caption is
// pinned to the BOTTOM as the secondary line.
//
// Colors/scale follow the locked tokens (avatar 78, name 30, chip logo 24 /
// divider 19 / #NN 15). The orange is the OFFICIAL GoodTunes logo orange
// (#FF7C06 / rgb(255,124,6)), taken from the 2025 GoodTunes logo SVG.
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

export function BorderedStoryCard({ overlay }: { overlay?: ReactNode }) {
  const { art, ownerPhoto, album, ownerName, certNumStr } = data;

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        width: "min(92vw, 340px)",
        aspectRatio: "9 / 16",
        border: `15px solid ${GOODTUNES_ORANGE}`,
        borderRadius: 0, // true rectangle — square corners
        backgroundColor: "var(--brand-bg)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
      }}
    >
      {/* Uncropped square album art at the top (square cover → square box, no crop) */}
      <div className="relative w-full shrink-0" style={{ aspectRatio: "1 / 1" }}>
        <img src={art} alt={album.title} className="w-full h-full object-cover block" />
        {/* Long, soft fade of the art's lower half into navy — matches the locked
            full-bleed Story blend so the seam into the solid navy is seamless
            (the abrupt short fade read as a hard edge). */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,6,43,0) 55%, rgba(0,6,43,0.6) 80%, rgba(0,6,43,0.95) 94%, var(--brand-bg) 100%)",
          }}
        />
      </div>

      {/* Lower section — relative+z so the avatar paints ON TOP of the album art */}
      <div className="relative z-10 flex-1 flex flex-col items-center text-center px-6" style={{ paddingBottom: 11 }}>
        <div
          className="rounded-full overflow-hidden shrink-0"
          style={{
            width: 78,
            height: 78,
            marginTop: -56, // head reaches the knee-bend in the art; name+pill follow
            border: "2px solid rgba(255,255,255,0.18)", // subtle hairline (locked Story treatment)
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <img src={ownerPhoto} alt={ownerName} className="w-full h-full object-cover block" />
        </div>

        <p className="text-white/55 text-xs leading-snug mt-4">This GoodDeed® certifies that</p>
        <p className="text-white font-bold leading-tight mt-1.5" style={{ fontSize: 30 }}>
          {ownerName}
        </p>

        {/* [GoodTunes | #NN] number pill — moved UP, directly under the name (above the fold) */}
        <div
          className="flex items-center mt-3"
          style={{
            gap: 8,
            padding: "9px 16px",
            borderRadius: 999,
            background: "rgba(0,6,43,0.62)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
          }}
        >
          <img src={LOGO} alt="GoodTunes" style={{ height: 24, width: "auto", display: "block" }} />
          <span style={{ width: 1, height: 19, background: "rgba(255,255,255,0.3)" }} />
          <span className="font-bold text-white" style={{ fontSize: 15, letterSpacing: 0.2 }}>
            #{certNumStr}
          </span>
        </div>

        {/* secondary caption — one small, legible line pinned near the bottom */}
        <p className="text-white/60 text-xs leading-snug mt-auto whitespace-nowrap">
          Owns #{certNumStr} of {album.title} by {album.artist}
        </p>
      </div>

      {overlay}
    </div>
  );
}

export function StoriesBordered() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <BorderedStoryCard />
    </div>
  );
}
