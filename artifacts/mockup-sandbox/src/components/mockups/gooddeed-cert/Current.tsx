// Faithful copy of the real fan GoodDeed social card (CertCard) from
// client/src/components/GoodDeedCertificate.tsx, rendered with sample data so
// it can be previewed on the canvas without a fan login. 1:1.5 portrait.
const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const ART = "/__mockup/images/sample-album-art.png";
const OWNER_PHOTO = "/__mockup/images/sample-owner-photo.png";

const album = { title: "Wildflower", artist: "Marlowe Vance" };
const ownerName = "Jordan Ellis";
const certNumStr = "07";

export function Current() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "#05030f" }}
    >
      <div
        className="rounded-3xl overflow-hidden flex flex-col"
        style={{
          width: "min(86vw, 340px)",
          minHeight: "calc(min(86vw, 340px) * 1.5)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
          backgroundColor: "#00062B",
        }}
      >
        {/* Top: square album art, full-bleed */}
        <div className="relative w-full aspect-square flex-shrink-0">
          <img src={ART} alt={album.title} className="w-full h-full object-cover block" />
        </div>

        {/* Bottom: title + artist, centred ownership statement, serial + mark */}
        <div className="relative w-full flex-1 px-5 py-4 flex flex-col" style={{ backgroundColor: "#00062B" }}>
          <div className="min-w-0">
            <p className="text-white text-lg font-bold leading-tight truncate">{album.title}</p>
            <p className="text-white/60 text-sm leading-tight truncate mt-0.5">{album.artist}</p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-1">
            <img
              src={OWNER_PHOTO}
              alt=""
              className="w-12 h-12 rounded-full object-cover border border-white/20"
            />
            <p className="text-white/70 text-sm leading-snug">This GoodDeed® certifies that</p>
            <p className="text-white text-xl font-bold leading-tight">{ownerName}</p>
            <p className="text-white/70 text-sm leading-snug">owns No. {certNumStr} of this series.</p>
          </div>

          <div className="flex items-end justify-between gap-3">
            <p className="text-white text-3xl font-bold leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
              No. {certNumStr}
            </p>
            <img src={LOGO} alt="GoodTunes" className="h-7 w-auto object-contain flex-shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
