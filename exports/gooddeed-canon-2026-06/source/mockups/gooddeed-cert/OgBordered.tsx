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
// ?album switches the sample: default ("fernando") or "california" (TOMMYGUNN).
import "./_group.css";

const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const ORANGE = "var(--brand-orange)";

const ALBUMS = {
  fernando: {
    art: "/__mockup/images/album-guitar-as-a-voice.png",
    title: "Guitar as a Voice",
    artist: "Fernando Perdomo",
    owner: "Jordan Ellis",
    num: "07",
  },
  california: {
    art: "/__mockup/images/album-california-way.png",
    title: "California Way",
    artist: "TOMMYGUNN",
    owner: "Jordan Ellis",
    num: "12",
  },
} as const;

export function OgBordered() {
  const params = new URLSearchParams(window.location.search);
  const pill = params.get("pill") ?? "1";
  const showBrand = pill !== "0";
  const showNum = pill !== "logo" && pill !== "0";
  const brand = params.get("brand") ?? "pill"; // "pill" chip | "gradient" bottom scrim
  const pos = params.get("pos") ?? "left"; // gradient logo corner: "left" | "right"
  const logoH = Number(params.get("logo") ?? (brand === "gradient" ? 54 : 40));
  const album = ALBUMS[(params.get("album") as keyof typeof ALBUMS) ?? "fernando"] ?? ALBUMS.fernando;
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
            <img src={album.art} alt="" className="w-full h-full block object-cover object-top" />

            {/* Gradient treatment: darken the bottom of the art and float the
                (larger) logo directly on it — no pill chrome. */}
            {showBrand && brand === "gradient" && (
              <>
                <div
                  className="absolute inset-x-0 bottom-0"
                  style={{
                    height: "55%",
                    background:
                      "linear-gradient(180deg, rgba(0,6,43,0) 0%, rgba(0,6,43,0.5) 58%, rgba(0,6,43,0.92) 100%)",
                  }}
                />
                <img
                  src={LOGO}
                  alt="GoodTunes"
                  className="absolute"
                  style={{ [pos === "right" ? "right" : "left"]: 22, bottom: 18, height: logoH, width: "auto", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
                />
              </>
            )}

            {/* Pill treatment: navy chip with logo (+ optional #NN). */}
            {showBrand && brand === "pill" && (
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
                <img src={LOGO} alt="GoodTunes" style={{ height: logoH, width: "auto", display: "block" }} />
                {showNum && (
                  <>
                    <span style={{ width: 1, height: Math.round(logoH * 0.8), background: "rgba(255,255,255,0.3)" }} />
                    <span className="font-bold text-white" style={{ fontSize: Math.round(logoH * 0.62), letterSpacing: 0.2 }}>
                      #{album.num}
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
            {album.title} by {album.artist}
          </p>
          <p className="font-bold leading-snug" style={{ fontSize: 21, color: "rgba(255,255,255,0.55)" }}>
            {album.owner} owns No. {album.num} · GoodDeed®
          </p>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
            my.goodtunes.music
          </p>
        </div>
      </div>
    </div>
  );
}
