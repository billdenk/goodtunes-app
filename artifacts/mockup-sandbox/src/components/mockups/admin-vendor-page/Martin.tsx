import type { ReactNode } from "react";
import {
  ChevronLeft,
  Share,
  MoreHorizontal,
  MapPin,
  Globe,
  Search,
  MessageCircle,
  ChevronRight,
  Star,
} from "lucide-react";

/**
 * Vendor page · Martin — Apple-Music-style mock of the fan-facing vendor
 * sheet that opens when a fan taps a vendor row inside an InstrumentSheet.
 *
 * Goal of this mock: show Bill what a "real" vendor surface feels like —
 * hero cover, floating chrome, Featured Gear, Played By artists, and a
 * Shop CTA — so we can lock the format before wiring real data.
 *
 * Self-contained (no @/ imports — sandbox can't reach client/src).
 */

const BG = "#00062B";
const BLUE = "#319ED8";
const PINK = "#FF5470";

// Cream linen gradient evokes Martin's wood/case aesthetic without
// committing to a specific photo. Replaces with vendor.coverUrl in real
// data.
const HERO_BG =
  "radial-gradient(120% 90% at 50% 30%, #d6b582 0%, #8a5a2a 45%, #3a2510 80%, #1a0e05 100%)";

interface GearItem {
  id: string;
  name: string;
  short: string;
  price: string;
  swatch: string; // CSS gradient
}

const FEATURED: GearItem[] = [
  {
    id: "d28",
    name: "D-28",
    short: "Dreadnought",
    price: "$3,299",
    swatch: "linear-gradient(135deg, #c79360 0%, #6b3a16 100%)",
  },
  {
    id: "d35",
    name: "D-35",
    short: "Dreadnought",
    price: "$3,599",
    swatch: "linear-gradient(135deg, #b88652 0%, #5a2f10 100%)",
  },
  {
    id: "om28",
    name: "OM-28",
    short: "Orchestra",
    price: "$3,299",
    swatch: "linear-gradient(135deg, #cf9866 0%, #6e3b18 100%)",
  },
  {
    id: "000-28",
    name: "000-28",
    short: "Auditorium",
    price: "$3,099",
    swatch: "linear-gradient(135deg, #b8814b 0%, #4f2a10 100%)",
  },
];

interface ArtistChip {
  id: string;
  name: string;
  initial: string;
  hue: string;
}

const PLAYED_BY: ArtistChip[] = [
  { id: "ec", name: "Eric Clapton", initial: "E", hue: "#a25b3b" },
  { id: "jb", name: "Joan Baez", initial: "J", hue: "#6b4a8a" },
  { id: "jm", name: "John Mayer", initial: "J", hue: "#3b6a8a" },
  { id: "nyy", name: "Neil Young", initial: "N", hue: "#8a5b3b" },
  { id: "et", name: "Ed Sheeran", initial: "E", hue: "#a23b4a" },
];

