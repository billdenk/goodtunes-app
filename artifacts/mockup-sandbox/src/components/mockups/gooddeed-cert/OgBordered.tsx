// ORANGE-BORDER variant of the texting / link-preview (Bill's sketch). Same
// model as OgNativeChip — album art on top, NATIVE iMessage caption below (the
// messaging app draws title/owner/domain, so we don't style those) — but we
// FRAME the album art in GoodTunes orange so the texted link carries the same
// GoodDeed signature as the approved Story. The orange only wraps the art (the
// pixels we bake); the dark caption strip simulates the native preview.
//
// ?pill controls the baked chip: "0" = none, "logo" = GoodTunes logo only
// (drops the redundant #NN, since the native caption already states the number),
// default ("1") = full [GoodTunes | #NN] chip.
import "./_group.css";

const ART = "/__mockup/images/album-guitar-as-a-voice.png";
const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const ORANGE = "var(--brand-orange)";

export function OgBordered() {
  const pill = new URLSearchParams(window.location.search).get("pill") ?? "1";
  const showPill = pill !== "0";
  const showNum = pill !== "logo" && pill !== "0";
  const w = 560;
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <div
        className="overflow-hidden"
        style={{ width: w, borderRadius: 22, boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}
      >
        {/* Orange-framed album art — the only part we actually bake into the image */}
        <div style={{ background: ORANGE, padding: 14 }}>
          <div className="relative w-full overflow-hidden" style={{ height: 372, borderRadius: 10 }}>
            <img src={ART} alt="" className="w-full h-full block object-cover object-top" />
            {showPill && (
              <div
                className="absolute flex items-center gap-3"
                style={{
                  right: 18,
                  bottom: 18,
                  padding: "12px 20px",
                  borderRadius: 999,
                  background: "rgba(0,6,43,0.62)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
                }}
              >
                <img src={LOGO} alt="GoodTunes" style={{ height: 34, width: "auto", display: "block" }} />
                {showNum && (
                  <>
                    <span style={{ width: 1, height: 28, background: "rgba(255,255,255,0.3)" }} />
                    <span className="font-bold text-white" style={{ fontSize: 22, letterSpacing: 0.2 }}>
                      #07
                    </span>
                  </>
                )}
              </div>
            )}
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
