// HYBRID of OgNative: the image is still mostly album art with a NATIVE caption
// below, but we BAKE one small chip into the bottom-right corner of the art —
// GoodTunes logo + cert number. Because it's baked into the image, it survives
// into every messaging app's preview (unlike a logo, which a native caption
// can't carry). All the wordy text (album / owner / domain) still rides as the
// native caption, so there's no doubled text.
import "./_group.css";

const ART = "/__mockup/images/album-guitar-as-a-voice.png";
const LOGO = "/__mockup/images/goodtunes-logo-white.png";

export function OgNativeChip() {
  const w = 560;
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <div
        className="overflow-hidden"
        style={{ width: w, borderRadius: 22, boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}
      >
        {/* Image portion = album art with a single baked chip, bottom-right */}
        <div className="relative w-full" style={{ height: 372 }}>
          <img src={ART} alt="" className="w-full h-full block object-cover object-top" />
          <div
            className="absolute flex items-center gap-3"
            style={{
              right: 20,
              bottom: 20,
              padding: "13px 22px",
              borderRadius: 999,
              background: "rgba(0,6,43,0.62)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
            }}
          >
            <img src={LOGO} alt="GoodTunes" style={{ height: 28, width: "auto", display: "block" }} />
            <span style={{ width: 1, height: 24, background: "rgba(255,255,255,0.3)" }} />
            <span className="font-bold text-white" style={{ fontSize: 24, letterSpacing: 0.2 }}>
              #07
            </span>
          </div>
        </div>

        {/* Native caption bar drawn by the messaging app — plain text only */}
        <div style={{ background: "#2b2b2d", padding: "16px 18px 18px" }}>
          <p className="text-white font-bold leading-snug" style={{ fontSize: 21 }}>
            Guitar as a Voice by Fernando Perdomo
          </p>
          <p className="font-bold leading-snug" style={{ fontSize: 21, color: "rgba(255,255,255,0.55)" }}>
            Jordan Ellis owns No. 07 · GoodDeed®
          </p>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
            my.goodtunes.music
          </p>
        </div>
      </div>
    </div>
  );
}
