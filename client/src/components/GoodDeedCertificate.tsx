import { useState } from "react";
import { Album } from "@/data/musicData";

interface GoodDeedCertificateProps {
  album: Album;
  ownerName: string;
  certificateNumber: number;
  onClose: () => void;
}

export function GoodDeedCertificate({ album, ownerName, certificateNumber, onClose }: GoodDeedCertificateProps) {
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    const text = `I own No. ${certificateNumber.toString().padStart(2, "0")} of "${album.title}" by ${album.artist} — verified by GoodTunes® GoodDeed™`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My GoodDeed® Certificate", text });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  const certNumStr = certificateNumber.toString().padStart(2, "0");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[400px] z-10 pb-8 px-4 animate-slide-up">
        <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: "linear-gradient(180deg, #0a1540 0%, #000820 100%)" }}>
          <div className="relative h-[280px] overflow-hidden">
            <img
              src={album.artwork}
              alt={album.title}
              className="w-full h-full object-cover"
              style={{ filter: "grayscale(30%) brightness(0.85)" }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(0,8,32,0.95) 100%)" }} />
            <div className="absolute bottom-4 left-4 right-4">
              <p className="text-white text-3xl font-bold leading-tight">{album.title}</p>
              <p className="text-white/70 text-sm mt-1">{album.artist}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-5 py-5" style={{ background: "linear-gradient(135deg, #0D2060 0%, #1a0a5e 50%, #0D2060 100%)" }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-white/50 text-[10px] uppercase tracking-widest font-semibold mb-1">GoodDeed® Certificate</p>
                <p className="text-white/80 text-xs leading-relaxed max-w-[220px]">
                  This GoodDeed® certifies that
                </p>
                <p className="text-white text-xl font-bold mt-1">{ownerName}</p>
                <p className="text-white/80 text-xs mt-1">
                  owns number{" "}
                  <span className="text-[#4AFFCA] font-semibold">
                    {certNumStr}
                  </span>{" "}
                  of this series.
                </p>
              </div>
              <div className="text-right">
                <p className="text-white/40 text-[10px] uppercase tracking-wider">No.</p>
                <p className="text-white text-5xl font-bold leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {certNumStr}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center">
                <img src="/figmaAssets/--.svg" alt="GoodTunes" className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-white/40 text-[9px] uppercase tracking-wider">Rock + GoodTunes Release {album.year}</p>
                <p className="text-white/60 text-[10px]">Digital provenance confirmed by GoodDeed™</p>
              </div>
              <div className="w-12 h-12 bg-white rounded p-1 flex-shrink-0">
                <div className="w-full h-full grid grid-cols-4 grid-rows-4 gap-0.5">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-[1px]"
                      style={{
                        background: [0,2,3,5,8,10,11,13,14].includes(i) ? "#000" : "#fff",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 bg-[#000820] flex gap-3">
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 py-3 rounded-2xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
              style={{
                background: shared ? "#4AFFCA" : "linear-gradient(135deg, #319ED8, #7F10A7)",
                color: shared ? "#000" : "#fff",
              }}
            >
              {shared ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                  </svg>
                  Share to Social
                </>
              )}
            </button>
            <button
              type="button"
              className="px-4 py-3 rounded-2xl border border-white/20 text-white/70 text-sm flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
