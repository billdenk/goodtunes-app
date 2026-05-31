// SAFE-ZONE STUDY of the GoodDeed Instagram Story. Same card content as
// Stories.tsx, but rendered TRUE full-bleed 9:16 with Instagram's own UI mocked
// on top so we can see exactly what gets covered. The shaded pink bands are the
// ~13% top / ~16% bottom strips Instagram reserves for its chrome (profile row
// up top, "Send message" + reactions along the bottom). Keep album art, owner
// name, and the serial inside the clear center band.
import "./_group.css";

const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const ART = "/__mockup/images/album-guitar-as-a-voice.png";
const OWNER_PHOTO = "/__mockup/images/sample-owner-photo.png";

const album = { title: "Guitar as a Voice", artist: "Fernando Perdomo" };
const ownerName = "Jordan Ellis";
const certNumStr = "07";

const TOP_SAFE = "13%";
const BOTTOM_SAFE = "16%";

export function StoriesSafeZone() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
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

        {/* ===== Foreground content, confined to the SAFE center band ===== */}
        <div
          className="absolute left-0 right-0 flex flex-col px-6"
          style={{ top: TOP_SAFE, bottom: BOTTOM_SAFE }}
        >
          {/* Verified pill */}
          <div className="flex justify-center pt-2">
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
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ width: "58%", aspectRatio: "1/1", boxShadow: "0 18px 50px rgba(0,0,0,0.6)" }}
            >
              <img src={ART} alt={album.title} className="w-full h-full object-cover block" />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-bold leading-tight">{album.title}</p>
              <p className="text-white/65 text-sm leading-tight mt-1">{album.artist}</p>
            </div>
          </div>

          {/* Ownership statement */}
          <div className="flex flex-col items-center text-center gap-2">
            <img src={OWNER_PHOTO} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white/25" />
            <p className="text-white/70 text-xs leading-snug">This GoodDeed® certifies that</p>
            <p className="text-white text-lg font-bold leading-tight">{ownerName}</p>
            <p
              className="font-bold leading-none mt-1"
              style={{ fontVariantNumeric: "tabular-nums", fontSize: "44px", color: "var(--brand-mint)" }}
            >
              No. {certNumStr}
            </p>
          </div>

          {/* Footer mark */}
          <div className="flex items-center justify-center mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            <img src={LOGO} alt="GoodTunes" className="h-6 w-auto object-contain" />
          </div>
        </div>

        {/* ===== TOP unsafe band — Instagram profile chrome ===== */}
        <div
          className="absolute left-0 right-0 top-0 flex flex-col justify-between"
          style={{
            height: TOP_SAFE,
            background: "rgba(255,84,112,0.16)",
            borderBottom: "1.5px dashed rgba(255,84,112,0.7)",
          }}
        >
          {/* story progress bar */}
          <div className="flex gap-1 px-3 pt-2">
            <span className="flex-1 h-[3px] rounded-full bg-white/85" />
            <span className="flex-1 h-[3px] rounded-full bg-white/30" />
            <span className="flex-1 h-[3px] rounded-full bg-white/30" />
          </div>
          {/* profile row */}
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-white/30 border border-white/50" />
              <span className="text-white text-xs font-semibold">goodtunes.music</span>
              <span className="text-white/60 text-xs">now</span>
            </div>
            <span className="text-white text-lg leading-none">×</span>
          </div>
          <span className="absolute right-2 top-1 text-[9px] font-bold tracking-wide" style={{ color: "rgba(255,84,112,0.95)" }}>
            IG COVERS THIS
          </span>
        </div>

        {/* ===== BOTTOM unsafe band — Instagram reply / reaction chrome ===== */}
        <div
          className="absolute left-0 right-0 bottom-0 flex items-center gap-2 px-3"
          style={{
            height: BOTTOM_SAFE,
            background: "rgba(255,84,112,0.16)",
            borderTop: "1.5px dashed rgba(255,84,112,0.7)",
          }}
        >
          <div className="flex-1 h-9 rounded-full border border-white/50 flex items-center px-3">
            <span className="text-white/70 text-xs">Send message</span>
          </div>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          <span className="absolute right-2 top-1 text-[9px] font-bold tracking-wide" style={{ color: "rgba(255,84,112,0.95)" }}>
            IG COVERS THIS
          </span>
        </div>
      </div>
    </div>
  );
}
