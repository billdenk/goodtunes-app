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

const ASSET_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/vendor-assets/martin`;
const HERO_PHOTO = `${ASSET_BASE}/d28_f.jpg`; // D-28 front, full guitar
const LOGO_IMG = `${ASSET_BASE}/logo.jpg`;
const D28_FRONT = `${ASSET_BASE}/d28_f.jpg`;

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
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "1 / 1.05", background: "#0a0805" }}
        >
          {/* Warm wood backdrop behind the guitar cut-out */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 35%, #b88652 0%, #6b3f1a 50%, #2c1808 90%, #140a03 100%)",
            }}
          />
          {/* Hero photo: D-28 front, full guitar */}
          <img
            src={HERO_PHOTO}
            alt="Martin D-28 acoustic guitar"
            className="absolute inset-0 w-full h-full object-contain"
            style={{ objectPosition: "center 58%" }}
            draggable={false}
          />
          {/* Top darkening for chrome legibility */}
          <div
            className="absolute inset-x-0 top-0 z-[1]"
            style={{
              height: "35%",
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0) 100%)",
            }}
          />

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

          {/* Martin wordmark — top of hero, screen-blended over the wood/photo */}
          <div className="absolute top-16 left-0 right-0 flex justify-center z-[2] px-10 pointer-events-none">
            <img
              src={LOGO_IMG}
              alt="C.F. Martin & Co. — Est. 1833"
              className="w-full max-w-[260px] h-auto"
              style={{
                mixBlendMode: "screen",
                filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.5))",
              }}
              draggable={false}
            />
          </div>

          {/* Bottom fade into page bg */}
          <div
            className="absolute inset-x-0 bottom-0 z-[3]"
            style={{
              height: "55%",
              background: `linear-gradient(to bottom, rgba(0,6,43,0) 0%, rgba(0,6,43,0.55) 35%, ${BG} 78%, ${BG} 100%)`,
            }}
          />
        </div>

        {/* ============================ PROFILE ROW ============================ */}
        <div className="px-5 -mt-7 relative flex items-end gap-3">
          {/* Logo chip — wide rect cropped to the wordmark itself */}
          <div
            className="flex-shrink-0 rounded-2xl overflow-hidden"
            style={{
              width: 132,
              height: 72,
              background: "#000",
              boxShadow: "0 4px 20px rgba(0,0,0,0.45)",
            }}
          >
            <img
              src={LOGO_IMG}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover"
              style={{ objectPosition: "center", transform: "scale(1.55)" }}
              draggable={false}
            />
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

        {/* ============================ FEATURED PRODUCT ============================ */}
        <div className="px-5 pt-7 pb-2">
          <SectionHeader title="Featured gear" />
        </div>
        <div className="px-5 pb-2">
          <button
            className="w-full text-left rounded-2xl overflow-hidden active:scale-[0.98] transition-transform"
            style={{
              background:
                "linear-gradient(180deg, #c79360 0%, #6b3a16 70%, #3a1d08 100%)",
              boxShadow: "0 10px 32px rgba(0,0,0,0.5)",
            }}
            data-testid="card-featured-d28"
          >
            <div
              className="relative w-full flex items-center justify-center"
              style={{ aspectRatio: "1 / 1" }}
            >
              <img
                src={D28_FRONT}
                alt="Martin D-28"
                className="w-full h-full object-contain"
                style={{ objectPosition: "center 55%" }}
                draggable={false}
              />
              <span
                className="absolute top-3 left-3 px-2 py-1 rounded-md text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white"
                style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
              >
                Featured
              </span>
            </div>
            <div className="px-4 pt-3 pb-4 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white text-[16px] font-bold leading-tight">
                  Martin D-28
                </p>
                <p
                  className="text-[12.5px] mt-0.5 leading-snug"
                  style={{ color: "rgba(255,255,255,0.78)" }}
                >
                  Dreadnought · East Indian rosewood &amp; Sitka spruce
                </p>
              </div>
              <span
                className="text-white text-[14.5px] font-semibold tabular-nums flex-shrink-0"
              >
                $3,499.99
              </span>
            </div>
          </button>
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
