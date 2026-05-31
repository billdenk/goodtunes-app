// ALTERNATIVE to OgRedesign: the "pure Fernando" model Bill described — the
// image is ONLY the album art, and ALL text is the NATIVE caption the
// messaging app draws (title + domain). We do NOT control that caption's
// styling, so: no Verified chip, no GoodTunes logo, and the ownership line can
// only ride along inside the title text (and many apps, incl. iMessage, show
// just the title + domain and may truncate a second line).
//
// This mock simulates the iMessage link bubble so the tradeoff is visible.
import "./_group.css";

const ART = "/__mockup/images/sample-album-art.png";

export function OgNative() {
  const w = 560;
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <div
        className="overflow-hidden"
        style={{ width: w, borderRadius: 22, boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}
      >
        {/* Image portion = album art ONLY (no chip, no logo, no baked text) */}
        <img src={ART} alt="" className="w-full block object-cover" style={{ height: 372 }} />

        {/* Native caption bar drawn by the messaging app — plain text only */}
        <div style={{ background: "#2b2b2d", padding: "16px 18px 18px" }}>
          <p className="text-white font-bold leading-snug" style={{ fontSize: 21 }}>
            Wildflower by Marlowe Vance
          </p>
          <p className="font-bold leading-snug" style={{ fontSize: 21, color: "rgba(255,255,255,0.55)" }}>
            Jordan Ellis owns No. 07 · GoodDeed®
          </p>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
            goodtunes.replit.app
          </p>
        </div>
      </div>
    </div>
  );
}
