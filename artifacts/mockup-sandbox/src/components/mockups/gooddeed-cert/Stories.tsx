// PROPOSED design (Task #811): an Instagram-Stories-shaped (9:16) version of
// the fan GoodDeed card, sized to fill a phone story / 1080x1920 export.
// Same data as the square social card, re-laid-out full-bleed with the album
// art as an immersive backdrop, brand navy gradient, and a mint verified mark.
const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const ART = "/__mockup/images/sample-album-art.png";
const OWNER_PHOTO = "/__mockup/images/sample-owner-photo.png";

const album = { title: "Wildflower", artist: "Marlowe Vance" };
const ownerName = "Jordan Ellis";
const certNumStr = "07";

export function Stories() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <div
        className="relative rounded-[28px] overflow-hidden flex flex-col"
        style={{
          width: "min(92vw, 360px)",
          aspectRatio: "9 / 16",
          boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
          backgroundColor: "#00062B",
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
              "linear-gradient(180deg, rgba(0,6,43,0.55) 0%, rgba(0,6,43,0.35) 38%, rgba(0,6,43,0.85) 72%, #00062B 100%)",
          }}
        />

        {/* Foreground content */}
        <div className="relative flex flex-col h-full px-7 pt-8 pb-7">
          {/* Verified pill */}
          <div className="flex justify-center">
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ background: "rgba(74,255,202,0.14)", border: "1px solid rgba(74,255,202,0.35)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4AFFCA" strokeWidth="3" strokeLinecap="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="text-[11px] font-bold tracking-wide" style={{ color: "#4AFFCA" }}>
                VERIFIED OWNERSHIP
              </span>
            </div>
          </div>

          {/* Hero album art */}
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ width: "62%", aspectRatio: "1/1", boxShadow: "0 18px 50px rgba(0,0,0,0.6)" }}
            >
              <img src={ART} alt={album.title} className="w-full h-full object-cover block" />
            </div>
            <div className="text-center">
              <p className="text-white text-2xl font-bold leading-tight">{album.title}</p>
              <p className="text-white/65 text-base leading-tight mt-1">{album.artist}</p>
            </div>
          </div>

          {/* Ownership statement */}
          <div className="flex flex-col items-center text-center gap-2.5">
            <img src={OWNER_PHOTO} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-white/25" />
            <p className="text-white/70 text-sm leading-snug">This GoodDeed® certifies that</p>
            <p className="text-white text-xl font-bold leading-tight">{ownerName}</p>
            <p className="text-white/70 text-sm leading-snug">owns this copy of the series.</p>

            {/* Giant serial */}
            <p
              className="font-bold leading-none mt-2"
              style={{ fontVariantNumeric: "tabular-nums", fontSize: "56px", color: "#4AFFCA" }}
            >
              No. {certNumStr}
            </p>
          </div>

          {/* Footer mark */}
          <div className="flex items-center justify-center mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            <img src={LOGO} alt="GoodTunes" className="h-8 w-auto object-contain" />
          </div>
        </div>
      </div>
    </div>
  );
}
