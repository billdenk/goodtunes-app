// PROPOSED redesign of the 1200×630 GoodDeed link-preview (Open Graph) image,
// per Bill's direction: lean toward the native album-link card (the "Fernando"
// look) — full-bleed album art up top, then a compact caption strip carrying
// the headline (album by artist), the ownership line, and at most a small
// "Verified" chip. Compare against the current split-panel version
// (server/certOgImage.ts) that's live today.
//
// Exports at 1200×630; previewed here at w = 600 with u = w/1200.
import "./_group.css";

const ART = "/figmaAssets/artworks-000451097049-kerecr-t500x500-2.png";
const LOGO = "/__mockup/images/goodtunes-logo-white.png";

const album = { title: "Guitar as a Voice", artist: "Fernando Perdomo" };
const ownerName = "Jordan Ellis";
const certNumStr = "07";

const w = 600;
const h = w * (630 / 1200); // 315
const u = w / 1200;

export function OgRedesign() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <div
        className="overflow-hidden flex flex-col"
        style={{
          width: w,
          height: h,
          borderRadius: 28 * u,
          boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
          backgroundColor: "var(--brand-bg)",
        }}
      >
        {/* Top: full-width album-art band (cover-fit), with a small Verified chip */}
        <div className="relative w-full flex-shrink-0" style={{ height: 432 * u }}>
          <img src={ART} alt={album.title} className="w-full h-full object-cover block" />
          <div
            className="absolute flex items-center"
            style={{
              top: 24 * u,
              left: 24 * u,
              gap: 8 * u,
              padding: `${10 * u}px ${18 * u}px`,
              borderRadius: 9999,
              background: "rgba(0,6,43,0.66)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            <span style={{ color: "var(--brand-mint)", fontSize: 24 * u, lineHeight: 1 }}>✓</span>
            <span
              className="text-white font-semibold"
              style={{ fontSize: 22 * u, letterSpacing: "0.06em" }}
            >
              VERIFIED
            </span>
          </div>
        </div>

        {/* Bottom: compact caption strip — headline + ownership line */}
        <div
          className="relative w-full flex-1 flex items-center justify-between"
          style={{
            paddingLeft: 44 * u,
            paddingRight: 44 * u,
            gap: 28 * u,
            backgroundColor: "var(--brand-bg)",
          }}
        >
          <div className="min-w-0">
            <p className="text-white font-bold leading-tight truncate" style={{ fontSize: 40 * u }}>
              {album.title}
              <span className="text-white/55 font-normal"> by {album.artist}</span>
            </p>
            <p className="text-white/75 leading-tight truncate" style={{ fontSize: 30 * u, marginTop: 10 * u }}>
              {ownerName} owns No. {certNumStr} · GoodDeed®
            </p>
          </div>
          <img
            src={LOGO}
            alt="GoodTunes"
            className="w-auto object-contain flex-shrink-0"
            style={{ height: 96 * u }}
          />
        </div>
      </div>
    </div>
  );
}
