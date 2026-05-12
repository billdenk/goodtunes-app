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
  const certNumStr = certificateNumber.toString().padStart(2, "0");

  const handleShare = async () => {
    const text = `I own No. ${certNumStr} of "${album.title}" by ${album.artist} — verified by GoodTunes® GoodDeed®`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My GoodDeed® Certificate", text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/75" style={{ backdropFilter: "blur(8px)" }} onClick={onClose} />

      <div className="relative w-full max-w-[360px] z-10 animate-slide-up">
        {/* Close + Share row above the card */}
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
            style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(20px)" }}
            data-testid="button-close-certificate"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="h-9 px-4 rounded-full flex items-center justify-center gap-1.5 text-white text-sm font-semibold active:opacity-70 transition-opacity"
            style={{ background: shared ? "#4AFFCA" : "rgba(255,255,255,0.12)", color: shared ? "#00062B" : "#fff", backdropFilter: "blur(20px)" }}
            data-testid="button-share-certificate"
          >
            {shared ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
                </svg>
                Share
              </>
            )}
          </button>
        </div>

        {/* Certificate card — 9:16 keepsake */}
        <div
          className="rounded-3xl overflow-hidden shadow-2xl"
          style={{ aspectRatio: "9 / 16", boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}
        >
          {/* Top: full-bleed artwork (top half) */}
          <div className="relative w-full" style={{ height: "50%" }}>
            <img src={album.artwork} alt={album.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 70%, rgba(13, 32, 96, 0.4) 100%)" }} />
          </div>

          {/* Bottom: gradient panel */}
          <div
            className="relative w-full px-6 py-6 flex flex-col"
            style={{
              height: "50%",
              background: "linear-gradient(135deg, #1B3A8C 0%, #4A1E8F 60%, #2A1670 100%)",
            }}
          >
            {/* Top-left: album + artist */}
            <div>
              <p className="text-white text-xl font-bold leading-tight">{album.title}</p>
              <p className="text-white/65 text-sm mt-0.5">{album.artist}</p>
            </div>

            {/* Center: ownership statement */}
            <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
              <p className="text-white/75 text-[13px]">This GoodDeed® certifies that</p>
              <p className="text-white text-2xl font-bold mt-1.5 leading-tight">{ownerName}</p>
              <p className="text-white/75 text-[13px] mt-1.5">
                owns number {certNumStr} of this series.
              </p>
            </div>

            {/* Bottom row: No. XX + GoodTunes mark */}
            <div className="flex items-end justify-between">
              <p className="text-white text-3xl font-bold leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
                No. {certNumStr}
              </p>
              <div className="flex flex-col items-end leading-none">
                <p className="text-white text-[15px] font-bold tracking-tight">Good</p>
                <p className="text-white text-[15px] font-bold tracking-tight">Tunes</p>
                <p className="text-white/45 text-[7px] mt-0.5 tracking-wider">POWERED BY GoGoode</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
