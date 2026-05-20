import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronLeft,
  Share,
  MoreHorizontal,
  Heart,
  ShoppingBag,
  MessageCircle,
  ChevronRight,
  Truck,
  Shield,
  Check,
  X,
} from "lucide-react";

/**
 * Product page · Martin D-28 — fan-facing product detail mock.
 *
 * Content sourced from martinguitar.com/guitars/standard-series/d-28/
 * (price, copy, spec highlights). Photos: Martin's own Y25D28_{f,b,t,h}.jpg.
 *
 * Self-contained (no @/ imports — sandbox can't reach client/src).
 */

const BG = "#00062B";
const BLUE = "#319ED8";
const PINK = "#FF5470";
const MINT = "#4AFFCA";

const ASSET_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/vendor-assets/martin`;
const LOGO_IMG = `${ASSET_BASE}/logo.jpg`;
const VIEWS = [
  { id: "f", url: `${ASSET_BASE}/d28_f.jpg`, label: "Front" },
  { id: "h", url: `${ASSET_BASE}/d28_h.jpg`, label: "Headstock" },
  { id: "t", url: `${ASSET_BASE}/d28_t.jpg`, label: "Top" },
  { id: "b", url: `${ASSET_BASE}/d28_b.jpg`, label: "Back" },
];

interface SpecRow {
  label: string;
  value: string;
}

// Standard Series D-28 specs, abridged from martinguitar.com.
const SPECS: SpecRow[] = [
  { label: "Body Size", value: "D-14 Fret" },
  { label: "Top", value: "Sitka Spruce" },
  { label: "Back & Sides", value: "East Indian Rosewood" },
  { label: "Bracing", value: "Forward-shifted X-Brace, Scalloped" },
  { label: "Neck", value: "Select Hardwood" },
  { label: "Neck Shape", value: "Modified Low Oval" },
  { label: "Fingerboard", value: "Ebony, Mother of Pearl Dot Inlays" },
  { label: "Scale Length", value: '25.4"' },
  { label: "Nut Width", value: '1 3/4"' },
  { label: "Bridge", value: "Ebony, Bone Pins" },
  { label: "Tuners", value: "Nickel Open Gear" },
  { label: "Strings", value: "Authentic Acoustic Lifespan® 2.0 Medium" },
  { label: "Case", value: "545 Hardshell Case" },
];

export function D28() {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const hero = VIEWS[0];

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: BG,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        {/* ============================ HERO ============================ */}
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "1 / 1.05" }}
        >
          {/* Warm vendor-tinted backdrop */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 35%, #d6b582 0%, #8a5a2a 50%, #2c1808 90%, #140a03 100%)",
            }}
          />

          {/* Floating chrome */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
            <CircularGlass>
              <ChevronLeft className="w-[19px] h-[19px] text-white" />
            </CircularGlass>
            <div className="flex items-center gap-2">
              <CircularGlass>
                <Share className="w-[19px] h-[19px] text-white" />
              </CircularGlass>
              <CircularGlass>
                <MoreHorizontal className="w-[19px] h-[19px] text-white" />
              </CircularGlass>
            </div>
          </div>

          {/* Hero product photo — tap to open lightbox at index 0 */}
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            className="absolute inset-0 z-[1] active:scale-[0.99] transition-transform"
            aria-label="Open photo"
            data-testid="button-hero-d28"
          >
            <img
              src={hero.url}
              alt={`Martin D-28 — ${hero.label}`}
              className="w-full h-full object-contain"
              style={{ objectPosition: "center 55%" }}
              draggable={false}
            />
          </button>

          {/* Bottom fade into page bg */}
          <div
            className="absolute inset-x-0 bottom-0 z-[2] pointer-events-none"
            style={{
              height: "30%",
              background: `linear-gradient(to bottom, rgba(0,6,43,0) 0%, rgba(0,6,43,0.4) 50%, ${BG} 100%)`,
            }}
          />
        </div>

        {/* ============================ TITLE BLOCK ============================ */}
        <div className="px-5 pt-5">
          {/* Brand line */}
          <div className="flex items-center gap-2">
            <div
              className="rounded-md overflow-hidden flex-shrink-0"
              style={{ width: 56, height: 24, background: "#000" }}
            >
              <img
                src={LOGO_IMG}
                alt="C.F. Martin & Co."
                className="w-full h-full object-cover"
                style={{ transform: "scale(1.55)" }}
                draggable={false}
              />
            </div>
            <span
              className="text-[12px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "rgba(235,235,245,0.55)" }}
            >
              C.F. Martin &amp; Co.
            </span>
          </div>

          <h1
            className="text-white font-bold leading-tight tracking-tight mt-3"
            style={{ fontSize: 28 }}
          >
            D-28
          </h1>
          <p
            className="text-[14px] mt-1 leading-snug"
            style={{ color: "rgba(235,235,245,0.7)" }}
          >
            Dreadnought · Standard Series · 2025
          </p>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-white font-bold text-[24px] tabular-nums">
              $3,499<span className="text-[16px]">.99</span>
            </span>
            <span
              className="text-[12px] inline-flex items-center gap-1"
              style={{ color: MINT }}
            >
              <Check className="w-[13px] h-[13px]" />
              In stock at Martin
            </span>
          </div>
        </div>

        {/* ============================ PRIMARY CTAs ============================ */}
        <div className="px-5 pt-5 flex gap-2.5">
          <button
            className="flex-1 h-12 rounded-full text-white text-[14.5px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.94] transition-transform"
            style={{ background: BLUE }}
            data-testid="button-buy-d28"
          >
            <ShoppingBag className="w-[16px] h-[16px]" />
            Buy at martinguitar.com
          </button>
          <button
            className="w-12 h-12 rounded-full inline-flex items-center justify-center active:scale-[0.94] transition-transform"
            style={{ background: "rgba(255,255,255,0.14)" }}
            data-testid="button-favorite-d28"
            aria-label="Save"
          >
            <Heart className="w-[19px] h-[19px] text-white" />
          </button>
          <button
            className="w-12 h-12 rounded-full inline-flex items-center justify-center active:scale-[0.94] transition-transform"
            style={{ background: "rgba(255,255,255,0.14)" }}
            data-testid="button-message-vendor-d28"
            aria-label="Message Martin"
          >
            <MessageCircle className="w-[19px] h-[19px] text-white" />
          </button>
        </div>

        {/* Trust strip */}
        <div className="px-5 pt-4 flex gap-2">
          <TrustChip icon={<Truck className="w-3.5 h-3.5" />} text="Free shipping" />
          <TrustChip icon={<Shield className="w-3.5 h-3.5" />} text="Lifetime warranty" />
        </div>

        {/* ============================ OVERVIEW ============================ */}
        <div className="px-5 pt-7">
          <SectionHeader title="Overview" />
          <p
            className="text-[14px] leading-relaxed mt-3"
            style={{ color: "rgba(235,235,245,0.78)" }}
          >
            The D-28 is the standard by which every other dreadnought is judged.
            A Sitka spruce top paired with East Indian rosewood back and sides,
            and scalloped forward-shifted X-bracing, delivers the bold, projective
            tone with strong bass and clear highs that have defined American
            acoustic music since 1931.
          </p>
          <p
            className="text-[14px] leading-relaxed mt-3"
            style={{ color: "rgba(235,235,245,0.78)" }}
          >
            With antique white binding, an ebony fingerboard with mother-of-pearl
            dot inlays, an ebony bridge with bone pins, and nickel open-gear
            tuners, the D-28 blends timeless craftsmanship with refined
            playability — the most iconic Martin, trusted by artists across
            generations.
          </p>
          <button
            className="mt-2 text-[13px] font-semibold"
            style={{ color: BLUE }}
            data-testid="button-overview-more"
          >
            Read more
          </button>
        </div>

        {/* ============================ PHOTOS ============================ */}
        <div className="px-5 pt-7">
          <div className="flex items-baseline justify-between">
            <SectionHeader title="Photos" />
            <span
              className="text-[12.5px] font-medium tabular-nums"
              style={{ color: "rgba(235,235,245,0.55)" }}
            >
              {VIEWS.length}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {VIEWS.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="aspect-square rounded-xl overflow-hidden relative active:scale-[0.96] transition-transform"
                style={{
                  background:
                    "linear-gradient(180deg, #b88652 0%, #5a2f10 100%)",
                }}
                data-testid={`thumb-photo-${v.id}`}
                aria-label={`Open ${v.label}`}
              >
                <img
                  src={v.url}
                  alt={v.label}
                  className="w-full h-full object-contain"
                  style={{ objectPosition: "center 55%" }}
                  draggable={false}
                />
                <span
                  className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-white text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
                >
                  {v.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ============================ SPECS ============================ */}
        <div className="px-5 pt-7">
          <SectionHeader title="Specs" />
          <div
            className="mt-3 rounded-xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            {SPECS.map((row, i) => (
              <div
                key={row.label}
                className="flex items-start justify-between px-4 py-3"
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid rgba(255,255,255,0.07)",
                }}
                data-testid={`spec-${row.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
              >
                <span
                  className="text-[12.5px] font-medium flex-shrink-0 pr-4"
                  style={{ color: "rgba(235,235,245,0.55)" }}
                >
                  {row.label}
                </span>
                <span className="text-white text-[13px] text-right leading-snug">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ============================ PLAYED BY ============================ */}
        <div className="px-5 pt-7">
          <SectionHeader title="Played by" />
          <p
            className="text-[12.5px] mt-1"
            style={{ color: "rgba(235,235,245,0.55)" }}
          >
            From the artists in your library
          </p>
        </div>
        <div className="pl-5 pt-3 pb-2">
          <div
            className="flex gap-3 overflow-x-auto pb-2 pr-5"
            style={{ scrollbarWidth: "none" }}
          >
            {[
              { id: "ec", name: "Eric Clapton", initial: "E", hue: "#a25b3b" },
              { id: "jm", name: "John Mayer", initial: "J", hue: "#3b6a8a" },
              { id: "nyy", name: "Neil Young", initial: "N", hue: "#8a5b3b" },
              { id: "et", name: "Ed Sheeran", initial: "E", hue: "#a23b4a" },
            ].map((a) => (
              <button
                key={a.id}
                className="flex flex-col items-center flex-shrink-0 active:scale-[0.94] transition-transform"
                style={{ width: 78 }}
                data-testid={`chip-artist-${a.id}`}
              >
                <div
                  className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-white font-bold"
                  style={{
                    background: a.hue,
                    fontSize: 26,
                    boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
                  }}
                >
                  {a.initial}
                </div>
                <span
                  className="text-white text-[11.5px] font-semibold mt-2 text-center leading-tight"
                  style={{ width: 78 }}
                >
                  {a.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ============================ ALSO STOCKED AT ============================ */}
        <div className="px-5 pt-6">
          <SectionHeader title="Also available at" />
        </div>
        <div className="px-5 pt-3 pb-8 space-y-2">
          {[
            { name: "Sweetwater", domain: "sweetwater.com", price: "$3,499.99" },
            { name: "Reverb", domain: "reverb.com", price: "$2,899 — $3,499" },
            { name: "Guitar Center", domain: "guitarcenter.com", price: "$3,499.99" },
          ].map((v) => (
            <button
              key={v.name}
              className="w-full h-14 rounded-xl px-4 flex items-center justify-between active:scale-[0.94] transition-transform"
              style={{ background: "rgba(255,255,255,0.06)" }}
              data-testid={`row-vendor-${v.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-[#00062B] text-[14px] font-bold flex-shrink-0"
                >
                  {v.name.charAt(0)}
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-white text-[13.5px] font-semibold leading-tight truncate">
                    {v.name}
                  </span>
                  <span
                    className="text-[11.5px] leading-tight truncate"
                    style={{ color: "rgba(235,235,245,0.55)" }}
                  >
                    {v.price}
                  </span>
                </div>
              </div>
              <ChevronRight
                className="w-4 h-4 flex-shrink-0"
                style={{ color: "rgba(235,235,245,0.4)" }}
              />
            </button>
          ))}
        </div>

        {/* Footnote */}
        <div className="px-5 pb-10">
          <p
            className="text-[11px] leading-relaxed"
            style={{ color: "rgba(235,235,245,0.35)" }}
          >
            Vendor links are affiliate-aware — when fans buy through GoodTunes,
            a portion supports the artists who chose this gear.
          </p>
        </div>
      </div>

      {/* ============================ LIGHTBOX ============================ */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={VIEWS}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

/* ── Photo Lightbox ─────────────────────────────────────────────────
   Fullscreen swipeable photo viewer, modeled on the artist-photos
   control. Touch-drag or arrow buttons to page between photos; tap the
   X or backdrop to dismiss. */

interface Photo {
  id: string;
  url: string;
  label: string;
}

function PhotoLightbox({
  photos,
  startIndex,
  onClose,
}: {
  photos: Photo[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [dragX, setDragX] = useState(0);
  const startXRef = useRef<number | null>(null);
  const widthRef = useRef<number>(420);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (trackRef.current) {
      widthRef.current = trackRef.current.clientWidth || 420;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")
        setIndex((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, photos.length]);

  const onTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startXRef.current == null) return;
    setDragX(e.touches[0].clientX - startXRef.current);
  };
  const onTouchEnd = () => {
    if (startXRef.current == null) return;
    const threshold = widthRef.current * 0.18;
    if (dragX < -threshold && index < photos.length - 1) setIndex(index + 1);
    else if (dragX > threshold && index > 0) setIndex(index - 1);
    startXRef.current = null;
    setDragX(0);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startXRef.current == null) return;
    setDragX(e.clientX - startXRef.current);
  };
  const onPointerUp = () => onTouchEnd();

  const translatePct = -(index * 100) + (dragX / widthRef.current) * 100;
  const atFirst = index === 0;
  const atLast = index === photos.length - 1;
  const current = photos[index];

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: "#000" }}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      data-testid="lightbox-d28"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 rounded-full inline-flex items-center justify-center active:scale-[0.94] transition-transform"
          style={{
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          }}
          data-testid="button-lightbox-close"
          aria-label="Close"
        >
          <X className="w-[19px] h-[19px] text-white" />
        </button>
        <span className="text-white text-[14px] font-semibold tabular-nums">
          {index + 1} / {photos.length}
        </span>
        <div className="w-11 h-11" />
      </div>

      {/* Swipeable track */}
      <div
        ref={trackRef}
        className="flex-1 overflow-hidden relative"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "pan-y", cursor: "grab" }}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(${translatePct}%)`,
            transition: startXRef.current == null ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
            width: `${photos.length * 100}%`,
          }}
        >
          {photos.map((p) => (
            <div
              key={p.id}
              className="h-full flex items-center justify-center px-4"
              style={{ width: `${100 / photos.length}%` }}
            >
              <img
                src={p.url}
                alt={p.label}
                className="max-w-full max-h-full object-contain select-none"
                draggable={false}
              />
            </div>
          ))}
        </div>

        {/* Side arrow buttons (desktop / non-touch) */}
        {!atFirst && (
          <button
            type="button"
            onClick={() => setIndex(index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full inline-flex items-center justify-center active:scale-[0.94] transition-transform"
            style={{
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }}
            data-testid="button-lightbox-prev"
            aria-label="Previous"
          >
            <ChevronLeft className="w-[19px] h-[19px] text-white" />
          </button>
        )}
        {!atLast && (
          <button
            type="button"
            onClick={() => setIndex(index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full inline-flex items-center justify-center active:scale-[0.94] transition-transform"
            style={{
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }}
            data-testid="button-lightbox-next"
            aria-label="Next"
          >
            <ChevronRight className="w-[19px] h-[19px] text-white" />
          </button>
        )}
      </div>

      {/* Caption + dots */}
      <div className="px-5 pt-3 pb-5 flex flex-col items-center gap-3">
        <span className="text-white text-[14px] font-semibold">
          {current.label}
        </span>
        <div className="flex items-center gap-1.5">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to ${p.label}`}
              className="rounded-full transition-all"
              style={{
                width: i === index ? 18 : 6,
                height: 6,
                background: i === index ? "#fff" : "rgba(255,255,255,0.4)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────── */

function CircularGlass({ children }: { children: ReactNode }) {
  return (
    <button
      className="w-11 h-11 rounded-full inline-flex items-center justify-center active:scale-[0.94] transition-transform"
      style={{
        background: "rgba(0,0,0,0.32)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      {children}
    </button>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-white text-[20px] font-bold leading-tight tracking-tight">
      {title}
    </h2>
  );
}

function TrustChip({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div
      className="flex-1 h-9 rounded-lg inline-flex items-center justify-center gap-1.5 text-white text-[12px] font-medium"
      style={{ background: "rgba(255,255,255,0.06)" }}
    >
      <span style={{ color: "rgba(235,235,245,0.7)" }}>{icon}</span>
      {text}
    </div>
  );
}

export default D28;
