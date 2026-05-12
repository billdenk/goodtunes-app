import { useState, useRef, useEffect, forwardRef, type Ref } from "react";
import { Album } from "@/data/musicData";
import certBgUrl from "@assets/Digital_GoodDeed_-_Nick_Carter_1778545442175.svg";

interface GoodDeedCertificateProps {
  album: Album;
  ownerName: string;
  certificateNumber?: number;
  certificateNumbers?: number[];
  onClose: () => void;
}

export function GoodDeedCertificate({
  album,
  ownerName,
  certificateNumber,
  certificateNumbers,
  onClose,
}: GoodDeedCertificateProps) {
  const certs =
    certificateNumbers && certificateNumbers.length > 0
      ? certificateNumbers
      : [certificateNumber ?? 1];
  const [shared, setShared] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const safeIdx = Math.min(Math.max(activeIdx, 0), certs.length - 1);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el || cardRefs.current.length === 0) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    let nearestDist = Infinity;
    cardRefs.current.forEach((card, i) => {
      if (!card) return;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - center);
      if (dist < nearestDist) {
        nearest = i;
        nearestDist = dist;
      }
    });
    if (nearest !== activeIdx) setActiveIdx(nearest);
  };

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    const card = cardRefs.current[i];
    if (!el || !card) return;
    const target = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const padded = (n: number) => n.toString().padStart(2, "0");

  const handleShare = async () => {
    const n = padded(certs[safeIdx]);
    const text = `I own No. ${n} of "${album.title}" by ${album.artist} — verified by GoodTunes® GoodDeed®`;
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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="GoodDeed certificate"
    >
      <div
        className="absolute inset-0 bg-black/75"
        style={{ backdropFilter: "blur(8px)" }}
        onClick={onClose}
      />

      <div className="relative w-full max-w-[400px] z-10 animate-slide-up">
        {/* Close + Share controls */}
        <div className="flex items-center justify-between mb-3 px-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close certificate"
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
            className="h-9 px-4 rounded-full flex items-center justify-center gap-1.5 text-sm font-semibold active:opacity-70 transition-opacity"
            style={{
              background: shared ? "#4AFFCA" : "rgba(255,255,255,0.12)",
              color: shared ? "#00062B" : "#fff",
              backdropFilter: "blur(20px)",
            }}
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

        {/* Carousel */}
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ scrollPaddingLeft: 20, WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex gap-3 px-5" style={{ paddingRight: certs.length > 1 ? 44 : 20 }}>
            {certs.map((num, i) => (
              <CertCard
                key={num}
                ref={(el) => { cardRefs.current[i] = el; }}
                album={album}
                ownerName={ownerName}
                num={num}
              />
            ))}
          </div>
        </div>

        {/* Dot indicators */}
        {certs.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {certs.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to certificate ${i + 1}`}
                className="rounded-full transition-all"
                style={{
                  width: i === safeIdx ? 18 : 6,
                  height: 6,
                  background: i === safeIdx ? "#fff" : "rgba(255,255,255,0.35)",
                }}
                data-testid={`dot-cert-${i}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface CertCardProps {
  album: Album;
  ownerName: string;
  num: number;
}

const CertCard = forwardRef(function CertCard(
  { album, ownerName, num }: CertCardProps,
  ref: Ref<HTMLDivElement>,
) {
  const certNumStr = num.toString().padStart(2, "0");
  return (
    <div
      ref={ref}
      className="flex-shrink-0 snap-start rounded-3xl overflow-hidden shadow-2xl"
      style={{
        width: "100%",
        aspectRatio: "9 / 16",
        boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
        backgroundColor: "#00062B",
        backgroundImage: `url(${certBgUrl})`,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Top: full-bleed artwork */}
      <div className="relative w-full" style={{ height: "50%" }}>
        <img src={album.artwork} alt={album.title} className="w-full h-full object-cover" />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 70%, rgba(13,32,96,0.4) 100%)" }}
        />
      </div>

      {/* Bottom: SVG ambient background shows through */}
      <div
        className="relative w-full px-6 py-6 flex flex-col"
        style={{ height: "50%" }}
      >
        <div>
          <p className="text-white text-xl font-bold leading-tight">{album.title}</p>
          <p className="text-white/65 text-sm mt-0.5">{album.artist}</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
          <p className="text-white/75 text-[13px]">This GoodDeed® certifies that</p>
          <p className="text-white text-2xl font-bold mt-1.5 leading-tight">{ownerName}</p>
          <p className="text-white/75 text-[13px] mt-1.5">
            owns number {certNumStr} of this series.
          </p>
        </div>

        <div className="flex items-end justify-between">
          <p
            className="text-white text-3xl font-bold leading-none"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            No. {certNumStr}
          </p>
          <img
            src="/goodtunes-logo-white.png"
            alt="GoodTunes"
            className="h-9 w-auto object-contain"
          />
        </div>
      </div>
    </div>
  );
});