export function Martin() {
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
          className="relative w-full"
          style={{ aspectRatio: "1 / 1.05", background: HERO_BG }}
        >
          {/* Floating chrome — back / share / more */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
            <CircularGlass>
              <ChevronLeft className="w-[19px] h-[19px] text-white" />
            </CircularGlass>
            <div className="flex items-center gap-2">
              <CircularGlass>
                <Search className="w-[19px] h-[19px] text-white" />
              </CircularGlass>
              <CircularGlass>
                <Share className="w-[19px] h-[19px] text-white" />
              </CircularGlass>
              <CircularGlass>
                <MoreHorizontal className="w-[19px] h-[19px] text-white" />
              </CircularGlass>
            </div>
          </div>

          {/* Martin wordmark centered in hero */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="px-5 py-3 rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.95)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
              }}
            >
              <span
                style={{
                  fontFamily: "'Times New Roman', Georgia, serif",
                  fontSize: 44,
                  fontWeight: 700,
                  color: "#1a0e05",
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                }}
              >
                Martin
              </span>
            </div>
            <span
              className="mt-2 text-white/85 text-[11px] font-medium uppercase tracking-[0.28em]"
            >
              Est. 1833 · Nazareth, PA
            </span>
          </div>

          {/* Bottom fade into page bg */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: "55%",
              background: `linear-gradient(to bottom, rgba(0,6,43,0) 0%, rgba(0,6,43,0.55) 35%, ${BG} 78%, ${BG} 100%)`,
            }}
          />
        </div>

        {/* ============================ PROFILE ROW ============================ */}
        <div className="px-5 -mt-7 relative flex items-end gap-3">
          {/* Logo chip */}
          <div
            className="flex-shrink-0 w-[72px] h-[72px] rounded-2xl overflow-hidden flex items-center justify-center"
            style={{
              background: "#fff",
              boxShadow: "0 4px 20px rgba(0,0,0,0.45)",
            }}
          >
            <span
              style={{
                fontFamily: "'Times New Roman', Georgia, serif",
                fontSize: 32,
                fontWeight: 700,
                color: "#1a0e05",
                letterSpacing: "-0.04em",
              }}
            >
              M
            </span>
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1
              className="text-white font-bold leading-tight tracking-tight"
              style={{ fontSize: 22 }}
            >
              C.F. Martin &amp; Co.
            </h1>
            <p
              className="text-[13px] mt-0.5 leading-snug"
              style={{ color: "rgba(235,235,245,0.7)" }}
            >
              America's oldest guitar maker. Acoustic flat-tops since 1833.
            </p>
          </div>
        </div>

        {/* Meta row */}
        <div className="px-5 pt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          <span
            className="inline-flex items-center gap-1 text-[12px]"
            style={{ color: "rgba(235,235,245,0.7)" }}
          >
            <MapPin className="w-3 h-3" />
            Nazareth, PA
          </span>
          <span
            className="inline-flex items-center gap-1 text-[12px]"
            style={{ color: BLUE }}
          >
            <Globe className="w-3 h-3" />
            martinguitar.com
          </span>
        </div>

        {/* ============================ PRIMARY CTAs ============================ */}
        <div className="px-5 pt-5 flex gap-2.5">
          <button
            className="flex-1 h-11 rounded-full text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.94] transition-transform"
            style={{ background: BLUE }}
            data-testid="button-shop-martin"
          >
            <Globe className="w-[15px] h-[15px]" />
            Shop at martinguitar.com
          </button>
          <button
            className="w-11 h-11 rounded-full inline-flex items-center justify-center active:scale-[0.94] transition-transform"
            style={{ background: "rgba(255,255,255,0.14)" }}
            data-testid="button-message-martin"
            aria-label="Message Martin"
          >
            <MessageCircle className="w-[19px] h-[19px] text-white" />
          </button>
        </div>

        {/* ============================ BIO ============================ */}
        <div className="px-5 pt-6">
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: "rgba(235,235,245,0.78)" }}
          >
            Founded by Christian Frederick Martin in 1833, C.F. Martin &amp; Co.
            invented the modern flat-top acoustic guitar. From the legendary
            D-28 dreadnought to the parlor-sized 0-series, Martin guitars have
            shaped American music — folk, bluegrass, country, blues, and rock —
            for nearly two centuries.
          </p>
          <button
            className="mt-2 text-[13px] font-semibold"
            style={{ color: BLUE }}
            data-testid="button-bio-more"
          >
            More
          </button>
        </div>

        {/* ============================ FEATURED GEAR ============================ */}
        <div className="px-5 pt-7 pb-2">
          <SectionHeader title="Featured gear" />
        </div>
        <div className="px-5 pb-2">
          <div className="grid grid-cols-2 gap-3">
            {FEATURED.map((g) => (
              <button
                key={g.id}
                className="flex flex-col text-left active:scale-[0.94] transition-transform"
                data-testid={`card-gear-${g.id}`}
              >
                <div
                  className="aspect-square rounded-xl overflow-hidden relative flex items-end p-3"
                  style={{
                    background: g.swatch,
                    boxShadow: "0 6px 22px rgba(0,0,0,0.45)",
                  }}
                >
                  {/* Stylized headstock silhouette */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      className="w-[18%] h-[58%] rounded-[14px]"
                      style={{
                        background:
                          "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 100%)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
                      }}
                    />
                  </div>
                  <span
                    className="relative text-white text-[11px] font-semibold uppercase tracking-[0.18em]"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
                  >
                    {g.short}
                  </span>
                </div>
                <p className="text-white text-[13.5px] font-semibold leading-tight truncate mt-2">
                  Martin {g.name}
                </p>
                <p
                  className="text-[12px] truncate mt-0.5"
                  style={{ color: "rgba(235,235,245,0.55)" }}
                >
                  Guitar · {g.price}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* ============================ PLAYED BY ============================ */}
        <div className="px-5 pt-7 pb-2">
          <SectionHeader title="Played by" />
        </div>
        <div className="pl-5 pb-2">
          <div
            className="flex gap-3 overflow-x-auto pb-2 pr-5"
            style={{ scrollbarWidth: "none" }}
          >
            {PLAYED_BY.map((a) => (
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
                <span
                  className="text-[10.5px] mt-0.5 inline-flex items-center gap-0.5"
                  style={{ color: PINK }}
                >
                  <Star className="w-[10px] h-[10px] fill-current" />
                  Artist
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ============================ ALSO STOCKED AT ============================ */}
        <div className="px-5 pt-7 pb-2">
          <SectionHeader title="Also stocked at" />
        </div>
        <div className="px-5 pb-8 space-y-2">
          {[
            { name: "Sweetwater", domain: "sweetwater.com" },
            { name: "Reverb", domain: "reverb.com" },
            { name: "Guitar Center", domain: "guitarcenter.com" },
          ].map((v) => (
            <button
              key={v.name}
              className="w-full h-12 rounded-xl px-4 flex items-center justify-between active:scale-[0.94] transition-transform"
              style={{ background: "rgba(255,255,255,0.06)" }}
              data-testid={`row-vendor-${v.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-[#00062B] text-[14px] font-bold"
                >
                  {v.name.charAt(0)}
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-white text-[13.5px] font-semibold leading-tight">
                    {v.name}
                  </span>
                  <span
                    className="text-[11.5px] leading-tight"
                    style={{ color: "rgba(235,235,245,0.55)" }}
                  >
                    {v.domain}
                  </span>
                </div>
              </div>
              <ChevronRight
                className="w-4 h-4"
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
    <div className="flex items-center justify-between">
      <h2 className="text-white text-[20px] font-bold leading-tight tracking-tight">
        {title}
      </h2>
      <button
        className="text-[13px] font-semibold inline-flex items-center gap-0.5"
        style={{ color: BLUE }}
      >
        See all
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default Martin;
