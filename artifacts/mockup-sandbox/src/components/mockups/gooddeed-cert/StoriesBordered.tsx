// ALTERNATE Story concept (Bill's sketch): instead of full-bleed art, FRAME the
// card in GoodTunes orange so the format is instantly recognizable as a
// GoodDeed share. The orange border pushes everything down a touch; the album
// art is shown UNCROPPED as a clean square; the owner's avatar is pulled UP so
// it straddles the seam between the art and the solid navy below (their face
// bridges the transition); and the [GoodTunes | #NN] number pill moves to the
// BOTTOM — reading order is Owner → what they bought → which number.
//
// Colors/scale follow the locked tokens (avatar 78, name 30, chip logo 24 /
// divider 19 / #NN 15). The orange is the OFFICIAL GoodTunes logo orange
// (#FF7C06 / rgb(255,124,6)), taken from the 2025 GoodTunes logo SVG.
import "./_group.css";
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

export function StoriesBordered() {
  const { art, ownerPhoto, album, ownerName, certNumStr } = data;

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          width: "min(92vw, 340px)",
          aspectRatio: "9 / 16",
          border: `15px solid ${GOODTUNES_ORANGE}`,
          borderRadius: 30,
          backgroundColor: "var(--brand-bg)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* Uncropped square album art at the top (square cover → square box, no crop) */}
        <div className="relative w-full shrink-0" style={{ aspectRatio: "1 / 1" }}>
          <img src={art} alt={album.title} className="w-full h-full object-cover block" />
          {/* gentle navy blend at the very bottom edge so the seam isn't a razor line */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: "16%",
              background: "linear-gradient(180deg, rgba(0,6,43,0) 0%, rgba(0,6,43,0.85) 100%)",
            }}
          />
        </div>

        {/* Lower section: avatar straddles the seam, then statement, then pill pinned bottom */}
        <div className="flex-1 flex flex-col items-center text-center px-6" style={{ paddingBottom: 22 }}>
          <div
            className="rounded-full overflow-hidden shrink-0"
            style={{
              width: 78,
              height: 78,
              marginTop: -39, // half the avatar overlaps up onto the art
              border: "2px solid rgba(255,255,255,0.85)",
              boxShadow: "0 0 0 4px var(--brand-bg), 0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            <img src={ownerPhoto} alt={ownerName} className="w-full h-full object-cover block" />
          </div>

          <p className="text-white/55 text-xs leading-snug mt-4">This GoodDeed® certifies that</p>
          <p className="text-white font-bold leading-tight mt-1.5" style={{ fontSize: 30 }}>
            {ownerName}
          </p>
          <p className="text-white/60 text-sm leading-snug mt-2" style={{ maxWidth: "15rem" }}>
            Owns #{certNumStr} of {album.title}
            <br />
            by {album.artist}
          </p>

          {/* [GoodTunes | #NN] number pill — moved to the bottom */}
          <div
            className="flex items-center"
            style={{
              marginTop: "auto",
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
        </div>
      </div>
    </div>
  );
}
