import { useState } from "react";
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
  const [activeView, setActiveView] = useState("f");
  const hero = VIEWS.find((v) => v.id === activeView) ?? VIEWS[0];

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

          {/* Hero product photo */}
          <img
            src={hero.url}
            alt={`Martin D-28 — ${hero.label}`}
            className="absolute inset-0 w-full h-full object-contain z-[1]"
            style={{ objectPosition: "center 55%" }}
            draggable={false}
          />

          {/* Bottom fade into page bg */}
          <div
            className="absolute inset-x-0 bottom-0 z-[2]"
            style={{
              height: "30%",
              background: `linear-gradient(to bottom, rgba(0,6,43,0) 0%, rgba(0,6,43,0.4) 50%, ${BG} 100%)`,
            }}
          />
        </div>

        {/* ============================ THUMBNAIL STRIP ============================ */}
        <div className="px-5 -mt-2 relative z-[3]">
          <div className="flex gap-2">
            {VIEWS.map((v) => {
              const active = v.id === activeView;
              return (
                <button
                  key={v.id}
                  onClick={() => setActiveView(v.id)}
                  className="flex-1 aspect-square rounded-lg overflow-hidden active:scale-[0.94] transition-transform"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    outline: active ? `2px solid ${BLUE}` : "none",
                    outlineOffset: 1,
                  }}
                  data-testid={`thumb-d28-${v.id}`}
                  aria-label={v.label}
                >
                  <img
                    src={v.url}
                    alt={v.label}
                    className="w-full h-full object-contain"
                    style={{ objectPosition: "center 55%" }}
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
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
