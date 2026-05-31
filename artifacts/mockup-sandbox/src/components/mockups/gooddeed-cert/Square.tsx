// Faithful copy of the SHIPPED 1:1 square GoodDeed social card (CertCard
// shape="square") from client/src/components/GoodDeedCertificate.tsx, rendered
// with sample data so it can be previewed on the canvas without a fan login.
// Exports as 1080x1080; previewed here at w = 360 with the same u = w/1080 math.
import "./_group.css";

const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const ART = "/__mockup/images/sample-album-art.png";
const OWNER_PHOTO = "/__mockup/images/sample-owner-photo.png";

const album = { title: "Wildflower", artist: "Marlowe Vance" };
const ownerName = "Jordan Ellis";
const certNumStr = "07";

const w = 360;
const u = w / 1080;
const bw = (px: number) => `${Math.max(1, px * u)}px`;

export function Square() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <div
        className="overflow-hidden flex flex-col"
        style={{
          width: w,
          height: w,
          borderRadius: 72 * u,
          boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
          backgroundColor: "var(--brand-bg)",
        }}
      >
        {/* Top: album-art band, full-bleed */}
        <div className="relative w-full flex-shrink-0" style={{ height: w * 0.5 }}>
          <img src={ART} alt={album.title} className="w-full h-full object-cover block" />
        </div>

        {/* Bottom: legible, share-friendly panel */}
        <div
          className="relative w-full flex-1 flex flex-col"
          style={{
            paddingLeft: 56 * u,
            paddingRight: 56 * u,
            paddingTop: 40 * u,
            paddingBottom: 40 * u,
            backgroundColor: "var(--brand-bg)",
          }}
        >
          {/* Album title + artist */}
          <div className="min-w-0">
            <p className="text-white font-bold leading-tight truncate" style={{ fontSize: 48 * u }}>
              {album.title}
            </p>
            <p className="text-white/60 leading-tight truncate" style={{ fontSize: 30 * u, marginTop: 4 * u }}>
              {album.artist}
            </p>
          </div>

          {/* Centred ownership statement */}
          <div
            className="flex-1 flex flex-col items-center justify-center text-center"
            style={{ gap: 16 * u, paddingLeft: 8 * u, paddingRight: 8 * u }}
          >
            <img
              src={OWNER_PHOTO}
              alt=""
              className="rounded-full object-cover"
              style={{ width: 120 * u, height: 120 * u, border: `${bw(3)} solid rgba(255,255,255,0.2)` }}
            />
            <p className="text-white/70 leading-snug" style={{ fontSize: 30 * u }}>This GoodDeed® certifies that</p>
            <p className="text-white font-bold leading-tight" style={{ fontSize: 48 * u }}>{ownerName}</p>
            <p className="text-white/70 leading-snug" style={{ fontSize: 30 * u }}>owns No. {certNumStr} of this series.</p>
          </div>

          {/* Serial + GoodTunes mark */}
          <div className="flex items-end justify-between" style={{ gap: 24 * u }}>
            <p
              className="text-white font-bold leading-none"
              style={{ fontSize: 80 * u, fontVariantNumeric: "tabular-nums" }}
            >
              No. {certNumStr}
            </p>
            <img src={LOGO} alt="GoodTunes" className="w-auto object-contain flex-shrink-0" style={{ height: 56 * u }} />
          </div>
        </div>
      </div>
    </div>
  );
}
