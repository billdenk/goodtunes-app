// ArtistReleasePackageTemplates — "start from a package" step at the TOP of
// Otis's live DARK in-Release artist builder for CALIFORNIALAND.
//
// The founder's call (see bill-card-drawing.jpg + Apple Music "New" rail):
// cards are WIDE like Apple's; the ENTIRE card face is the "jacket cover"
// filling it edge-to-edge — the cover IS the card — with a wide vinyl DISC
// arcing up from the bottom edge (the record peeking out of the jacket).
// Cover art is a distinct gradient/pattern per package but one uniform SYSTEM
// (same composition, text placement, vinyl position); the sell line lives in
// the TOP area of the cover; vinyl color matches the package.
//
// This file replicates the dark shell from Otis's screenshots (left rail with
// the Catalog group, top bar with the "Viewing as Niina Soleil" pill + Feedback,
// "POWERED BY GoodTunes" footer, the eyebrow "YOUR RELEASE · CALIFORNIALAND",
// the two-tone heading, subline, and the release info card), then inserts a NEW
// section above the existing builder: a horizontal rail of four Apple-Music-style
// Memphis Record Pressing package cards. Below it, the real builder continues
// with the "Pick a size." row, which fades out — so it reads as the same page.
//
// Binding rules honored: self-contained (react + lucide-react + the release
// thumb asset only); never the word "quote" — "estimate"; no emojis; real ® in
// GoodDeed®; the founder is colorblind, so every status is word + icon, never
// color alone; near-black dark surface (not navy); ONE filled accent button max
// (the Save pill, top-right, as in the screenshot). Prices use the canon
// component consts from the MRP estimate. Routes auto-register via default export.

import { useState, useEffect, useRef, useCallback, type ReactNode, type CSSProperties } from 'react';
import {
  Search,
  LayoutDashboard,
  Disc3,
  Users,
  Gift,
  Megaphone,
  ShoppingBag,
  UserCheck,
  UserPlus,
  Store,
  BarChart3,
  MessageSquarePlus,
  Eye,
  EyeOff,
  Check,
  Layers,
  Sparkles,
  Award,
  AlertCircle,
  ArrowRight,
  Minus,
  Plus,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import californialandCover from '../assets/californialand-cover.jpg';
import mrpLabelLogo from '../assets/mrp-logo.svg';
import californialandInnerSleeve from '../assets/californialand-inner-sleeve.png';
import niinaLabelArt from '../assets/niina-label-1.png';
import rubyVinylPhoto from '../assets/mrp-ruby-translucent.png';

// ── Per-press label branding (same as PressQuoteBuilder) ───────────────────
const PRESS_LABEL_LOGO = mrpLabelLogo;
const PRESS_LABEL_BG = '#0a0a0a';
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';

// ─── Vinyl layer kit (same technique as PressQuoteBuilder) ──────────────────
const LAYERS = {
  opaque: '/__mockup/vinyl-layers/opaque-vinyl.png',
  translucent: '/__mockup/vinyl-layers/translucent-vinyl.png',
  splatter1: '/__mockup/vinyl-layers/splatter-one.png',
  splatter2: '/__mockup/vinyl-layers/splatter-two.png',
  splatter3: '/__mockup/vinyl-layers/splatter-three.png',
  highlights: '/__mockup/vinyl-layers/vinyl-highlights.png',
  inner: '/__mockup/vinyl-layers/inner-circle.png',
};

// A single CSS-masked color layer — copied from PressQuoteBuilder.
function MaskLayer({ color, mask, opacity = 1, maskSize = '102% 102%' }: {
  color: string; mask: string; opacity?: number; maskSize?: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        backgroundColor: color,
        opacity,
        maskImage: `url(${mask})`,
        WebkitMaskImage: `url(${mask})`,
        maskSize,
        WebkitMaskSize: maskSize,
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
      }}
    />
  );
}

// The white MRP logo mark + quiet arc text — printed on the black label.
function DiscLabelArt({ size }: { size: number }) {
  const showArcText = size >= 70;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      <img
        src={PRESS_LABEL_LOGO}
        alt=""
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * 0.9,
          height: size * 0.9,
          objectFit: 'contain',
          filter: PRESS_LABEL_LOGO_FILTER,
        }}
      />
      {showArcText && (
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <path id="pkg-disc-arc-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill="rgba(245,245,247,0.5)" style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#pkg-disc-arc-bottom" startOffset="50%" textAnchor="middle">
              MRP-001 · 33 ⅓ RPM
            </textPath>
          </text>
        </svg>
      )}
    </div>
  );
}

// Realistic layered vinyl render — same markup/technique as PressQuoteBuilder's
// VinylDisc (layered masks, groove sheen pass, MRP black label, spindle hole).
type DiscKind = 'black' | 'opaque' | 'translucent' | 'splatter';

function RealVinylDisc({ size, kind, base, s1, s2, s3 }: {
  size: number; kind: DiscKind; base: string; s1?: string; s2?: string; s3?: string;
}) {
  const LABEL_RATIO = 368 / 1104;
  const INNER_RATIO = 129 / 1104;
  const holeRatio = 0.018;
  const translucent = kind === 'translucent';
  const isSplatter = kind === 'splatter';

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: translucent ? '#ffffff' : '#000000',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%' }}>
        {translucent ? (
          <MaskLayer color={base} mask={LAYERS.translucent} opacity={1} />
        ) : (
          <MaskLayer color={base} mask={LAYERS.opaque} />
        )}

        {isSplatter && (
          <>
            <MaskLayer color={s1 ?? base} mask={LAYERS.splatter1} />
            <MaskLayer color={s2 ?? base} mask={LAYERS.splatter2} />
            <MaskLayer color={s3 ?? base} mask={LAYERS.splatter3} />
          </>
        )}

        {/* Center label — MRP's black label with white logo. */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: size * LABEL_RATIO,
            height: size * LABEL_RATIO,
            borderRadius: '50%',
            backgroundColor: PRESS_LABEL_BG,
            overflow: 'hidden',
          }}
        >
          {size >= 70 && <DiscLabelArt size={size * LABEL_RATIO} />}
        </div>

        <img
          src={LAYERS.inner}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: size * INNER_RATIO,
            height: size * INNER_RATIO,
            opacity: 1,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </div>

      {/* Fixed sheen — never rotates */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#ffffff',
          opacity: 0.6,
          maskImage: `url(${LAYERS.highlights})`,
          WebkitMaskImage: `url(${LAYERS.highlights})`,
          maskSize: '100% 100%',
          WebkitMaskSize: '100% 100%',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          pointerEvents: 'none',
        }}
      />

      {/* Spindle hole */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * holeRatio,
          height: size * holeRatio,
          borderRadius: '50%',
          backgroundColor: CANVAS,
          boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ─── Dark tokens (near-black charcoal, per Otis's screenshots — NOT navy) ──
const CANVAS = '#0b0b0c';
const RAIL = '#111112';
const TOPBAR = '#141416';
const CARD = '#161618';
const CARD_RAISED = '#1d1d1f';
const INK = '#f5f5f7';
const SUBINK = '#a1a1a6';
const FAINT = '#6e6e73';
const HAIRLINE = 'rgba(255,255,255,0.10)';
const HAIRLINE_SOFT = 'rgba(255,255,255,0.06)';
const BLUE = '#319ED8';
// MRP's complementary accent — the gold of memphisrecordpressing.com's
// "Get a quote" button (no prior gold token exists in the press mocks).
const MRP_GOLD = '#D2A24C';

const ARTIST_NAME = 'Niina Soleil';
const RELEASE_TITLE = 'CALIFORNIALAND';
const PARTNER_NAME = 'Memphis Record Pressing';

// ─── Canon per-unit component consts at the 1,000 tier (MRP estimate) ──────
// vinyl 2.30 · label 0.25 · jacket 0.81 · sleeve 0.81 · insert 0.67 ·
// assembly 0.36 · shrink 0.17 — Standard Black full build = 5.37.
const COST = {
  vinyl: 2.30,
  label: 0.25,
  jacket: 0.81,
  sleeve: 0.81,
  insert: 0.67,
  assembly: 0.36,
  shrink: 0.17,
  // Color/splatter/translucent vinyl always upcharges over black (Bill,
  // Aug 18 2026: "black is always the lower cost"). Any non-black disc
  // must price above the equivalent black build.
  colorUpcharge: 0.90,
} as const;

const money2 = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Left rail nav — decided artist rail canon (ArtistReleasesIndex) ────────
// Canon rail (Bill + Claude, Aug 16 2026): Catalog group killed, Releases
// top-level, People renamed Team and pinned at the bottom of the rail. Order
// logic: create first, know your fans second, commerce third, analysis
// fourth, admin last.
type NavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

const ARTIST_NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Releases', icon: Disc3, active: true },
  { label: 'Audience', icon: Users },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Referrals', icon: Gift },
  { label: 'Shopify', icon: Store },
  { label: 'Reports', icon: BarChart3 },
];

const ARTIST_NAV_BOTTOM: NavItem[] = [{ label: 'Team', icon: UserPlus }];

// NavRow — ArtistReleaseDetail's rail treatment, verbatim (dark theme values).
function NavRow({ label, icon: Icon, active }: NavItem) {
  return (
    <button
      type="button"
      data-testid={`nav-${label.toLowerCase()}`}
      className={`w-full flex items-center gap-2.5 px-2.5 h-9 rounded-xl text-[13px] transition-colors ${active ? '' : 'hover:bg-white/5'}`}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        backgroundColor: active ? '#3a3a3e' : undefined,
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)' : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? BLUE : FAINT }} />
      <span className="truncate flex-1 text-left">{label}</span>
    </button>
  );
}

// ─── The dark shell (top bar + left rail + POWERED BY footer) ───────────────
function DarkShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      {/* Top bar */}
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-5 sticky top-0 z-20"
        style={{ backgroundColor: TOPBAR, borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-[13px] font-semibold"
            style={{ border: `1px solid ${HAIRLINE}`, background: '#2a2a2e', color: INK }}
            aria-hidden
          >
            NS
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            {ARTIST_NAME}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className="inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-medium"
            style={{ padding: '6px 12px', border: `1px solid ${HAIRLINE}`, background: CARD, color: INK }}
            data-testid="pill-viewing-as"
          >
            <Eye className="w-3.5 h-3.5" style={{ color: BLUE }} />
            Viewing as {ARTIST_NAME}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-medium"
            style={{ padding: '6px 12px', color: SUBINK, background: 'transparent', border: 'none', cursor: 'pointer' }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <span
            className="h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
            style={{ background: BLUE, color: '#fff' }}
            aria-label="Admin account"
          >
            Bi
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* Left rail */}
        <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: RAIL, borderRight: `1px solid ${HAIRLINE}` }}>
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: FAINT }} />
              <input
                className="w-full h-9 pl-8 pr-9 rounded-full text-[12.5px] focus:outline-none"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK, background: CARD }}
                placeholder="Search…"
                readOnly
              />
              <span
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold rounded px-1 py-0.5"
                style={{ color: FAINT, border: `1px solid ${HAIRLINE}` }}
                aria-hidden
              >
                ⌘K
              </span>
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {ARTIST_NAV.map((item) => <NavRow key={item.label} {...item} />)}
          </nav>
          {/* Team — pinned at the very bottom, above the POWERED BY footer */}
          <div className="px-2.5 pb-2 space-y-0.5">
            {ARTIST_NAV_BOTTOM.map((item) => <NavRow key={item.label} {...item} />)}
          </div>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: FAINT }}>
              Powered by
            </span>
            <span className="text-[13px] font-bold" style={{ color: INK, letterSpacing: -0.2 }}>
              Good<span style={{ color: SUBINK }}>Tunes</span>
            </span>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

// ─── Jacket-cover art — the ENTIRE card face is the "album cover" ────────────
// Per the founder's sketch (bill-card-drawing.jpg): the cover fills the card
// edge-to-edge (you never see the cover's own edge — it IS the card), and a
// wide vinyl DISC arcs up from the bottom edge — the record peeking out of the
// jacket. Uniform SYSTEM across all four covers: same composition (full-bleed
// art + bottom-rising disc, same position and size) — only the art and the
// vinyl color change per package. Wide Apple-Music proportions (16:9-ish).

function CoverHeavyweight() {
  // 180g heft — warm amber sunset bands, like a heavyweight pressing plant at dusk.
  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Heavyweight cover: warm amber bands with a black record rising from the bottom">
      <defs>
        <linearGradient id="hwv-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a1f0e" />
          <stop offset="0.55" stopColor="#8a4718" />
          <stop offset="1" stopColor="#d67a34" />
        </linearGradient>
      </defs>
      <rect width="460" height="260" fill="url(#hwv-bg)" />
      {/* horizon bands — weight stacking motif */}
      <rect x="0" y="128" width="460" height="14" fill="rgba(0,0,0,0.28)" />
      <rect x="0" y="150" width="460" height="10" fill="rgba(0,0,0,0.2)" />
      <rect x="0" y="167" width="460" height="7" fill="rgba(0,0,0,0.14)" />
    </svg>
  );
}

function CoverStandardBlack() {
  // The everyday build — quiet charcoal cover, clean black record.
  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Standard Black cover: charcoal field with a black record rising from the bottom">
      <defs>
        <linearGradient id="std-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#232327" />
          <stop offset="1" stopColor="#101012" />
        </linearGradient>
      </defs>
      <rect width="460" height="260" fill="url(#std-bg)" />
      {/* subtle diagonal pinstripes */}
      {[0, 60, 120, 180, 240, 300, 360, 420].map((x) => (
        <line key={x} x1={x} y1="0" x2={x + 90} y2="260" stroke="rgba(255,255,255,0.045)" strokeWidth="10" />
      ))}
    </svg>
  );
}

function CoverSplatter() {
  // The showpiece — ruby splatter record on a deep teal-ink cover with dabs.
  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Splatter Special cover: teal field with splatter dabs and a ruby splatter record rising from the bottom">
      <defs>
        <linearGradient id="spl-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e2b2a" />
          <stop offset="1" stopColor="#123c38" />
        </linearGradient>
      </defs>
      <rect width="460" height="260" fill="url(#spl-bg)" />
      {/* splatter dabs across the cover art */}
      <circle cx="70" cy="60" r="16" fill="#f2c94c" />
      <circle cx="395" cy="48" r="11" fill="#e0466b" />
      <circle cx="330" cy="120" r="8" fill="#f2c94c" />
      <circle cx="120" cy="140" r="7" fill="#4ec9b0" />
      <circle cx="420" cy="150" r="14" fill="#4ec9b0" />
      <circle cx="30" cy="180" r="9" fill="#e0466b" />
    </svg>
  );
}

function CoverCollector() {
  // The keepsake — deep violet cover with a certificate-line motif, violet record.
  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Collector cover: deep violet field with signature motif and a violet record rising from the bottom">
      <defs>
        <linearGradient id="col-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c1436" />
          <stop offset="1" stopColor="#332457" />
        </linearGradient>
      </defs>
      <rect width="460" height="260" fill="url(#col-bg)" />
      {/* faint gatefold spine */}
      <line x1="230" y1="0" x2="230" y2="178" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
    </svg>
  );
}

// ─── Package model ──────────────────────────────────────────────────────────
// "From $X / unit at {min}" — anchored at the package's minimum run, using
// the same tier scale as the builder (normalized to the 1,000-unit consts).
const railMinRunFactor = (q: number) => (q <= 100 ? 1.0 : q <= 300 ? 0.88 : q <= 500 ? 0.80 : 0.70) / 0.70;

type Pkg = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;   // one-line component summary
  caption: string;    // short sell line, sits on the image
  unitCost: number;   // $/unit at 1,000 from canon consts
  minRun: number;     // package minimum run — the price anchor (Bill)
  ad: () => ReactNode;
  /** Realistic record rising from the card's bottom edge (PressQuoteBuilder render). */
  disc: { kind: DiscKind; base: string; s1?: string; s2?: string; s3?: string };
  note?: { icon: typeof AlertCircle; text: string }; // word + icon (never color alone)
};

const PACKAGES: Pkg[] = [
  {
    id: 'heavyweight',
    minRun: 500,
    eyebrow: 'MRP PACKAGE',
    title: 'The Heavyweight',
    subtitle: '180g splatter · printed jacket + insert',
    caption: 'Everything a first pressing needs.',
    // vinyl + color upcharge + label + jacket + insert + assembly + shrink
    // (splatter disc shown — must price above the black builds)
    unitCost: COST.vinyl + COST.colorUpcharge + COST.label + COST.jacket + COST.insert + COST.assembly + COST.shrink,
    ad: CoverHeavyweight,
    // red/yellow splatter vinyl on the warm orange gradient (founder's mock)
    disc: { kind: 'splatter', base: '#C81E38', s1: '#F5F5DC', s2: '#E8C84A', s3: '#F0E6C8' },
  },
  {
    id: 'standard',
    minRun: 300,
    eyebrow: 'MRP PACKAGE',
    title: 'Standard Black',
    subtitle: 'Black vinyl · jacket · inner sleeve · insert',
    caption: 'The clean, everyday build.',
    // full canon build = 5.37
    unitCost: COST.vinyl + COST.label + COST.jacket + COST.sleeve + COST.insert + COST.assembly + COST.shrink,
    ad: CoverStandardBlack,
    // glossy black vinyl
    disc: { kind: 'black', base: '#111114' },
  },
  {
    id: 'splatter',
    minRun: 300,
    eyebrow: 'MRP PACKAGE',
    title: 'Splatter Special',
    subtitle: 'Splatter vinyl · jacket · inner sleeve',
    caption: 'A record fans want to hold up.',
    unitCost: COST.vinyl + COST.colorUpcharge + COST.label + COST.jacket + COST.sleeve + COST.assembly + COST.shrink,
    ad: CoverSplatter,
    // red/orange splatter vinyl — it says Splatter Special, show a splatter record
    disc: { kind: 'splatter', base: '#D2401E', s1: '#F2C94C', s2: '#7A1220', s3: '#F5EBD8' },
    note: { icon: AlertCircle, text: 'Minimum run 300' },
  },
  {
    id: 'collector',
    minRun: 500,
    eyebrow: 'MRP PACKAGE',
    title: 'Collector',
    subtitle: 'Gatefold · insert · signed GoodDeed® slot',
    caption: 'Built to become a keepsake.',
    // translucent violet disc — color upcharge applies (black always cheapest)
    unitCost: COST.vinyl + COST.colorUpcharge + COST.label + COST.jacket + COST.sleeve + COST.insert + COST.assembly + COST.shrink,
    ad: CoverCollector,
    // translucent violet vinyl
    disc: { kind: 'translucent', base: '#5B3FD8' },
    note: { icon: Award, text: 'Signed tier ready' },
  },
];

// ─── One Apple-Music-style package card ─────────────────────────────────────
function PackageCard({ pkg, selected, onSelect }: { pkg: Pkg; selected: boolean; onSelect: () => void }) {
  const [hover, setHover] = useState(false);
  const Ad = pkg.ad;
  const Note = pkg.note?.icon;

  const cardStyle: CSSProperties = {
    width: 460,
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
    padding: 0,
    textAlign: 'left',
    cursor: 'pointer',
    color: INK,
  };

  return (
    <button
      type="button"
      style={cardStyle}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-pressed={selected}
      data-testid={`package-card-${pkg.id}`}
    >
      {/* eyebrow + title + subtitle above the image (Apple Music order) */}
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: FAINT }}>
        {pkg.eyebrow}
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2, marginTop: 4, color: INK }}>
        {pkg.title}
      </div>
      <div style={{ fontSize: 13, color: SUBINK, marginTop: 2, lineHeight: 1.35 }}>
        {pkg.subtitle}
      </div>

      {/* WIDE rounded card face — the "jacket cover" fills it edge-to-edge,
          with the vinyl disc arcing up from the bottom (founder's sketch) */}
      <div
        style={{
          position: 'relative',
          marginTop: 12,
          height: 260,
          borderRadius: 14,
          overflow: 'hidden',
          border: selected ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          transform: hover ? 'translateY(-3px)' : 'none',
          boxShadow: hover ? '0 14px 34px rgba(0,0,0,0.5)' : '0 4px 14px rgba(0,0,0,0.35)',
        }}
      >
        <Ad />

        {/* BIG realistic record rising from the bottom edge — PressQuoteBuilder's
            layered render, scaled up and cropped by the card's bottom (mock). */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: 78,
            transform: 'translateX(-50%)',
            filter: 'drop-shadow(0 -6px 22px rgba(0,0,0,0.45))',
          }}
        >
          <RealVinylDisc size={330} kind={pkg.disc.kind} base={pkg.disc.base} s1={pkg.disc.s1} s2={pkg.disc.s2} s3={pkg.disc.s3} />
        </div>

        {/* selected badge — word + icon, never color alone */}
        {selected && (
          <span
            style={{
              position: 'absolute', top: 10, right: 10, zIndex: 3,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 9px', borderRadius: 999,
              background: 'rgba(11,11,12,0.82)', color: INK,
              fontSize: 11, fontWeight: 600,
            }}
          >
            <Check className="w-3 h-3" style={{ color: BLUE }} strokeWidth={3} />
            Selected
          </span>
        )}

        {/* run-minimum / tier note — word + icon, never color alone */}
        {pkg.note && Note && (
          <span
            style={{
              position: 'absolute', bottom: 10, left: 10, zIndex: 3,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 9px', borderRadius: 999,
              background: 'rgba(11,11,12,0.82)', color: INK,
              fontSize: 11, fontWeight: 600,
            }}
          >
            <Note className="w-3 h-3" style={{ color: SUBINK }} />
            {pkg.note.text}
          </span>
        )}

        {/* sell line lives in the TOP area of the cover, over a top scrim */}
        <div
          aria-hidden
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, height: 92,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute', left: 16, right: 100, top: 14, zIndex: 2,
            fontSize: 15, fontWeight: 600, color: '#fff', lineHeight: 1.3,
            letterSpacing: -0.1,
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}
        >
          {pkg.caption}
        </div>
      </div>

      {/* quiet price line */}
      <div style={{ fontSize: 12, color: SUBINK, marginTop: 10 }}>
        From {money2(pkg.unitCost * railMinRunFactor(pkg.minRun))} / unit at {pkg.minRun.toLocaleString()}
      </div>

      {/* quiet "Start from this package" affordance — appears on hover/focus */}
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          marginTop: 4, fontSize: 12.5, fontWeight: 600,
          color: BLUE,
          opacity: hover || selected ? 1 : 0.35,
          transition: 'opacity 0.2s ease',
        }}
      >
        Start from this package
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </button>
  );
}

// ─── Otis's REAL artist builder catalog (not the press flow) ────────────────
// Steps are Otis's live builder: size → vinyl → color → price → GoodDeed®.

// Sizes shown = only what this press offers. If the press offers a single
// size, hide the whole Pick-a-size step.
const OTIS_SIZES = [
  { id: '12', label: '12"', note: '' },
  { id: '10', label: '10"', note: '' },
  { id: '7', label: '7"', note: '' },
];

// Disc counts — singles to box sets.
const DISC_OPTIONS = [
  { id: 1, label: '1 LP', note: 'Single disc' },
  { id: 2, label: '2 LP', note: 'Double' },
  { id: 3, label: '3 LP', note: 'Triple' },
  { id: 4, label: '4 LP', note: 'Box set' },
];


// Otis's Translucent range — 15 T-numbered colors.
// ─── Catalog colors — PQB's CATALOG_COLORS, verbatim (from
// PressVinylColorSetup INITIAL_CATEGORIES). 11 colors press for 12".
type SwatchKind = 'black' | 'opaque' | 'translucent' | 'splatter';
type CatalogSwatch = {
  id: string; name: string; kind: SwatchKind; kindNote: string; base: string;
  price: number; s1?: string; s2?: string; s3?: string; sizes: string[];
  /** Real press photo of this color — used instead of the layered render. */
  photo?: string;
};

const csw = (id: string, name: string, kind: SwatchKind, kindNote: string, base: string, price: number, extra?: Partial<CatalogSwatch>): CatalogSwatch => ({
  id, name, kind, kindNote, base, price, sizes: ['12', '10', '7'], ...extra,
});

const CATALOG_COLORS: CatalogSwatch[] = [
  csw('BK1', 'Classic Black', 'black', 'Black', '#111114', 1.80),
  csw('T01', 'Ruby',   'translucent', 'Translucent', '#C81E38', 2.30, { photo: rubyVinylPhoto }),
  csw('T02', 'Clear',  'translucent', 'Translucent', '#E8ECEF', 2.40),
  csw('T03', 'Cobalt', 'translucent', 'Translucent', '#2563EB', 2.60),
  csw('OP1', 'Bone White', 'opaque', 'Opaque', '#EDE9DF', 2.40),
  csw('OP3', 'Sea Blue',   'opaque', 'Opaque', '#2B6DA8', 2.40),
  csw('SP1', 'Cosmic',  'splatter', 'Splatter', '#1B3A6B', 3.20, { s1: '#F5F5DC', s2: '#E8C84A', s3: '#E0E0E0', sizes: ['10', '12'] }),
  csw('SP2', 'Classic', 'splatter', 'Splatter', '#C81E38', 3.20, { s1: '#F5F5DC', s2: '#1A1A2E', s3: '#E8C84A', sizes: ['10', '12'] }),
  csw('SP3', 'Forest Mist',   'splatter', 'Splatter', '#3E5E4A', 3.20, { s1: '#DDE5DC', s2: '#8FA98F', s3: '#F0F0EA', sizes: ['10', '12'] }),
  csw('SP4', 'Blue Flame',    'splatter', 'Splatter', '#1E4FA3', 3.20, { s1: '#E8ECEF', s2: '#8FB4E8', s3: '#F5F5DC', sizes: ['10', '12'] }),
  csw('SP5', 'Midnight Gold', 'splatter', 'Splatter', '#141418', 3.20, { s1: '#E8C84A', s2: '#B7942E', s3: '#F0E6C8', sizes: ['10', '12'] }),
];

// Vinyl types — donor "Pick a type. What kind of vinyl?" cards.
const COLOR_TYPES: { id: SwatchKind; name: string }[] = [
  { id: 'black', name: 'Black' },
  { id: 'splatter', name: 'Splatter' },
  { id: 'translucent', name: 'Translucent' },
  { id: 'opaque', name: 'Opaque' },
];

// ─── Pricing engine — PQB's exact numbers and tiering, verbatim ─────────────
const QUANTITIES = [100, 300, 500, 1000, 2000, 3000];

function qtyScale(qty: number): number {
  return qty <= 100 ? 1.0 : qty <= 300 ? 0.88 : qty <= 500 ? 0.80 : qty <= 1000 ? 0.70 : qty <= 2000 ? 0.62 : 0.55;
}

const KIND_MIN_QTY: Record<string, number> = { splatter: 300 };
const WEIGHT_UP = { '140': 0, '180': 0.40 } as Record<string, number>;
const LABEL_PRICE = { blank: 0.10, bw: 0.18, color: 0.25 } as Record<string, number>;
const JACKET_PRICE = { single: 0.81, gatefold: 1.26, trifold: 1.62, discobag: 0.54 } as Record<string, number>;
const SLEEVE_PRICE = { printed: 0.81, unprinted: 0.24, polylined: 0.30 } as Record<string, number>;
const INSERT_PRICE = { none: 0, sheet: 0.67, gatefold: 0.98, booklet: 1.44, poster: 1.65 } as Record<string, number>;
const STICKER_PRICE = { none: 0, rect: 0.30, square: 0.35, circle: 0.45, upc: 0.18 } as Record<string, number>;
const ASSEMBLY_PRICE = 0.36; // insert placed on top before shrink
const SHRINK_PRICE = 0.17;   // retail-ready seal
const SETUP_LINES = [
  { id: 'cutting', name: 'Lacquer cutting', amount: 650 },
  { id: 'plating', name: 'Lacquer plating', amount: 375 },
  { id: 'test', name: 'Test pressing', amount: 175, note: 'Includes 2-day domestic shipping' },
  { id: 'stampers', name: 'Stampers', amount: 0 },
  { id: 'colorfee', name: 'Color setup fee', amount: 95 },
];
const SETUP_TOTAL = SETUP_LINES.reduce((acc, l) => acc + l.amount, 0);
const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });


// ═══════════════════════════════════════════════════════════════════════════
// PQB VISUAL KIT — lifted verbatim from PressQuoteBuilder.tsx (founder: "we
// already have the full examples of icons and all — please use it"). Only the
// tile surfaces are re-skinned dark (CARD instead of bg-white).
// ═══════════════════════════════════════════════════════════════════════════
type LabelKind = 'blank' | 'bw' | 'color';

function LabelLogo({ size, whiteFilter = true }: { size: number; whiteFilter?: boolean }) {
  const showArcText = size >= 70;
  const arcTextFill = whiteFilter ? 'rgba(245,245,247,0.55)' : 'rgba(0,0,0,0.38)';
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      <img
        src={PRESS_LABEL_LOGO}
        alt=""
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * 0.9,
          height: size * 0.9,
          objectFit: 'contain',
          filter: whiteFilter ? PRESS_LABEL_LOGO_FILTER : undefined,
        }}
      />
      {showArcText && (
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <path id="artist-lbl-arc-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill={arcTextFill} style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#artist-lbl-arc-bottom" startOffset="50%" textAnchor="middle">
              MRP-001 · 33 ⅓ RPM
            </textPath>
          </text>
        </svg>
      )}
    </div>
  );
}

// Center label per style — verbatim from PressQuoteBuilder's CenterLabel.
function CenterLabel({ kind, size }: { kind: LabelKind; size: number }) {
  const base: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: size,
    height: size,
    borderRadius: '50%',
    overflow: 'hidden',
  };
  const showLogo = size >= 24;

  if (kind === 'blank') {
    return (
      <div
        style={{
          ...base,
          background: 'radial-gradient(circle at 42% 36%, #ffffff 0%, #f0f0f0 55%, #e8e8e8 100%)',
          boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.08)',
        }}
      />
    );
  }

  if (kind === 'bw') {
    return (
      <div style={{ ...base, background: 'radial-gradient(circle at 42% 36%, #ffffff 0%, #f4f4f4 60%, #ebebeb 100%)', boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.07)' }}>
        {showLogo && <LabelLogo size={size} whiteFilter={false} />}
      </div>
    );
  }

  return (
    <div style={{ ...base }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'conic-gradient(from 210deg,' +
            '#e91e8c 0deg, #8e2de2 55deg, #2a52d8 110deg,' +
            '#0fa596 165deg, #2e9e3f 210deg, #d99a00 265deg,' +
            '#e05a1a 305deg, #e91e8c 360deg)',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 60% at 70% 74%, rgba(255,210,74,0.55), rgba(255,210,74,0) 62%)', mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(55% 55% at 30% 26%, rgba(120,150,255,0.55), rgba(120,150,255,0) 60%)', mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(46% 46% at 50% 50%, rgba(0,0,0,0.52), rgba(0,0,0,0) 74%)' }} />
      {showLogo && <LabelLogo size={size} />}
    </div>
  );
}

// Black record with the chosen label style — PQB's LabelDisc, static body.
function LabelDisc({ size, kind }: { size: number; kind: LabelKind }) {
  const LABEL_RATIO = 3.94 / 12;
  const INNER_RATIO = 129 / 1104;
  const holeRatio = 0.025;
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#000000',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%' }}>
        <MaskLayer color="#0b0b0d" mask={LAYERS.opaque} />
        <CenterLabel kind={kind} size={size * LABEL_RATIO} />
        <img
          src={LAYERS.inner}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: size * INNER_RATIO,
            height: size * INNER_RATIO,
            opacity: 1,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#ffffff',
          opacity: 0.6,
          maskImage: `url(${LAYERS.highlights})`,
          WebkitMaskImage: `url(${LAYERS.highlights})`,
          maskSize: '100% 100%',
          WebkitMaskSize: '100% 100%',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * holeRatio,
          height: size * holeRatio,
          borderRadius: '50%',
          backgroundColor: CANVAS,
          boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// PQB's LabelTile — mini record with the label style rendered on it.
function LabelTile({ style: s, active, onSelect }: {
  style: { id: LabelKind; name: string; note: string }; active: boolean; onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      aria-pressed={active}
      data-testid={`label-${s.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 16, background: active ? CARD_RAISED : CARD, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 12 }}>
        <div style={{ width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LabelDisc size={96} kind={s.id} />
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {s.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: FAINT, lineHeight: 1.35 }}>
        {s.note}
      </div>
    </div>
  );
}

// PQB's rainbow full-color print face — used by jacket/insert thumbnails.
function RainbowPrintFace({ logoSize }: { logoSize: number }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'conic-gradient(from 210deg,' +
            '#e91e8c 0deg, #8e2de2 55deg, #2a52d8 110deg,' +
            '#0fa596 165deg, #2e9e3f 210deg, #d99a00 265deg,' +
            '#e05a1a 305deg, #e91e8c 360deg)',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 60% at 70% 74%, rgba(255,210,74,0.55), rgba(255,210,74,0) 62%)', mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(55% 55% at 30% 26%, rgba(120,150,255,0.55), rgba(120,150,255,0) 60%)', mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(46% 46% at 50% 50%, rgba(0,0,0,0.52), rgba(0,0,0,0) 74%)' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: logoSize, height: logoSize, objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER, opacity: 0.92 }} />
      </div>
    </>
  );
}

// ─── Jackets — PQB's catalog + tile visuals, verbatim ───────────────────────
type JacketVariant = { id: string; label: string; note: string };
type JacketOption = {
  id: string;
  name: string;
  note: string;
  gatefoldPanels: 0 | 1 | 2;
  printed: boolean;
  variants: JacketVariant[];
};

const V_STANDARD: JacketVariant = { id: 'standard', label: 'Standard', note: '' };
const V_WIDESPINE: JacketVariant = { id: 'widespine', label: 'Widespine', note: 'Wider spine — fits 2LP sets and heavyweight pressings.' };
const V_TIPON: JacketVariant = { id: 'tipon', label: 'Old-Style Tip-On', note: 'Artwork printed on textured paper, wrapped and glued over the board — the vintage look.' };

const JACKET_CATALOG: Record<string, JacketOption[]> = {
  '7': [
    { id: 'single',   name: 'Single Jacket',   note: 'Standard printed jacket. You supply the artwork.', gatefoldPanels: 0, printed: true, variants: [
      { id: 'nospine', label: 'No Spine',  note: 'Flat pocket — the classic 45 sleeve.' },
      { id: 'spine3',  label: '3mm Spine', note: 'Adds a slim printable spine.' },
    ] },
    { id: 'gatefold', name: 'Gatefold Jacket', note: 'Two-panel fold-out. Extra interior art space.', gatefoldPanels: 1, printed: true, variants: [V_STANDARD] },
  ],
  '10': [
    { id: 'single',   name: 'Single Jacket',   note: 'Standard printed jacket. You supply the artwork.', gatefoldPanels: 0, printed: true, variants: [V_STANDARD, V_WIDESPINE] },
    { id: 'gatefold', name: 'Gatefold Jacket', note: 'Two-panel fold-out. Extra interior art space.',     gatefoldPanels: 1, printed: true, variants: [V_STANDARD] },
  ],
  '12': [
    { id: 'single',   name: 'Single Jacket',            note: 'Standard printed jacket. You supply the artwork.', gatefoldPanels: 0, printed: true,  variants: [V_STANDARD, V_WIDESPINE, V_TIPON] },
    { id: 'gatefold', name: 'Gatefold Jacket',          note: 'Two-panel fold-out. Extra interior art space.',     gatefoldPanels: 1, printed: true,  variants: [V_STANDARD, V_TIPON] },
    { id: 'trifold',  name: 'Tri-Fold Gatefold Jacket', note: 'Three-panel fold-out. Maximum interior canvas.',    gatefoldPanels: 2, printed: true,  variants: [V_STANDARD] },
    { id: 'discobag', name: 'Discobag',                 note: 'Plain inner sleeve with die-cut center window.',    gatefoldPanels: 0, printed: false, variants: [V_STANDARD] },
  ],
};

const GATEFOLD_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const THUMB = 64;
const THUMB_LOGO = 0.52;

function JacketThumbnail({ jacket, size = THUMB }: { jacket: JacketOption; size?: number }) {
  if (jacket.id === 'discobag') {
    const hole = size * 0.33;
    return (
      <div
        style={{
          width: size, height: size, position: 'relative', overflow: 'hidden',
          background: '#0a0a0a', border: '1.5px solid #222', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: hole, height: hole,
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'radial-gradient(circle at 42% 36%, #ffffff 0%, #f2f2f2 60%, #e8e8e8 100%)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 3px rgba(0,0,0,0.30)',
        }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: Math.max(2, hole * 0.10), height: Math.max(2, hole * 0.10), borderRadius: '50%', background: '#0a0a0a' }} />
        </div>
      </div>
    );
  }

  const panels = jacket.gatefoldPanels;
  return (
    <div
      style={{
        width: size, height: size, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
        boxShadow: '0 3px 10px rgba(0,0,0,0.40)', flexShrink: 0,
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.12)' }} />
      {panels >= 1 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)', transform: 'translateX(-50%)' }} />}
      {panels >= 2 && (
        <>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '33.3%', width: 1, background: 'rgba(255,255,255,0.12)' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '66.6%', width: 1, background: 'rgba(255,255,255,0.12)' }} />
        </>
      )}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: size * THUMB_LOGO, height: size * THUMB_LOGO, objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER, opacity: 0.90 }} />
      </div>
    </div>
  );
}

// PQB's JacketTile — hover opens the gatefold fold.
function JacketTile({ jacket, active, variantId, onSelect, onVariantSelect }: {
  jacket: JacketOption;
  active: boolean;
  variantId: string;
  onSelect: () => void;
  onVariantSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const showFold = hovered && jacket.gatefoldPanels > 0;
  const hasVariants = jacket.variants.length > 1;
  const selectedVariant = jacket.variants.find((v) => v.id === variantId);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`jacket-${jacket.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, background: active ? CARD_RAISED : CARD, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ flexShrink: 0, display: 'flex', perspective: '300px', perspectiveOrigin: '50% 50%' }}>
        {jacket.gatefoldPanels === 0 ? (
          <JacketThumbnail jacket={jacket} size={THUMB} />
        ) : jacket.gatefoldPanels === 1 ? (
          <div style={{ position: 'relative', width: THUMB, height: THUMB, perspective: '300px' }}>
            <div style={{ position: 'absolute', inset: 0, background: '#E8DBCA', overflow: 'hidden', zIndex: 1 }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 7, fontWeight: 600, color: 'rgba(80,60,30,0.32)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Interior</span>
              </div>
            </div>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
              transformOrigin: 'left center',
              transform: showFold ? 'rotateY(-75deg)' : 'rotateY(0deg)',
              transition: `transform 600ms ${GATEFOLD_EASE}`,
              willChange: 'transform',
              overflow: 'hidden', zIndex: 2,
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: THUMB * THUMB_LOGO, height: THUMB * THUMB_LOGO, objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER, opacity: 0.90 }} />
              </div>
            </div>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, background: 'rgba(0,0,0,0.45)', zIndex: 4 }} />
          </div>
        ) : (
          <div style={{ position: 'relative', width: THUMB, height: THUMB, perspective: '300px' }}>
            <div style={{ position: 'absolute', inset: 0, background: '#E8DBCA', overflow: 'hidden', zIndex: 1 }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 6, fontWeight: 600, color: 'rgba(80,60,30,0.32)', letterSpacing: 1.2, textTransform: 'uppercase' }}>Interior</span>
              </div>
            </div>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(155deg, #1c1c22 0%, #0f0f14 100%)',
              transformOrigin: 'right center',
              transform: showFold ? 'rotateY(75deg)' : 'rotateY(0deg)',
              transition: `transform 600ms ${GATEFOLD_EASE}`,
              willChange: 'transform',
              overflow: 'hidden', zIndex: 2,
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.10)' }} />
            </div>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
              transformOrigin: 'left center',
              transform: showFold ? 'rotateY(-75deg)' : 'rotateY(0deg)',
              transition: `transform 600ms ${GATEFOLD_EASE}`,
              willChange: 'transform',
              overflow: 'hidden', zIndex: 3,
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: THUMB * THUMB_LOGO, height: THUMB * THUMB_LOGO, objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER, opacity: 0.90 }} />
              </div>
            </div>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, background: 'rgba(0,0,0,0.40)', zIndex: 4 }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 1, background: 'rgba(0,0,0,0.40)', zIndex: 4 }} />
          </div>
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
          {jacket.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: FAINT, lineHeight: 1.4 }}>
          {jacket.note}
        </div>
        {active && hasVariants && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: `1px solid ${HAIRLINE}` }}>
              {jacket.variants.map((v) => {
                const vActive = v.id === variantId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onVariantSelect(v.id)}
                    aria-pressed={vActive}
                    data-testid={`variant-${jacket.id}-${v.id}`}
                    className="transition-all focus:outline-none"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: vActive ? INK : SUBINK,
                      background: vActive ? CARD_RAISED : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
            {selectedVariant && selectedVariant.note && (
              <div className="text-[11.5px]" style={{ marginTop: 8, color: FAINT, lineHeight: 1.4 }}>
                {selectedVariant.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Weights — PQB's VINYL_WEIGHTS, verbatim ────────────────────────────────
const VINYL_WEIGHTS = [
  { id: '140', label: '140g', note: 'Standard' },
  { id: '180', label: '180g', note: 'Heavyweight' },
];

// ─── Inner sleeves — PQB's catalog + thumbnails + tile, verbatim ────────────
type SleeveVariant = { id: string; label: string; note: string };
type SleeveOption = {
  id: 'printed' | 'unprinted' | 'polylined';
  name: string;
  note: string;
  variants: SleeveVariant[];
};

const SLEEVE_OPTIONS: SleeveOption[] = [
  {
    id: 'printed',
    name: 'Printed',
    note: 'Full-color print on the sleeve face. Artist supplies artwork.',
    variants: [
      { id: 'board', label: 'Board Weight', note: 'Heavier board stock. More rigid — protects the record better.' },
      { id: 'paper', label: 'Paper',        note: 'Single-sided print on standard paper stock.' },
    ],
  },
  {
    id: 'unprinted',
    name: 'Unprinted',
    note: 'Plain paper sleeve. Clean and minimal — no artwork required.',
    variants: [
      { id: 'white', label: 'White', note: '' },
      { id: 'black', label: 'Black', note: '' },
    ],
  },
  {
    id: 'polylined',
    name: 'Polylined',
    note: 'Paper with anti-static poly lining. Protects against dust and scratches.',
    variants: [
      { id: 'white', label: 'White', note: '' },
      { id: 'black', label: 'Black', note: '' },
    ],
  },
];

type SleeveLook = {
  color: 'white' | 'black';
  printed: boolean;
  polylined: boolean;
  boardWeight: boolean;
};

function sleeveLook(style: SleeveOption, variantId: string): SleeveLook {
  if (style.id === 'printed') {
    return { color: 'white', printed: true, polylined: false, boardWeight: variantId === 'board' };
  }
  return {
    color: variantId === 'black' ? 'black' : 'white',
    printed: false,
    polylined: style.id === 'polylined',
    boardWeight: false,
  };
}

const SLEEVE_HOLE_RATIO = 0.33;

function SleeveThumbnail({ sleeve, size = 48 }: { sleeve: SleeveLook; size: number }) {
  const isBlack = sleeve.color === 'black';
  const bg      = isBlack ? '#0a0a0a' : '#ffffff';
  const border  = isBlack ? '1.5px solid #333' : `1.5px solid ${HAIRLINE}`;
  const hole    = size * SLEEVE_HOLE_RATIO;

  const holeRadius = hole / 2;
  const holeMask = sleeve.polylined
    ? `radial-gradient(circle at 50% 50%, transparent ${holeRadius}px, black ${holeRadius + 1}px)`
    : undefined;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        background: sleeve.printed
          ? 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)'
          : bg,
        border,
        overflow: 'hidden',
        ...(holeMask ? { maskImage: holeMask, WebkitMaskImage: holeMask } : {}),
      }}>
        {sleeve.printed && <RainbowPrintFace logoSize={size * 0.52} />}
        {sleeve.boardWeight && (
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 3, background: 'rgba(255,255,255,0.25)' }} />
        )}
      </div>
      {sleeve.polylined && (
        <div style={{
          position: 'absolute', zIndex: 1,
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: hole, height: hole, borderRadius: '50%',
          background: 'linear-gradient(115deg, rgba(176,196,214,0.10) 0%, rgba(255,255,255,0.55) 34%, rgba(176,196,214,0.12) 52%, rgba(255,255,255,0.40) 72%, rgba(176,196,214,0.10) 100%)',
        }} />
      )}
    </div>
  );
}

function SleeveTile({ sleeve, active, variantId, onSelect, onVariantSelect }: {
  sleeve: SleeveOption;
  active: boolean;
  variantId: string;
  onSelect: () => void;
  onVariantSelect: (id: string) => void;
}) {
  const selectedVariant = sleeve.variants.find((v) => v.id === variantId);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`sleeve-${sleeve.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, background: active ? CARD_RAISED : CARD, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <SleeveThumbnail sleeve={sleeveLook(sleeve, variantId)} size={64} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
          {sleeve.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: FAINT, lineHeight: 1.4 }}>
          {sleeve.note}
        </div>
        {active && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: `1px solid ${HAIRLINE}` }}>
              {sleeve.variants.map((v) => {
                const vActive = v.id === variantId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onVariantSelect(v.id)}
                    aria-pressed={vActive}
                    data-testid={`sleeve-variant-${sleeve.id}-${v.id}`}
                    className="transition-all focus:outline-none"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: vActive ? INK : SUBINK,
                      background: vActive ? CARD_RAISED : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
            {selectedVariant && selectedVariant.note && (
              <div className="text-[11.5px]" style={{ marginTop: 8, color: FAINT, lineHeight: 1.4 }}>
                {selectedVariant.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inserts — PQB's catalog + thumbnails + tile, verbatim ──────────────────
type InsertVariant = { id: string; label: string; note: string };
type InsertOption = {
  id: 'none' | 'sheet' | 'gatefold' | 'booklet' | 'poster';
  name: string;
  note: string;
  variants: InsertVariant[];
};

const INSERT_OPTIONS: InsertOption[] = [
  { id: 'none', name: 'None', note: 'No insert — the record ships without printed extras.', variants: [] },
  { id: 'sheet', name: 'Insert Sheet', note: 'Full-color flat sheet — lyrics, credits, liner notes. Printed both sides.', variants: [] },
  { id: 'gatefold', name: 'Gatefold Insert', note: 'Two-panel fold-out that opens from the center. Printed both sides.', variants: [] },
  { id: 'booklet', name: 'Booklet', note: 'Stapled multi-page booklet. Room for lyrics, art, and stories.', variants: [
    { id: 'p4', label: '4-Page', note: '' },
    { id: 'p8', label: '8-Page', note: '' },
  ] },
  { id: 'poster', name: 'Poster', note: 'Large fold-out poster that ships inside the jacket.', variants: [
    { id: 'small', label: '18" × 24"', note: 'Folds to fit the jacket.' },
    { id: 'large', label: '24" × 36"', note: 'Full wall poster — folds to fit.' },
  ] },
];

const POSTER_RATIO: Record<'small' | 'large', number> = { small: 18 / 24, large: 24 / 36 };

function InsertThumbnail({ insert, variantId, size = 64 }: { insert: InsertOption; variantId: string; size?: number }) {
  if (insert.id === 'none') {
    return (
      <div style={{
        width: size, height: size, flexShrink: 0,
        border: `1.5px dashed ${HAIRLINE}`, borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: FAINT, fontSize: 18, fontWeight: 300,
      }}>—</div>
    );
  }

  if (insert.id === 'gatefold' || insert.id === 'booklet') {
    return (
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', border: '1.5px solid #333', background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)' }}>
          <RainbowPrintFace logoSize={size * 0.52} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'linear-gradient(90deg, rgba(0,0,0,0.45), rgba(0,0,0,0))' }} />
        </div>
      </div>
    );
  }

  const isPoster = insert.id === 'poster';
  const posterW = isPoster ? Math.round(size * POSTER_RATIO[(variantId as 'small' | 'large') || 'small']) : size;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        position: 'relative',
        width: posterW, height: size,
        background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
        border: '1.5px solid #333',
        overflow: 'hidden',
        transition: 'width 0.35s cubic-bezier(0.32, 0.72, 0.28, 1)',
      }}>
        <RainbowPrintFace logoSize={Math.min(posterW, size) * 0.52} />
        {isPoster && variantId === 'small' && (
          <>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
          </>
        )}
        {isPoster && variantId === 'large' && (
          <>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: '33.33%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: '66.66%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
          </>
        )}
      </div>
    </div>
  );
}

function InsertTile({ insert, active, variantId, onSelect, onVariantSelect }: {
  insert: InsertOption;
  active: boolean;
  variantId: string;
  onSelect: () => void;
  onVariantSelect: (id: string) => void;
}) {
  const selectedVariant = insert.variants.find((v) => v.id === variantId);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`insert-${insert.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, background: active ? CARD_RAISED : CARD, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <InsertThumbnail insert={insert} variantId={variantId} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
          {insert.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: FAINT, lineHeight: 1.4 }}>
          {insert.note}
        </div>
        {active && insert.variants.length > 0 && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: `1px solid ${HAIRLINE}` }}>
              {insert.variants.map((v) => {
                const vActive = v.id === variantId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onVariantSelect(v.id)}
                    aria-pressed={vActive}
                    data-testid={`insert-variant-${insert.id}-${v.id}`}
                    className="transition-all focus:outline-none"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: vActive ? INK : SUBINK,
                      background: vActive ? CARD_RAISED : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
            {selectedVariant && selectedVariant.note && (
              <div className="text-[11.5px]" style={{ marginTop: 8, color: FAINT, lineHeight: 1.4 }}>
                {selectedVariant.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stickers — PQB's die-cut sticker catalog + tiles, verbatim ─────────────
type StickerShapeId = 'rect' | 'square' | 'circle' | 'upc';

type StickerSize = {
  id: string;
  name: string;
  wIn: number;
  hIn: number;
};

type StickerShape = {
  id: StickerShapeId;
  name: string;
  note: string;
  kind: 'promo' | 'upc';
  round: boolean;
  sizes: StickerSize[];
};

const sz = (wIn: number, hIn: number, round = false): StickerSize => ({
  id: `${wIn}x${hIn}`,
  name: round ? `${wIn}"` : `${wIn}" × ${hIn}"`,
  wIn,
  hIn,
});

const STICKER_SHAPES: StickerShape[] = [
  {
    id: 'rect',
    name: 'Rectangle',
    note: 'Wide promo strips and title stickers.',
    kind: 'promo',
    round: false,
    sizes: [sz(1.5, 1), sz(2, 1), sz(2, 3), sz(2, 4), sz(2.5, 1)],
  },
  {
    id: 'square',
    name: 'Square',
    note: 'Compact hype squares, tiny to full-size.',
    kind: 'promo',
    round: false,
    sizes: [sz(1, 1), sz(1.5, 1.5), sz(2, 2), sz(2.5, 2.5), sz(3, 3), sz(3.5, 3.5), sz(4, 4)],
  },
  {
    id: 'circle',
    name: 'Circle',
    note: 'Classic round hype stickers.',
    kind: 'promo',
    round: true,
    sizes: [sz(1, 1, true), sz(1.5, 1.5, true), sz(2, 2, true), sz(2.5, 2.5, true), sz(3, 3, true), sz(3.5, 3.5, true), sz(4, 4, true)],
  },
  {
    id: 'upc',
    name: 'UPC',
    note: 'Barcode retailers scan — one standard size.',
    kind: 'upc',
    round: false,
    sizes: [sz(1.75, 0.75)],
  },
];

const UPC_BARS = [
  2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 1, 2, 2, 1, 3, 1, 1, 2,
  1, 1, 2, 1, 3, 1, 1, 2, 1, 2, 2, 1, 1, 3, 1, 1, 2, 1, 1, 2,
];

function Barcode({ height, scale = 1 }: { height: number; scale?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 * scale }}>
      <div style={{ display: 'flex', alignItems: 'stretch', height, gap: 1 * scale }} aria-hidden>
        {UPC_BARS.map((w, i) => (
          <div
            key={i}
            style={{
              width: Math.max(1, w * scale),
              background: i % 2 === 0 ? '#111114' : 'transparent',
            }}
          />
        ))}
      </div>
      {scale >= 0.9 && (
        <div style={{ fontSize: 8 * scale, letterSpacing: 2 * scale, color: '#111114', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          8 12345 67890 4
        </div>
      )}
    </div>
  );
}

// The sticker itself is white die-cut stock — it stays white on the dark card.
function Sticker({
  size,
  shape,
  pxPerInch,
}: {
  size: StickerSize;
  shape: StickerShape;
  pxPerInch: number;
}) {
  const kind = shape.kind;
  const w = Math.round(size.wIn * pxPerInch);
  const h = Math.round(size.hIn * pxPerInch);
  const isCircle = shape.round;
  const radius = isCircle ? '50%' : Math.round(pxPerInch * 0.09);
  const minDim = Math.min(w, h);

  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height: h,
        borderRadius: radius,
        background: 'radial-gradient(circle at 40% 30%, #ffffff 0%, #f7f7f8 62%, #eeeef0 100%)',
        border: '1px solid rgba(0,0,0,0.07)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06), inset 0 1px 2px rgba(255,255,255,0.9)',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {kind === 'promo' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: minDim * 0.05, padding: minDim * 0.12 }}>
          <img
            src={PRESS_LABEL_LOGO}
            alt=""
            aria-hidden
            style={{ width: minDim * 0.52, height: minDim * 0.52, objectFit: 'contain' }}
          />
          {minDim >= 120 && (
            <div
              style={{
                fontSize: Math.max(7, minDim * 0.045),
                fontWeight: 700,
                letterSpacing: minDim * 0.012,
                textTransform: 'uppercase',
                color: '#6e6e73',
                whiteSpace: 'nowrap',
              }}
            >
              Limited Pressing
            </div>
          )}
        </div>
      ) : (
        <Barcode height={h * 0.34} scale={minDim / 200} />
      )}
    </div>
  );
}

function ShapeTile({
  shape,
  active,
  onSelect,
}: {
  shape: StickerShape;
  active: boolean;
  onSelect: () => void;
}) {
  const rep = shape.sizes[Math.floor(shape.sizes.length / 2)];
  const tilePxPerInch = 76 / Math.max(rep.wIn, rep.hIn);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`sticker-shape-${shape.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 16, background: active ? CARD_RAISED : CARD, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 12 }}>
        <div style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sticker size={rep} shape={shape} pxPerInch={tilePxPerInch} />
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {shape.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: FAINT, lineHeight: 1.35 }}>
        {shape.sizes.length === 1 ? shape.sizes[0].name : `${shape.sizes.length} sizes`}
      </div>
    </div>
  );
}

function NoneShapeTile({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid="sticker-shape-none"
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 16, background: active ? CARD_RAISED : CARD, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 12 }}>
        <div style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 64, height: 64,
            border: `1.5px dashed ${HAIRLINE}`, borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: FAINT, fontSize: 18, fontWeight: 300,
          }}>—</div>
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        None
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: FAINT, lineHeight: 1.35 }}>
        No sticker on the shrink-wrap.
      </div>
    </div>
  );
}

function SizeCard({
  size,
  round,
  active,
  onSelect,
}: {
  size: StickerSize;
  round: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`sticker-size-${size.id}`}
      className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
      style={{ padding: '14px 10px', background: active ? CARD_RAISED : CARD, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
    >
      <div className="text-[15px] font-semibold" style={{ color: active ? BLUE : INK }}>{size.name}</div>
      <div className="text-[11px]" style={{ marginTop: 2, color: FAINT }}>
        {round ? 'Circle' : size.wIn === size.hIn ? 'Square' : 'Rectangle'}
      </div>
    </button>
  );
}

// Label styles — PQB's catalog, verbatim.
const LABEL_STYLES: { id: LabelKind; name: string; note: string }[] = [
  { id: 'color', name: 'Full Color', note: 'Vibrant full-color label — artists supply the design.' },
  { id: 'bw', name: 'Black & White', note: 'White label with a single-color black logo print.' },
  { id: 'blank', name: 'Blank', note: 'Unprinted white label. No artwork required.' },
];


// ═══════════════════════════════════════════════════════════════════════════
// STEP-AWARE STAGES — PQB's per-band sticky previews, lifted verbatim (dark
// reskin only). Each SplitSection band carries its own left stage, so the
// preview always matches the step in view — PQB's exact mechanism.
// ═══════════════════════════════════════════════════════════════════════════
const JS_BASE = 321;
const SS = 321;
const STAGE_PX_PER_INCH = 75;
const PILL_SHADOW = '0 1px 3px rgba(0,0,0,0.40)';

function JacketStage({ jacketType, widespine = false, tipOn = false }: { jacketType: JacketOption | null; widespine?: boolean; tipOn?: boolean }) {
  const JS = JS_BASE;
  const SPINE_W = widespine ? 20 : 10;
  const panels = jacketType?.gatefoldPanels ?? 0;
  const isGatefold = panels > 0;
  const [open, setOpen] = useState(false);
  const [showVinyl, setShowVinyl] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isDiscobag = jacketType?.id === 'discobag';

  const HOLE_D = JS * (368 / 1104);
  const HOLE_R = HOLE_D / 2;

  useEffect(() => {
    if (isGatefold && !tipOn) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
    setOpen(false);
    return undefined;
  }, [jacketType?.id, isGatefold, tipOn]);

  useEffect(() => {
    if (!isDiscobag) setShowVinyl(false);
  }, [isDiscobag]);

  function PrintedFace() {
    const P = JS * 0.16;
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: JS * 0.52, height: JS * 0.52, objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER, opacity: 0.92 }} />
        </div>
        {tipOn && (
          <div style={{ position: 'absolute', top: 0, right: 0, width: P, height: P, pointerEvents: 'none' }}>
            <div style={{
              position: 'absolute', inset: 0,
              clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
              background: 'linear-gradient(135deg, #c4b294 0%, #a8946f 100%)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.25)',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              clipPath: 'polygon(0 0, 100% 100%, 0 100%)',
              background: 'linear-gradient(315deg, #ffffff 0%, #f3ecdf 45%, #ddd2bd 100%)',
              filter: 'drop-shadow(-2px 2px 3px rgba(0,0,0,0.35))',
              borderRadius: '0 0 0 4px',
            }} />
            <div style={{
              position: 'absolute', top: 0, left: 0, width: Math.SQRT2 * P, height: 1.5,
              transformOrigin: '0 0', transform: 'rotate(45deg)',
              background: 'rgba(255,255,255,0.55)',
            }} />
          </div>
        )}
      </div>
    );
  }

  function KraftFace() {
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#E8DBCA', overflow: 'hidden' }}>
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${(i + 1) * 6.5}%`, height: 1, background: 'rgba(0,0,0,0.035)' }} />
        ))}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(80,60,30,0.28)', letterSpacing: 2.5, textTransform: 'uppercase' }}>Interior</span>
        </div>
      </div>
    );
  }

  function DiscobagFace() {
    const holeMask = `radial-gradient(circle ${HOLE_R}px at 50% 50%, transparent ${HOLE_R}px, black ${HOLE_R + 0.5}px)`;
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        {showVinyl && (
          <div style={{ position: 'absolute', inset: 0, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: JS * 0.86, height: JS * 0.86, borderRadius: '50%',
              background: 'radial-gradient(circle at 34% 30%, #1a1a1a 0%, #050505 60%)',
              flexShrink: 0, position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {[0.82, 0.68, 0.54, 0.40].map((r) => (
                <div key={r} style={{
                  position: 'absolute',
                  width: `${r * 100}%`, height: `${r * 100}%`,
                  borderRadius: '50%',
                  border: '0.5px solid rgba(255,255,255,0.04)',
                  pointerEvents: 'none',
                }} />
              ))}
              <div style={{
                width: HOLE_D * 0.96, height: HOLE_D * 0.96, borderRadius: '50%',
                background: '#ffffff',
                flexShrink: 0, position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{
                  width: HOLE_D * 0.56, height: HOLE_D * 0.56,
                  objectFit: 'contain',
                  filter: 'none',
                  opacity: 0.78,
                }} />
                <div style={{
                  position: 'absolute', width: HOLE_D * 0.075, height: HOLE_D * 0.075,
                  borderRadius: '50%', background: '#f5f5f7',
                }} />
              </div>
            </div>
          </div>
        )}

        <div style={{
          position: 'absolute', inset: 0,
          background: '#0a0a0a',
          WebkitMaskImage: holeMask,
          maskImage: holeMask,
        }}>
          <div style={{ position: 'absolute', top: JS * 0.10, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#444', letterSpacing: 2, textTransform: 'uppercase' }}>Discobag</span>
          </div>
        </div>

        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: HOLE_D, height: HOLE_D, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.50)',
          pointerEvents: 'none',
        }} />
      </div>
    );
  }

  function FrontFace() {
    if (jacketType?.id === 'discobag') return <DiscobagFace />;
    return <PrintedFace />;
  }

  const tilt = (!isGatefold || !open)
    ? 'perspective(1200px) rotateY(-8deg) rotateX(2deg)'
    : 'perspective(1200px) rotateY(0deg) rotateX(0deg)';

  const shadowWidthMultiplier = 1;

  if (jacketType === null) {
    return (
      <div style={{
        width: JS, height: JS, flexShrink: 0,
        border: '1.5px dashed #d0d0d5', borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        color: FAINT,
      }}>
        <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <rect x={4} y={4} width={28} height={28} rx={1} />
          <line x1={16} y1={4} x2={16} y2={32} />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Select a jacket style</span>
      </div>
    );
  }

  const openGatefold = () => { if (isGatefold) { clearTimeout(closeTimer.current); setOpen(true); } };
  const scheduleClose = () => { if (isGatefold) { closeTimer.current = setTimeout(() => setOpen(false), 200); } };

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={openGatefold}
      onMouseLeave={scheduleClose}
    >
      <div style={{
        position: 'relative',
        width: JS,
        height: JS,
        flexShrink: 0,
        zIndex: 2,
        transform: tilt,
        transition: `transform 600ms ${GATEFOLD_EASE}`,
        transformStyle: 'preserve-3d',
      }}>
        <div style={{ position: 'absolute', inset: 0, perspective: '1200px', perspectiveOrigin: '50% 50%', overflow: 'visible' }}>
          {panels === 0 && (
            <div style={{ position: 'absolute', inset: 0 }}>
              <FrontFace />
            </div>
          )}

          {panels === 1 && (
            <>
              <div style={{
                position: 'absolute',
                top: open ? 0 : 5, left: open ? 0 : -5,
                width: JS, height: JS,
                overflow: 'hidden', zIndex: 1,
                transition: `top 600ms ${GATEFOLD_EASE}, left 600ms ${GATEFOLD_EASE}`,
              }}>
                <KraftFace />
              </div>
              <div
                onMouseEnter={openGatefold}
                onMouseLeave={scheduleClose}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: JS, height: JS,
                  transformOrigin: 'left center',
                  transform: open ? 'rotateY(-75deg)' : 'rotateY(0deg)',
                  transition: `transform 600ms ${GATEFOLD_EASE}`,
                  willChange: 'transform',
                  zIndex: 2, overflow: 'hidden',
                }}>
                <FrontFace />
              </div>
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: 2,
                background: 'rgba(0,0,0,0.40)', zIndex: 3, pointerEvents: 'none',
                opacity: open ? 1 : 0, transition: `opacity 300ms ease 150ms`,
              }} />
              {open && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0) 60%)',
                  zIndex: 0, pointerEvents: 'none',
                }} />
              )}
            </>
          )}

          {panels === 2 && (
            <>
              {[8, 4].map((offset, i) => (
                <div key={i} style={{
                  position: 'absolute', top: offset, left: -offset,
                  width: JS, height: JS,
                  overflow: 'hidden', zIndex: i,
                  opacity: open ? 0 : 1,
                  transition: `opacity 150ms ease`, pointerEvents: 'none',
                }}>
                  <PrintedFace />
                  <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.14 + i * 0.08})` }} />
                </div>
              ))}
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1 }}>
                <KraftFace />
              </div>
              <div
                onMouseEnter={openGatefold}
                onMouseLeave={scheduleClose}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: JS, height: JS,
                  transformOrigin: 'right center',
                  transform: open ? 'rotateY(75deg)' : 'rotateY(0deg)',
                  transition: `transform 600ms ${GATEFOLD_EASE}`,
                  willChange: 'transform',
                  zIndex: 2, overflow: 'hidden',
                }}>
                <FrontFace />
              </div>
              <div
                onMouseEnter={openGatefold}
                onMouseLeave={scheduleClose}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: JS, height: JS,
                  transformOrigin: 'left center',
                  transform: open ? 'rotateY(-75deg)' : 'rotateY(0deg)',
                  transition: `transform 600ms ${GATEFOLD_EASE}`,
                  willChange: 'transform',
                  zIndex: 3, overflow: 'hidden',
                }}>
                <FrontFace />
              </div>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 2, background: 'rgba(0,0,0,0.40)', zIndex: 4, pointerEvents: 'none', opacity: open ? 1 : 0, transition: `opacity 300ms ease 150ms` }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 2, background: 'rgba(0,0,0,0.40)', zIndex: 4, pointerEvents: 'none', opacity: open ? 1 : 0, transition: `opacity 300ms ease 150ms` }} />
            </>
          )}
        </div>

        {!open && (
          <div style={{
            position: 'absolute', top: 0, right: -SPINE_W, bottom: 0, width: SPINE_W,
            background: 'linear-gradient(90deg, #0a0a10 0%, #1a1a22 100%)',
            transform: 'rotateY(90deg)', transformOrigin: 'left center',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      <div style={{
        position: 'absolute',
        bottom: -14,
        left: '50%',
        transform: 'translateX(-50%)',
        width: JS * shadowWidthMultiplier * 0.88,
        height: 22,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.10) 55%, transparent 80%)',
        pointerEvents: 'none',
        zIndex: 0,
        willChange: 'width',
        transition: `width 600ms ${GATEFOLD_EASE}`,
      }} />

      {isDiscobag && (
        <button
          type="button"
          onClick={() => setShowVinyl((v) => !v)}
          aria-label={showVinyl ? 'Hide vinyl inside' : 'Show vinyl inside'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 14,
            padding: '5px 12px 5px 10px',
            borderRadius: 999,
            background: CARD_RAISED,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: `1px solid ${HAIRLINE}`,
            boxShadow: PILL_SHADOW,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            color: SUBINK,
            transition: 'color 120ms ease, background 120ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = INK; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = SUBINK; }}
        >
          {showVinyl
            ? <EyeOff style={{ width: 13, height: 13, flexShrink: 0 }} />
            : <Eye style={{ width: 13, height: 13, flexShrink: 0 }} />}
          {showVinyl ? 'Hide vinyl' : 'Vinyl inside'}
        </button>
      )}
    </div>
  );
}

function SleeveStage({ sleeve }: { sleeve: SleeveLook }) {
  const isBlack = sleeve.color === 'black';
  const bg      = isBlack ? '#0a0a0a' : '#ffffff';
  const border  = isBlack ? `1px solid #222` : `1px solid ${HAIRLINE}`;
  const hole    = SS * SLEEVE_HOLE_RATIO;

  const holeRadius = hole / 2;
  const holeMask = sleeve.polylined
    ? `radial-gradient(circle at 50% 50%, transparent ${holeRadius}px, black ${holeRadius + 1}px)`
    : undefined;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{
        position: 'absolute',
        bottom: -14, left: '50%',
        transform: 'translateX(-50%)',
        width: SS * 0.75, height: 20,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.07) 55%, transparent 80%)',
        pointerEvents: 'none',
      }} />

      {sleeve.polylined && (
        <div style={{
          position: 'absolute', zIndex: 1,
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: hole, height: hole, borderRadius: '50%',
          background: 'linear-gradient(115deg, rgba(176,196,214,0.10) 0%, rgba(255,255,255,0.60) 30%, rgba(176,196,214,0.14) 48%, rgba(255,255,255,0.45) 68%, rgba(176,196,214,0.10) 100%)',
        }} />
      )}

      <div style={{ zIndex: 2,
        position: 'relative',
        width: SS, height: SS, flexShrink: 0,
        background: sleeve.printed
          ? 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)'
          : bg,
        border,
        overflow: 'hidden',
        boxShadow: sleeve.color === 'black'
          ? '0 8px 32px rgba(0,0,0,0.45)'
          : '0 8px 32px rgba(0,0,0,0.10)',
        ...(holeMask ? { maskImage: holeMask, WebkitMaskImage: holeMask } : {}),
      }}>
        {sleeve.printed && <RainbowPrintFace logoSize={SS * 0.42} />}

        {!sleeve.printed && sleeve.color === 'white' && (
          <>
            {Array.from({ length: 18 }, (_, i) => (
              <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${(i + 1) * 5.2}%`, height: 0.5, background: 'rgba(0,0,0,0.025)' }} />
            ))}
          </>
        )}

        {!sleeve.printed && sleeve.color === 'black' && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)' }} />
        )}

        {sleeve.boardWeight && !sleeve.printed && (
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, background: isBlack ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
        )}
      </div>
    </div>
  );
}


// Label stage — PQB's LabelStage shell (shadow puddle + big disc), driving the
// artist file's own LabelDisc render.
function LabelStage({ kind, discSize = 300 }: { kind: LabelKind; discSize?: number }) {
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', height: 300, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ transition: 'all 0.4s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <LabelDisc size={discSize} kind={kind} />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: -14,
            left: '50%',
            transform: 'translateX(-50%)',
            width: Math.round(discSize * 0.52),
            height: 14,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.24)',
            filter: 'blur(8px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      </div>
    </div>
  );
}

function InsertStage({ insert, variantId }: { insert: InsertOption; variantId: string }) {
  if (insert.id === 'none') {
    return (
      <div style={{
        width: SS, height: SS, flexShrink: 0,
        border: '1.5px dashed #d0d0d5', borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        color: FAINT,
      }}>
        <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <rect x={4} y={4} width={28} height={28} rx={1} />
          <path d="M14 4 L14 32" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500 }}>No insert</span>
      </div>
    );
  }

  const isPoster = insert.id === 'poster';
  const stageW = isPoster ? Math.round(SS * POSTER_RATIO[(variantId as 'small' | 'large') || 'small']) : SS;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{
        position: 'absolute',
        bottom: -14, left: '50%',
        transform: 'translateX(-50%)',
        width: stageW * 0.75, height: 20,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.07) 55%, transparent 80%)',
        pointerEvents: 'none', zIndex: 0,
        transition: 'width 0.45s cubic-bezier(0.32, 0.72, 0.28, 1)',
      }} />
      <div style={{ position: 'relative', zIndex: 1, width: SS, height: SS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          position: 'relative',
          width: stageW, height: SS, flexShrink: 0,
          background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
          border: '1px solid #222',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          transition: 'width 0.45s cubic-bezier(0.32, 0.72, 0.28, 1)',
        }}>
          <RainbowPrintFace logoSize={Math.min(stageW, SS) * 0.42} />
          {isPoster && variantId === 'small' && (
            <>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
            </>
          )}
          {isPoster && variantId === 'large' && (
            <>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '33.33%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '66.66%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}


function StickerStage({ size, shape }: { size: StickerSize | null; shape: StickerShape | null }) {
  if (!shape || !size) {
    return (
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', height: 310, display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: 260, height: 260,
            border: '1.5px dashed #d0d0d5', borderRadius: 4,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            color: FAINT,
          }}>
            <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <circle cx={18} cy={18} r={13} />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 500 }}>No sticker</span>
          </div>
        </div>
      </div>
    );
  }
  const w = Math.round(size.wIn * STAGE_PX_PER_INCH);
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', height: 310, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ transition: 'all 0.4s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <Sticker size={size} shape={shape} pxPerInch={STAGE_PX_PER_INCH} />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: -14,
            left: '50%',
            transform: 'translateX(-50%)',
            width: Math.round(w * 0.66),
            height: 14,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.18)',
            filter: 'blur(8px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      </div>
    </div>
  );
}


// ─── Vinyl spin — PQB's hover-spin machinery, verbatim ─────────────────────
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

const SPIN_DPS = 360 / 8000;
const REWIND_MS = 700;
const REWIND_EASE = (t: number) => 1 - Math.pow(1 - t, 3);

function useVinylSpin() {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const angleRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const [showRewind, setShowRewind] = useState(false);

  const apply = useCallback(() => {
    if (bodyRef.current) {
      bodyRef.current.style.transform = `rotate(${angleRef.current}deg)`;
    }
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  }, []);

  const spinLoop = useCallback((ts: number) => {
    if (lastTsRef.current !== null) {
      angleRef.current += (ts - lastTsRef.current) * SPIN_DPS;
      apply();
    }
    lastTsRef.current = ts;
    rafRef.current = requestAnimationFrame(spinLoop);
  }, [apply]);

  const onPointerEnter = useCallback(() => {
    if (reduced) return;
    setShowRewind(false);
    stopRaf();
    rafRef.current = requestAnimationFrame(spinLoop);
  }, [reduced, spinLoop, stopRaf]);

  const onPointerLeave = useCallback(() => {
    if (reduced) return;
    stopRaf();
    const settled = ((angleRef.current % 360) + 360) % 360;
    if (settled > 0.5) setShowRewind(true);
  }, [reduced, stopRaf]);

  const rewind = useCallback(() => {
    if (reduced) return;
    stopRaf();
    setShowRewind(false);
    const start = angleRef.current;
    const target = start - (((start % 360) + 360) % 360);
    const delta = target - start;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / REWIND_MS);
      angleRef.current = start + delta * REWIND_EASE(p);
      apply();
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        angleRef.current = target;
        apply();
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [reduced, apply, stopRaf]);

  useEffect(() => () => stopRaf(), [stopRaf]);

  return { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind, reduced };
}

function RewindButton({ show, onClick, size = 28 }: { show: boolean; onClick: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label="Rewind record to start"
      data-testid="button-rewind"
      className="rounded-full flex items-center justify-center transition-all"
      style={{
        width: size,
        height: size,
        opacity: show ? 1 : 0,
        pointerEvents: show ? 'auto' : 'none',
        transform: show ? 'scale(1)' : 'scale(0.9)',
        background: CARD,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${HAIRLINE}`,
        boxShadow: PILL_SHADOW,
        color: SUBINK,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = INK; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = SUBINK; }}
    >
      <RotateCcw style={{ width: size * 0.5, height: size * 0.5 }} />
    </button>
  );
}

// Real press photo of the ruby/red Memphis disc (founder-supplied) — shown
// verbatim, circle-cropped with a slight zoom to trim the frame (PQB's photo
// treatment for swatches with a real shot).
function PhotoDisc({ size, src, bodyRef, labelOverlay }: {
  size: number; src: string;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  labelOverlay?: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
      <div ref={bodyRef} style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', willChange: bodyRef ? 'transform' : undefined }}>
        <img
          src={src}
          alt=""
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.13)' }}
        />
        {labelOverlay}
      </div>
      {/* Fixed sheen — same non-rotating highlight pass as the layered render */}
      <div
        style={{
          position: 'absolute', inset: 0, backgroundColor: '#ffffff', opacity: 0.6,
          maskImage: `url(${LAYERS.highlights})`, WebkitMaskImage: `url(${LAYERS.highlights})`,
          maskSize: '100% 100%', WebkitMaskSize: '100% 100%',
          maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
          pointerEvents: 'none',
        }}
        aria-hidden
      />
    </div>
  );
}

// The disc for the big stages — the founder's real ruby photo when Ruby is
// the pick, the layered render for everything else.
function StageDisc({ swatch, size }: { swatch: CatalogSwatch; size: number }) {
  if (swatch.photo) return <PhotoDisc size={size} src={swatch.photo} />;
  return <RealVinylDisc size={size} kind={swatch.kind} base={swatch.base} s1={swatch.s1} s2={swatch.s2} s3={swatch.s3} />;
}

// ─── Full-package stage — PQB's qty-album stage (jacket + inner sleeve +
// record slide-out on hover), verbatim structure, spin machinery omitted. ───
export function PackageStage({ color, look, labelKind, art }: {
  color: CatalogSwatch; look: SleeveLook; labelKind: LabelKind;
  /** Page-2 override: explicit sample art per slot (null = press house art). */
  art?: { cover: string | null; sleeve: string | null; label: string | null };
}) {
  const [useArtistArt, setUseArtistArt] = useState(false);
  const hasArtProp = art !== undefined;
  const coverArt = hasArtProp ? art.cover : (useArtistArt ? californialandCover : null);
  const sleeveArt = hasArtProp ? art.sleeve : (useArtistArt ? californialandInnerSleeve : null);
  const labelArt = hasArtProp ? art.label : (useArtistArt ? niinaLabelArt : null);
  const spin = useVinylSpin();
  const usePhoto = !!color.photo;
  const labelOverlay = (
    <div className="absolute rounded-full overflow-hidden" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: usePhoto ? '40%' : '33.4%', height: usePhoto ? '40%' : '33.4%', zIndex: 2 }}>
      {labelKind === 'color' && (labelArt ? (
        <img src={labelArt} alt="" aria-hidden className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{
          background:
            'conic-gradient(from 210deg,' +
            '#e91e8c 0deg, #8e2de2 55deg, #2a52d8 110deg,' +
            '#0fa596 165deg, #2e9e3f 210deg, #d99a00 265deg,' +
            '#e05a1a 305deg, #e91e8c 360deg)',
        }}>
          <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: '72%', height: '72%', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.95 }} />
        </div>
      ))}
      {labelKind === 'bw' && (
        <div className="w-full h-full" style={{ background: '#ffffff' }}>
          <img src={PRESS_LABEL_LOGO} alt="" aria-hidden className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '56%', height: '56%', objectFit: 'contain', opacity: 0.78 }} />
        </div>
      )}
      {labelKind === 'blank' && <div className="w-full h-full" style={{ background: '#ffffff' }} />}
      <div className="absolute rounded-full" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 9, height: 9, background: '#161617', zIndex: 3 }} />
    </div>
  );
  return (
    <>
      <div className="relative group" style={{ width: JS_BASE + 140, height: JS_BASE + 12 }} data-testid="qty-album-stage">
        {/* record — the chosen color, peeking right of the jacket; hover
            spins it exactly like PQB's qty stage */}
        <div
          className="absolute transition-transform duration-500 ease-out group-hover:translate-x-11"
          style={{ left: 140, top: 14, width: JS_BASE - 16, height: JS_BASE - 16, zIndex: 1, borderRadius: '50%', boxShadow: '0 2px 14px rgba(0,0,0,0.35)' }}
          aria-hidden
        >
          <div onPointerEnter={spin.onPointerEnter} onPointerLeave={spin.onPointerLeave}>
            {usePhoto && color.photo ? (
              <PhotoDisc size={JS_BASE - 16} src={color.photo} bodyRef={spin.bodyRef} labelOverlay={labelOverlay} />
            ) : (
              <div style={{ position: 'relative', width: JS_BASE - 16, height: JS_BASE - 16 }}>
                <div ref={spin.bodyRef} style={{ position: 'absolute', inset: 0, borderRadius: '50%', willChange: 'transform' }}>
                  <RealVinylDisc size={JS_BASE - 16} kind={color.kind} base={color.base} s1={color.s1} s2={color.s2} s3={color.s3} />
                  {labelOverlay}
                </div>
              </div>
            )}
          </div>
          <div className="absolute" style={{ bottom: 4, right: -8, zIndex: 5 }}>
            <RewindButton show={spin.showRewind} onClick={spin.rewind} size={28} />
          </div>
        </div>
        {/* inner sleeve — a sliver behind the jacket, slides on hover */}
        <div
          className="absolute transition-transform duration-500 ease-out group-hover:translate-x-6"
          style={{
            left: 38, top: 10, width: JS_BASE - 12, height: JS_BASE - 12, zIndex: 2,
            background: look.printed
              ? 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)'
              : look.color === 'black' ? '#0a0a0a' : '#ffffff',
            border: look.color === 'black' || look.printed ? '1px solid #222' : '1px solid rgba(0,0,0,0.10)',
            boxShadow: '0 1px 8px rgba(0,0,0,0.22)',
            overflow: 'hidden',
          }}
          aria-hidden
        >
          {look.printed && (sleeveArt ? (
            <img src={sleeveArt} alt="" aria-hidden className="w-full h-full object-cover" />
          ) : (
            <RainbowPrintFace logoSize={(JS_BASE - 12) * 0.42} />
          ))}
          {look.polylined && (
            <div className="absolute inset-0" style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.0) 40%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.0) 60%)' }} />
          )}
          {look.boardWeight && (
            <div className="absolute" style={{ right: 0, top: 0, bottom: 0, width: 3, background: 'rgba(255,255,255,0.25)' }} />
          )}
        </div>
        {/* jacket — Memphis house jacket by default; artist cover on swap */}
        <div className="absolute overflow-hidden rounded-sm" style={{ left: 0, top: 0, width: JS_BASE, height: JS_BASE, zIndex: 3, boxShadow: '0 4px 22px rgba(0,0,0,0.35)' }}>
          {coverArt ? (
            <img src={coverArt} alt="Artist cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: '#111112' }}>
              <img src={mrpLabelLogo} alt="Memphis Record Pressing" style={{ width: '52%', height: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.92 }} />
            </div>
          )}
        </div>
      </div>
      <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 360, color: FAINT }}>
        {coverArt ? 'Your temp artwork on this build' : 'Memphis house artwork by default'} — hover to slide the sleeve and record out.
      </p>
      {!hasArtProp && (
        <button
          type="button"
          onClick={() => setUseArtistArt((v) => !v)}
          aria-pressed={useArtistArt}
          className="rounded-full text-[12px] font-medium transition-colors hover:bg-white/5"
          style={{ marginTop: 10, padding: '6px 14px', border: `1px solid ${HAIRLINE}`, color: SUBINK, background: 'transparent', cursor: 'pointer' }}
          data-testid="qty-swap-artwork"
        >
          {useArtistArt ? 'Back to Memphis house artwork' : 'Use your artwork instead\u2026'}
        </button>
      )}
    </>
  );
}

// PQB's SplitSection — sticky left stage, 520px step column on the right.
function SplitSection({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 520px', gap: 56, alignItems: 'start' }}>
      <div className="sticky" style={{ top: 148 }}>
        <div className="flex flex-col items-center">{left}</div>
      </div>
      <div className="min-w-0">{right}</div>
    </div>
  );
}

// ─── Sticky record render — the realistic disc, the way PressQuoteBuilder does it ──
function RecordRender({ swatch, sizeLabel, sizeNote, showColor }: {
  swatch: CatalogSwatch; sizeLabel: string; sizeNote: string; showColor: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div style={{ position: 'relative', filter: 'drop-shadow(0 18px 44px rgba(0,0,0,0.55))' }}>
        <StageDisc swatch={swatch} size={340} />
      </div>
      {/* reset affordance under the render */}
      <div className="flex justify-center" style={{ marginTop: 18 }}>
        <span
          className="inline-flex items-center justify-center rounded-full"
          style={{ width: 30, height: 30, border: `1px solid ${HAIRLINE}`, color: FAINT }}
          aria-label="Reset preview"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </span>
      </div>
      {/* caption — follows the picks, like Otis */}
      <div className="flex items-center justify-center gap-2" style={{ marginTop: 14 }}>
        <span className="text-[12px]" style={{ color: SUBINK }}>{sizeLabel}</span>
        <span style={{ color: FAINT }}>·</span>
        <span className="text-[12px]" style={{ color: SUBINK }}>{sizeNote}</span>
        {showColor && (
          <>
            <span style={{ color: FAINT }}>·</span>
            <SwatchChip swatch={swatch} size={16} />
            <span className="text-[12px] font-semibold" style={{ color: INK }}>{swatch.id} {swatch.name}</span>
          </>
        )}
      </div>
      <div className="text-center text-[11.5px]" style={{ color: FAINT, marginTop: 6 }}>
        Printed jacket and inner sleeve included.
      </div>
    </div>
  );
}

// ─── Small vinyl-disc chip — the same realistic layered render, mini ────────
function SwatchChip({ swatch, size = 40 }: { swatch: CatalogSwatch; size?: number }) {
  return (
    <div aria-hidden style={{ flexShrink: 0 }}>
      {swatch.photo
        ? <PhotoDisc size={size} src={swatch.photo} />
        : <RealVinylDisc size={size} kind={swatch.kind} base={swatch.base} s1={swatch.s1} s2={swatch.s2} s3={swatch.s3} />}
    </div>
  );
}

// Type card — mini disc + name + color count (PQB's TypeCard, dark reskin).
function TypeCard({ name, count, swatch, active, onSelect }: {
  name: string; count: number; swatch: CatalogSwatch; active: boolean; onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`quote-type-${swatch.kind}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 14, background: active ? CARD_RAISED : CARD, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 10 }}>
        <SwatchChip swatch={swatch} size={64} />
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: FAINT }}>
        {count} {count === 1 ? 'color' : 'colors'}
      </div>
    </div>
  );
}

// ─── Simple option card (size / discs / weight rows — press card pattern) ───
function OptionCard({ big, sub, active, onSelect, testId }: {
  big: string; sub: string; active: boolean; onSelect: () => void; testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={testId}
      className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
      style={{
        flex: 1,
        padding: '16px 12px',
        background: active ? CARD_RAISED : CARD,
        border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
        textAlign: 'center',
        cursor: 'pointer',
        color: INK,
      }}
    >
      <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{big}</div>
      <div className="text-[11px]" style={{ marginTop: 3, color: FAINT }}>{sub}</div>
    </button>
  );
}

// ─── The build-your-own flow — Otis's real artist builder steps ─────────────
// ─── Progressive steps — PQB's exact enable/disable mechanism ──────────────
// Each step unlocks after the one before, Apple buy-flow style. Quantity is
// the closing step, exactly like PQB — pricing moved to its own page.
type StepKey = 'size' | 'discs' | 'weight' | 'ctype' | 'color' | 'jacket' | 'sleeve' | 'label' | 'insert' | 'sticker' | 'qty';
const STEP_ORDER: StepKey[] = ['size', 'discs', 'weight', 'ctype', 'color', 'jacket', 'sleeve', 'label', 'insert', 'sticker', 'qty'];

// Locked steps sit at low opacity and ignore clicks until unlocked.
function Gate({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div aria-disabled={!on} style={{ opacity: on ? 1 : 0.35, pointerEvents: on ? 'auto' : 'none', transition: 'opacity 0.4s ease' }}>
      {children}
    </div>
  );
}

function BuildFlow() {
  const [sizeId, setSizeId] = useState('12');
  const [discs, setDiscs] = useState(1);
  const [weightId, setWeightId] = useState('140');
  const [colorId, setColorId] = useState('BK1');
  const [colorKind, setColorKind] = useState<SwatchKind>('black');
  // Collapse: the type grid folds to a summary row once a color is picked.
  const [typeOpen, setTypeOpen] = useState(true);
  const [sleeveId, setSleeveId] = useState<'printed' | 'unprinted' | 'polylined'>('printed');
  const [sleeveVariantId, setSleeveVariantId] = useState('board');
  const [jacketId, setJacketId] = useState('single');
  const [jacketVariantId, setJacketVariantId] = useState('standard');
  const [labelId, setLabelId] = useState<LabelKind>('color');
  const [insertId, setInsertId] = useState('none');
  const [insertVariantId, setInsertVariantId] = useState('');
  const [stickerShapeId, setStickerShapeId] = useState<StickerShapeId | 'none'>('none');
  const [stickerSizeId, setStickerSizeId] = useState('3x3');
  const [qty, setQty] = useState(500);
  const [qbDetailsOpen, setQbDetailsOpen] = useState(false);
  const [qbSetupOpen, setQbSetupOpen] = useState(false);

  // ── Apple-style progressive steps — each unlocks after the one before ──
  const [done, setDone] = useState<Set<StepKey>>(() => new Set());
  const mark = (k: StepKey) => setDone((p) => (p.has(k) ? p : new Set(p).add(k)));
  const picked = (k: StepKey) => done.has(k);
  const canDo = (k: StepKey) =>
    STEP_ORDER.slice(0, STEP_ORDER.indexOf(k)).every((s) => done.has(s));

  // First-time picks glide the page down to the step that just unlocked.
  const goTo = (id: string) => {
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  const advance = (k: StepKey, target: string) => {
    if (!picked(k)) goTo(target);
  };

  const chooseStickerShape = (id: StickerShapeId | 'none') => {
    setStickerShapeId(id);
    if (id !== 'none') {
      const next = STICKER_SHAPES.find((st) => st.id === id);
      if (next) setStickerSizeId(next.sizes[Math.floor(next.sizes.length / 2)].id);
    }
    mark('sticker');
  };
  const stickerShape = stickerShapeId === 'none' ? null : (STICKER_SHAPES.find((st) => st.id === stickerShapeId) ?? null);

  const size = OTIS_SIZES.find((s) => s.id === sizeId) ?? OTIS_SIZES[1];
  const colors = CATALOG_COLORS.filter((c) => c.sizes.includes(sizeId));
  const color = colors.find((c) => c.id === colorId) ?? colors[0];
  // Stage-side deriveds — the sticky previews read the same picks as the tiles.
  const jacketOptions = JACKET_CATALOG[sizeId] ?? JACKET_CATALOG['12'];
  const jacketType = jacketOptions.find((j) => j.id === jacketId) ?? jacketOptions[0];
  const selectedJacketVariant = jacketType.variants.find((v) => v.id === jacketVariantId);
  const sleeveType = SLEEVE_OPTIONS.find((sl) => sl.id === sleeveId) ?? SLEEVE_OPTIONS[0];
  const selectedSleeveVariant = sleeveType.variants.find((v) => v.id === sleeveVariantId);
  const look = sleeveLook(sleeveType, sleeveVariantId);
  const labelStyle = LABEL_STYLES.find((l) => l.id === labelId) ?? LABEL_STYLES[0];
  const insertType = INSERT_OPTIONS.find((i) => i.id === insertId) ?? INSERT_OPTIONS[0];
  const selectedInsertVariant = insertType.variants.find((v) => v.id === insertVariantId);
  const stickerSize = stickerShape ? (stickerShape.sizes.find((st) => st.id === stickerSizeId) ?? stickerShape.sizes[0]) : null;

  // ── Pricing — PQB's exact math: only what's been picked counts ──
  const vinylDone = picked('size') && picked('weight') && picked('color');
  const minRun = vinylDone ? (KIND_MIN_QTY[color.kind] ?? 0) : 0;
  const tierFactor = (q: number) => qtyScale(q) / 0.70;
  const unitFactor = tierFactor(picked('qty') ? qty : 1000);
  const baseUnit =
    (vinylDone ? (color.price + WEIGHT_UP[weightId]) * discs : 0) +
    (picked('label') ? LABEL_PRICE[labelId] * discs : 0) +
    (picked('jacket') ? JACKET_PRICE[jacketType.id] : 0) +
    (picked('sleeve') ? SLEEVE_PRICE[sleeveType.id] : 0) +
    (picked('insert') ? INSERT_PRICE[insertType.id] : 0) +
    (picked('sticker') && stickerShapeId !== 'none' ? STICKER_PRICE[stickerShapeId] : 0) +
    (vinylDone ? ASSEMBLY_PRICE + SHRINK_PRICE : 0);
  const perUnit = baseUnit * unitFactor;
  const total = picked('qty') ? perUnit * qty + SETUP_TOTAL : 0;
  const perUnitAt = (q: number) => baseUnit * tierFactor(q);

  return (
    <>
      {/* Frosted spec strip — artist-relevant summary */}
      <div
        className="flex items-center justify-between gap-4"
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          margin: '28px -40px 0', padding: '10px 40px',
          background: 'rgba(19,19,20,0.78)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${MRP_GOLD}59`, // MRP gold hairline — the press's accent
        }}
        data-testid="strip-build-spec"
      >
        <div className="flex items-center gap-2 text-[12px] min-w-0" style={{ color: SUBINK }}>
          {picked('size') ? (
            <>
              <span className="font-semibold" style={{ color: INK }}>{size.label} {size.note}</span>
              {picked('color') && (<><span style={{ color: FAINT }}>·</span><span className="truncate">{color.id} {color.name}</span></>)}
              {picked('qty') && (<><span style={{ color: FAINT }}>·</span><span>{qty.toLocaleString()} units</span></>)}
            </>
          ) : (
            <>
              {/* Attention-drawing shimmer while the strip is empty (Bill,
                  Aug 13 2026) — a soft gradient wave sweeps the invitation. */}
              <style>{`
                @keyframes gt-strip-shimmer {
                  0%   { background-position: 200% center; }
                  100% { background-position: -200% center; }
                }
              `}</style>
              <span
                className="font-medium"
                data-testid="strip-empty-note"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${SUBINK} 0%, ${SUBINK} 35%, ${MRP_GOLD} 50%, ${SUBINK} 65%, ${SUBINK} 100%)`,
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  animation: 'gt-strip-shimmer 3.2s linear infinite',
                }}
              >
                Pick a size to begin — your price will be up here.
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[12.5px]" style={{ color: SUBINK }}>
            Est. <span className="font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmt(perUnit)}</span> / unit
          </span>
          <span className="text-[13px] font-semibold rounded-full" style={{ padding: '4px 14px', background: `${MRP_GOLD}24`, color: MRP_GOLD, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(total)}
          </span>
        </div>
      </div>

      {/* Builder — PQB's SplitSection bands: each carries its own sticky
          stage, so the left preview follows the step in view. */}
      <section data-testid="section-builder" style={{ marginTop: 28 }}>
        {/* ── 1 · Vinyl band — the record itself ── */}
        <SplitSection
          left={
            <div data-testid="panel-record-render">
              <Gate on={picked('size')}>
                <RecordRender
                  swatch={color}
                  sizeLabel={size.label}
                  sizeNote={`${size.label} ${size.note}`}
                  showColor={picked('ctype')}
                />
              </Gate>
            </div>
          }
          right={
            <div className="flex flex-col" style={{ gap: 48 }}>
          {/* 1 · Size */}
          <div data-testid="section-size" id="astep-size" style={{ scrollMarginTop: 120 }}>
            <TwoTone lead="Size." rest="Choose the record format." />
            <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
              {OTIS_SIZES.map((s) => (
                <OptionCard
                  key={s.id}
                  big={s.label}
                  sub={s.note}
                  active={picked('size') && s.id === sizeId}
                  onSelect={() => { setSizeId(s.id); advance('size', 'astep-discs'); mark('size'); }}
                  testId={`size-${s.id}`}
                />
              ))}
            </div>
          </div>

          {/* 2 · Discs — singles to box sets */}
          <Gate on={canDo('discs')}>
          <div data-testid="section-discs" id="astep-discs" style={{ scrollMarginTop: 120 }}>
            <TwoTone lead="Discs." rest="Choose a single record or a set." />
            <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
              {DISC_OPTIONS.map((d) => (
                <OptionCard
                  key={d.id}
                  big={d.label}
                  sub={d.note}
                  active={picked('discs') && d.id === discs}
                  onSelect={() => { setDiscs(d.id); advance('discs', 'astep-weight'); mark('discs'); }}
                  testId={`discs-${d.id}`}
                />
              ))}
            </div>
          </div>
          </Gate>

          {/* 3 · Weight — PQB's weight cards, verbatim */}
          <Gate on={canDo('weight')}>
          <div data-testid="section-weight" id="astep-weight" style={{ scrollMarginTop: 120 }}>
            <TwoTone lead="Weight." rest="Choose how heavy it presses." />
            <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
              {VINYL_WEIGHTS.length} weights available from {PARTNER_NAME}.
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
              {VINYL_WEIGHTS.map((w) => (
                <OptionCard
                  key={w.id}
                  big={w.label}
                  sub={w.note}
                  active={picked('weight') && w.id === weightId}
                  onSelect={() => { setWeightId(w.id); advance('weight', 'astep-ctype'); mark('weight'); }}
                  testId={`weight-${w.id}`}
                />
              ))}
            </div>
          </div>
          </Gate>

          {/* 4 · Vinyl type — PQB's "Pick a type" grid; collapses to a
              summary row once a color is picked, Change re-expands. */}
          <Gate on={canDo('ctype')}>
          <div data-testid="section-vinyl" id="astep-ctype" style={{ scrollMarginTop: 120 }}>
            {picked('ctype') && !typeOpen ? (
              <>
                <TwoTone lead="Vinyl." rest="Choose how the record is made." />
                <div
                  className="flex items-center rounded-2xl"
                  style={{ marginTop: 16, gap: 14, padding: '12px 18px', background: CARD, border: `1px solid ${HAIRLINE}` }}
                  data-testid="type-summary-row"
                >
                  <SwatchChip swatch={color} size={44} />
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <div className="text-[14px] font-semibold" style={{ color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {COLOR_TYPES.find((t) => t.id === colorKind)?.name}
                    </div>
                    <div className="text-[11.5px]" style={{ marginTop: 1, color: FAINT }}>
                      Type · {colors.filter((c) => c.kind === colorKind).length} colors
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTypeOpen(true)}
                    className="text-[13px] font-medium focus:outline-none"
                    style={{ color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    data-testid="button-change-type"
                  >
                    Change
                  </button>
                </div>
              </>
            ) : (
              <>
                <TwoTone lead="Vinyl." rest="Choose how the record is made." />
                <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                  {colors.length} colors in your catalog press for {size.label}.
                </p>
                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                  {COLOR_TYPES.map((t) => {
                    const kindColors = colors.filter((c) => c.kind === t.id);
                    if (kindColors.length === 0) return null;
                    const isActive = picked('ctype') && t.id === colorKind;
                    const shown = (isActive && color.kind === t.id) ? color : kindColors[0];
                    return (
                      <TypeCard
                        key={t.id}
                        name={t.name}
                        count={kindColors.length}
                        swatch={shown}
                        active={isActive}
                        onSelect={() => {
                          setColorKind(t.id);
                          if (color.kind !== t.id) setColorId(kindColors[0].id);
                          advance('ctype', 'astep-color');
                          mark('ctype');
                          mark('color');
                          setTypeOpen(false);
                        }}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
          </Gate>

          {/* 5 · Color — the looks within the chosen type */}
          <Gate on={canDo('color')}>
          <div data-testid="section-color" id="astep-color" style={{ scrollMarginTop: 120 }}>
            <TwoTone lead="Color." rest="Choose the record fans will hold." />
            <p className="text-[12px]" style={{ marginTop: 8, color: SUBINK }}>
              {picked('ctype') ? (
                <>
                  <span className="font-semibold" style={{ color: INK }}>{COLOR_TYPES.find((t) => t.id === colorKind)?.name}</span>
                  <span style={{ color: FAINT }}> · {colors.filter((c) => c.kind === colorKind).length} colors</span>
                </>
              ) : (
                'Pick a type first.'
              )}
            </p>
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
              {colors.filter((c) => c.kind === colorKind).map((c) => {
                const active = picked('color') && c.id === colorId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setColorId(c.id); mark('color'); setTypeOpen(false); }}
                    aria-pressed={active}
                    data-testid={`color-${c.id}`}
                    className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
                    style={{
                      padding: '16px 8px 12px',
                      background: active ? CARD_RAISED : CARD,
                      border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div className="flex justify-center">
                      <SwatchChip swatch={c} size={40} />
                    </div>
                    <div
                      className="inline-flex items-center justify-center gap-1 text-[11.5px] font-semibold"
                      style={{ marginTop: 10, color: active ? BLUE : INK }}
                    >
                      {active && <Check className="w-3 h-3" strokeWidth={3} />}
                      {c.id} {c.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          </Gate>
            </div>
          }
        />

        {/* ── 2 · Jacket band — PQB's JacketStage on the left ── */}
        <section style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}` }}>
        <Gate on={canDo('jacket')}>
        <SplitSection
          left={
            <>
              <JacketStage jacketType={jacketType} widespine={jacketVariantId === 'widespine'} tipOn={jacketVariantId === 'tipon'} />
              <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: INK }}>
                {size.label} {jacketType.name}
                {selectedJacketVariant && selectedJacketVariant.id !== 'standard' && (
                  <span style={{ color: FAINT }}> · {selectedJacketVariant.label}</span>
                )}
              </div>
              <p className="text-[12px] text-center" style={{ marginTop: 6, color: FAINT, maxWidth: 280 }}>
                {jacketType.note}
                {jacketType.gatefoldPanels > 0 && <span> Hover to preview the fold.</span>}
              </p>
            </>
          }
          right={
          <div data-testid="section-jacket" id="astep-jacket" style={{ scrollMarginTop: 120 }}>
            <TwoTone lead="Jacket." rest="Choose how the cover is built." />
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(JACKET_CATALOG[sizeId] ?? JACKET_CATALOG['12']).map((j) => {
                const active = picked('jacket') && j.id === jacketId;
                const variantOk = j.variants.some((v) => v.id === jacketVariantId);
                return (
                  <JacketTile
                    key={j.id}
                    jacket={j}
                    active={active}
                    variantId={active && variantOk ? jacketVariantId : j.variants[0]?.id ?? ''}
                    onSelect={() => { setJacketId(j.id); setJacketVariantId(j.variants[0]?.id ?? ''); mark('jacket'); }}
                    onVariantSelect={(id) => { setJacketVariantId(id); mark('jacket'); }}
                  />
                );
              })}
            </div>
          </div>
          }
        />
        </Gate>
        </section>

        {/* ── 3 · Inner-sleeve band — PQB's SleeveStage ── */}
        <section style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}` }}>
        <Gate on={canDo('sleeve')}>
        <SplitSection
          left={
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              filter: picked('sleeve') ? 'none' : 'grayscale(1) opacity(0.45)',
              transition: 'filter 0.4s ease',
            }}>
              <SleeveStage sleeve={look} />
              <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: INK }}>
                {size.label} {sleeveType.name}
                {selectedSleeveVariant && (
                  <span style={{ color: FAINT }}> · {selectedSleeveVariant.label}</span>
                )}
              </div>
              <p className="text-[12px] text-center" style={{ marginTop: 6, color: FAINT, maxWidth: 280 }}>
                {picked('sleeve') ? sleeveType.note : 'Select a finish to add it to your build.'}
              </p>
            </div>
          }
          right={
          <div data-testid="section-sleeve" id="astep-sleeve" style={{ scrollMarginTop: 120 }}>
            <TwoTone lead="Inner sleeve." rest="Choose printed, unprinted, or polylined." />
            <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
              {SLEEVE_OPTIONS.length} inner sleeve types available from {PARTNER_NAME}.
            </p>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SLEEVE_OPTIONS.map((sl) => (
                <SleeveTile
                  key={sl.id}
                  sleeve={sl}
                  active={picked('sleeve') && sl.id === sleeveId}
                  variantId={sl.id === sleeveId ? sleeveVariantId : sl.variants[0].id}
                  onSelect={() => { setSleeveId(sl.id); setSleeveVariantId(sl.variants[0].id); mark('sleeve'); }}
                  onVariantSelect={(id) => { setSleeveVariantId(id); mark('sleeve'); }}
                />
              ))}
            </div>
            <p className="text-[12px]" style={{ marginTop: 12, color: FAINT }}>
              {sleeveId === 'printed'
                ? 'The artist supplies print-ready artwork for the sleeve face.'
                : sleeveId === 'polylined'
                  ? 'No artwork needed — ships with anti-static poly lining.'
                  : 'No artwork needed — packaging ships as-is.'}
            </p>
          </div>
          }
        />
        </Gate>
        </section>

        {/* ── 4 · Label band — PQB's LabelStage close-up ── */}
        <section style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}` }}>
        <Gate on={canDo('label')}>
        <SplitSection
          left={
            <>
              <LabelStage kind={labelId} />
              <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
                <span className="font-semibold" style={{ color: INK }}>
                  {size.label} {labelStyle.name}
                </span>
              </div>
              <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 320, color: FAINT }}>
                {labelStyle.note}
              </p>
            </>
          }
          right={
          <div data-testid="section-label" id="astep-label" style={{ scrollMarginTop: 120 }}>
            <TwoTone lead="Labels." rest="Choose the center of the record." />
            <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              {LABEL_STYLES.map((l) => (
                <LabelTile
                  key={l.id}
                  style={l}
                  active={picked('label') && l.id === labelId}
                  onSelect={() => { setLabelId(l.id); advance('label', 'astep-insert'); mark('label'); }}
                />
              ))}
            </div>
          </div>
          }
        />
        </Gate>
        </section>

        {/* ── 5 · Insert band — PQB's InsertStage ── */}
        <section style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}` }}>
        <Gate on={canDo('insert')}>
        <SplitSection
          left={
            <>
              <InsertStage insert={insertType} variantId={insertVariantId} />
              {insertType.id !== 'none' && (
                <>
                  <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: INK }}>
                    {size.label} {insertType.name}
                    {selectedInsertVariant && (
                      <span style={{ color: FAINT }}> · {selectedInsertVariant.label}</span>
                    )}
                  </div>
                  <p className="text-[12px] text-center" style={{ marginTop: 6, color: FAINT, maxWidth: 280 }}>
                    {insertType.note}
                  </p>
                </>
              )}
            </>
          }
          right={
          <div data-testid="section-insert" id="astep-insert" style={{ scrollMarginTop: 120 }}>
            <TwoTone lead="Insert." rest="Add one or keep the package simple." />
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {INSERT_OPTIONS.map((i) => (
                <InsertTile
                  key={i.id}
                  insert={i}
                  active={picked('insert') && i.id === insertId}
                  variantId={i.id === insertId ? insertVariantId : i.variants[0]?.id ?? ''}
                  onSelect={() => { setInsertId(i.id); setInsertVariantId(i.variants[0]?.id ?? ''); mark('insert'); }}
                  onVariantSelect={(id) => { setInsertVariantId(id); mark('insert'); }}
                />
              ))}
            </div>
          </div>
          }
        />
        </Gate>
        </section>

        {/* ── 6 · Sticker band — PQB's StickerStage ── */}
        <section style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}` }}>
        <Gate on={canDo('sticker')}>
        <SplitSection
          left={
            <>
              <StickerStage size={stickerSize} shape={stickerShape} />
              <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
                <span className="font-semibold" style={{ color: INK }}>
                  {stickerShape && stickerSize ? stickerSize.name : 'None'}
                </span>
                {stickerShape && (
                  <>
                    <span style={{ color: FAINT }}>·</span>
                    <span>{stickerShape.name}</span>
                  </>
                )}
              </div>
              <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 320, color: FAINT }}>
                {stickerShape ? stickerShape.note : 'No sticker on the shrink-wrap.'}
              </p>
            </>
          }
          right={
          <div data-testid="section-stickers" id="astep-sticker" style={{ scrollMarginTop: 120 }}>
            <TwoTone lead="Sticker." rest="Add a die-cut piece or skip it." />
            <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
              Stickers apply to the shrink-wrap, not the jacket itself.
            </p>
            <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <NoneShapeTile active={picked('sticker') && stickerShapeId === 'none'} onSelect={() => chooseStickerShape('none')} />
              {STICKER_SHAPES.map((st) => (
                <ShapeTile
                  key={st.id}
                  shape={st}
                  active={picked('sticker') && st.id === stickerShapeId}
                  onSelect={() => chooseStickerShape(st.id)}
                />
              ))}
            </div>

            {stickerShape && (
              <div style={{ marginTop: 40 }}>
                <TwoTone lead="Size." rest={`Choose one for ${stickerShape.name.toLowerCase()}s.`} />
                <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                  {stickerShape.id === 'upc'
                    ? 'UPC stickers come in one standard retail size.'
                    : 'Every size prints on the same white die-cut stock.'}
                </p>
                <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  {stickerShape.sizes.map((st) => (
                    <SizeCard
                      key={st.id}
                      size={st}
                      round={stickerShape.round}
                      active={st.id === stickerSizeId}
                      onSelect={() => { setStickerSizeId(st.id); mark('sticker'); }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          }
        />
        </Gate>
        </section>

        {/* ── 7 · Quantity band — PQB's closing band, verbatim: the full
            package on the left, quantity cards + honest costs on the right ── */}
        <section style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}` }}>
        <Gate on={canDo('qty')}>
        <SplitSection
          left={<PackageStage color={color} look={look} labelKind={labelId} />}
          right={
            <div className="flex flex-col" style={{ gap: 48 }}>
              <div data-testid="section-qty" id="astep-qty" style={{ scrollMarginTop: 120 }}>
                <TwoTone lead="Quantity." rest="See how the unit price changes." />
                <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                  Bigger runs bring the per-record price down — each card prices this exact record.
                </p>
                <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  {QUANTITIES.map((q) => {
                    const active = picked('qty') && q === qty;
                    const below = q < minRun;
                    return (
                      <button
                        key={q}
                        type="button"
                        disabled={below}
                        onClick={() => { if (below) return; setQty(q); advance('qty', 'astep-costs'); mark('qty'); }}
                        aria-pressed={active}
                        data-testid={`qty-${q}`}
                        className={below ? 'rounded-2xl focus:outline-none' : 'rounded-2xl transition-all hover:-translate-y-px focus:outline-none'}
                        style={{ padding: '16px 12px', background: active ? CARD_RAISED : CARD, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: below ? 'default' : 'pointer', opacity: below ? 0.45 : 1 }}
                      >
                        <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK, fontVariantNumeric: 'tabular-nums' }}>{q.toLocaleString()}</div>
                        <div className="text-[11px]" style={{ marginTop: 3, color: FAINT }}>units</div>
                        {below ? (
                          <div className="text-[12px] font-medium" style={{ marginTop: 6, color: FAINT }}>Unavailable</div>
                        ) : (
                          <div className="text-[12px] font-medium" style={{ marginTop: 6, color: active ? BLUE : SUBINK, fontVariantNumeric: 'tabular-nums' }}>{fmt(perUnitAt(q))}<span style={{ color: FAINT, fontWeight: 400 }}> /unit</span></div>
                        )}
                      </button>
                    );
                  })}
                  {minRun > 0 && (
                    <div className="text-[11.5px]" style={{ gridColumn: '1 / -1', color: FAINT }} data-testid="qty-min-note">
                      {color.name} is a splatter press — the press won&rsquo;t run it under {minRun.toLocaleString()} units.
                    </div>
                  )}
                </div>
              </div>

              {/* Costs summary — PQB's honest-math module, verbatim dark */}
              <Gate on={picked('qty')}>
              <div id="astep-costs" style={{ scrollMarginTop: 120 }} data-testid="section-costs">
                <div className="rounded-2xl" style={{ border: `1px solid ${HAIRLINE}`, background: CARD, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setQbDetailsOpen((v) => !v)}
                    aria-expanded={qbDetailsOpen}
                    className="w-full flex items-center justify-between text-left"
                    style={{ padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    data-testid="quote-details-toggle"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13.5px] font-medium" style={{ color: INK }}>Per record</span>
                        <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ color: FAINT, transform: qbDetailsOpen ? 'rotate(180deg)' : 'none' }} />
                      </div>
                      <div className="text-[11.5px]" style={{ marginTop: 1, color: FAINT }}>This exact build, at this run</div>
                    </div>
                    <span className="text-[14px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="quote-per-record">{fmt(perUnit)}</span>
                  </button>
                  {qbDetailsOpen && (
                    <div style={{ background: CARD_RAISED }}>
                      {[
                        vinylDone ? { id: 'vinyl', name: `${size.label} · ${weightId}g ${color.name}`, note: discs > 1 ? `${discs} LP per record` : 'Vinyl', v: (color.price + WEIGHT_UP[weightId]) * discs * unitFactor } : null,
                        picked('label') ? { id: 'label', name: `${labelStyle.name} label`, note: discs > 1 ? `Both discs` : undefined, v: LABEL_PRICE[labelId] * discs * unitFactor } : null,
                        picked('jacket') ? { id: 'jacket', name: `${jacketType.name} jacket`, v: JACKET_PRICE[jacketType.id] * unitFactor } : null,
                        picked('sleeve') ? { id: 'sleeve', name: `${sleeveType.name} sleeve`, v: SLEEVE_PRICE[sleeveType.id] * unitFactor } : null,
                        picked('insert') && insertType.id !== 'none' ? { id: 'insert', name: insertType.name, v: INSERT_PRICE[insertType.id] * unitFactor } : null,
                        picked('sticker') && stickerShapeId !== 'none' && stickerShape ? { id: 'sticker', name: `${stickerShape.name} sticker`, v: STICKER_PRICE[stickerShapeId] * unitFactor } : null,
                        vinylDone ? { id: 'assembly', name: 'Assembly', note: 'Insert placed on top before shrink', v: ASSEMBLY_PRICE * unitFactor } : null,
                        vinylDone ? { id: 'shrink', name: 'Shrinkwrap', note: 'Retail-ready seal', v: SHRINK_PRICE * unitFactor } : null,
                      ].filter((x): x is { id: string; name: string; note?: string; v: number } => x !== null).map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-4" style={{ padding: '9px 20px 9px 34px', borderTop: `1px solid ${HAIRLINE}` }}>
                          <div>
                            <div className="text-[12.5px] font-medium" style={{ color: INK }}>{l.name}</div>
                            {l.note && <div className="text-[11px]" style={{ color: FAINT, marginTop: 1 }}>{l.note}</div>}
                          </div>
                          <span className="text-[12.5px]" style={{ color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(l.v)} <span style={{ color: FAINT, fontSize: 11 }}>/unit</span></span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: qbDetailsOpen ? 0 : '0 20px' }} />
                  <div className="flex items-center justify-between" style={{ padding: '14px 20px' }}>
                    <div>
                      <div className="text-[13.5px] font-medium" style={{ color: INK }}>Run</div>
                      <div className="text-[11.5px]" style={{ marginTop: 1, color: FAINT }}>{discs > 1 ? `${discs} LP per record, pressed and packed` : 'Pressed and packed'}</div>
                    </div>
                    <span className="text-[14px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="quote-run">{qty.toLocaleString()} units · {fmt(perUnit * qty)}</span>
                  </div>
                  <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '0 20px' }} />
                  <button
                    type="button"
                    onClick={() => setQbSetupOpen((v) => !v)}
                    aria-expanded={qbSetupOpen}
                    className="w-full flex items-center justify-between text-left"
                    style={{ padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    data-testid="quote-setup-toggle"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13.5px] font-medium" style={{ color: INK }}>Setup</span>
                        <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ color: FAINT, transform: qbSetupOpen ? 'rotate(180deg)' : 'none' }} />
                      </div>
                      <div className="text-[11.5px]" style={{ marginTop: 1, color: FAINT }}>One-time · same at any run size</div>
                    </div>
                    <span className="text-[14px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="quote-setup">{fmt(SETUP_TOTAL)}</span>
                  </button>
                  {qbSetupOpen && (
                    <div style={{ background: CARD_RAISED }}>
                      {SETUP_LINES.map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-4" style={{ padding: '8px 20px 8px 34px', borderTop: `1px solid ${HAIRLINE}` }}>
                          <div>
                            <div className="text-[12px]" style={{ color: SUBINK }}>{l.name}</div>
                            {l.note && <div className="text-[11px]" style={{ color: FAINT, marginTop: 1, opacity: 0.8 }}>{l.note}</div>}
                          </div>
                          <span className="text-[12px]" style={{ color: l.amount === 0 ? FAINT : SUBINK, fontVariantNumeric: 'tabular-nums' }}>{l.amount === 0 ? 'Included' : fmt(l.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end justify-between gap-4" style={{ padding: '16px 20px 18px', borderTop: `1px solid ${HAIRLINE}`, background: 'linear-gradient(180deg, rgba(49,158,216,0.10) 0%, rgba(49,158,216,0.02) 100%)' }}>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: BLUE }}>Estimate total</div>
                      <div className="text-[11.5px]" style={{ marginTop: 3, color: SUBINK }}>If you press the full run</div>
                    </div>
                    <span className="font-semibold tracking-tight" style={{ fontSize: 34, lineHeight: 1, color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="quote-total-hero">{fmt(total)}</span>
                  </div>
                </div>

                {/* Sell on GoodTunes — the estimate-page GoodTunes ad, ported
                    verbatim from PressClientEstimate (words adapted to the
                    artist offer; disc bleeds off the right edge) */}
                <a
                  href="ArtistReleasePriceGoodDeed"
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                  data-testid="band-goodtunes-direct"
                >
                  <section role="button" tabIndex={0} style={{ marginTop: 20, borderRadius: 18, border: `1px solid ${HAIRLINE}`, background: CARD, padding: '30px 34px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 28, cursor: 'pointer', overflow: 'hidden' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.3, color: INK }}>GoodTunes® Direct.</div>
                      <div style={{ fontSize: 14, color: SUBINK, marginTop: 6, maxWidth: 460, lineHeight: 1.6 }}>
                        Sell through your GoodTunes store — we handle the storefront, checkout,
                        and payouts for you. You can change this later.
                      </div>
                      <div data-testid="link-goodtunes-learn-more" style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', color: BLUE, fontSize: 15, fontWeight: 600, marginTop: 16 }}>
                        Learn more
                        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M6 3.5L10.5 8L6 12.5" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                    </div>
                    {/* graphic — her record, peeking in from the card edge */}
                    <div aria-hidden style={{ position: 'relative', flexShrink: 0, width: 150, height: 150, marginRight: -60 }}>
                      <div style={{ position: 'relative', width: 150, height: 150, borderRadius: '50%', overflow: 'hidden', boxShadow: '0 6px 24px rgba(0,0,0,0.45)' }}>
                        <img src={rubyVinylPhoto} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.13)' }} />
                        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '40%', height: '40%', borderRadius: '50%', overflow: 'hidden' }}>
                          <img src={niinaLabelArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      </div>
                    </div>
                  </section>
                </a>
                <p className="text-[11.5px] text-right" style={{ color: FAINT, marginTop: 8 }}>
                  Learn more saves this estimate to your release first.
                </p>
              </div>
              </Gate>
            </div>
          }
        />
        </Gate>
        </section>
      </section>
    </>
  );
}

// ─── Set your price ─────────────────────────────────────────────────────────
const PACKAGE_COST = 22.88;
const RUNS = [100, 200, 300, 500, 1000, 2000];

// Package cost for the SAVED estimate build (12″ · 180g Ruby · color label ·
// single jacket · printed sleeve), from the same PQB engine — setup spread
// across the run so the breakdown always reconciles to the headline number.
export function packageCostAt(run: number): { perUnit: number; lines: { id: string; name: string; note?: string; v: number }[] } {
  const t = qtyScale(run) / 0.70;
  const ruby = CATALOG_COLORS.find((c) => c.id === 'T01')!;
  const lines = [
    { id: 'vinyl', name: '12″ · 180g Ruby', note: 'Vinyl', v: (ruby.price + WEIGHT_UP['180']) * t },
    { id: 'label', name: 'Full color label', v: LABEL_PRICE['color'] * t },
    { id: 'jacket', name: 'Single jacket', v: JACKET_PRICE['single'] * t },
    { id: 'sleeve', name: 'Printed sleeve', v: SLEEVE_PRICE['printed'] * t },
    { id: 'assembly', name: 'Assembly', note: 'Insert placed on top before shrink', v: ASSEMBLY_PRICE * t },
    { id: 'shrink', name: 'Shrinkwrap', note: 'Retail-ready seal', v: SHRINK_PRICE * t },
    { id: 'setup', name: 'One-time setup', note: `${money2(SETUP_TOTAL)} spread across ${run.toLocaleString()} units`, v: SETUP_TOTAL / run },
  ];
  return { perUnit: lines.reduce((acc, l) => acc + l.v, 0), lines };
}

function PriceSection({ retail, setRetail, run, setRun }: {
  retail: string; setRetail: (v: string) => void; run: number; setRun: (q: number) => void;
}) {
  const retailNum = Number(retail) || 0;
  const pkg = packageCostAt(run);
  const profit = retailNum - pkg.perUnit;
  const base = profit * run;
  const [costOpen, setCostOpen] = useState(false);

  return (
    <div style={{ marginTop: 18 }}>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="text-[10.5px] font-bold uppercase" style={{ letterSpacing: 1.1, color: FAINT }}>
            Retail price
          </div>
          <div
            className="flex items-center"
            style={{ marginTop: 8, width: 130, borderRadius: 12, border: `1px solid ${HAIRLINE}`, background: CARD, padding: '10px 14px' }}
          >
            <span className="text-[13px]" style={{ color: FAINT, marginRight: 4 }}>$</span>
            <input
              value={retail}
              onChange={(e) => setRetail(e.target.value)}
              className="w-full text-[15px] font-semibold focus:outline-none"
              style={{ background: 'transparent', border: 'none', color: INK }}
              inputMode="decimal"
              aria-label="Retail price"
              data-testid="input-retail-price"
            />
          </div>
        </div>
        <div>
          <div className="text-[10.5px] font-bold uppercase" style={{ letterSpacing: 1.1, color: FAINT }}>
            Run quantity
          </div>
          <div
            className="inline-flex items-center"
            style={{ marginTop: 8, borderRadius: 999, background: CARD, border: `1px solid ${HAIRLINE_SOFT}`, padding: 3 }}
            role="group"
            aria-label="Run quantity"
          >
            {RUNS.map((q) => {
              const active = q === run;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setRun(q)}
                  aria-pressed={active}
                  data-testid={`run-${q}`}
                  className="rounded-full text-[12.5px]"
                  style={{
                    padding: '7px 14px',
                    background: active ? CARD_RAISED : 'transparent',
                    border: active ? `1px solid ${HAIRLINE}` : '1px solid transparent',
                    color: active ? INK : SUBINK,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {q.toLocaleString()}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* math card */}
      <div
        style={{ marginTop: 20, borderRadius: 16, background: CARD, border: `1px solid ${HAIRLINE}`, overflow: 'hidden' }}
        data-testid="card-price-math"
      >
        <div className="flex items-start justify-between gap-4" style={{ padding: '14px 18px', borderBottom: `1px solid ${HAIRLINE_SOFT}` }}>
          <div>
            <div className="text-[13px] font-medium" style={{ color: SUBINK }}>Retail price</div>
            <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 2 }}>What fans pay per record</div>
          </div>
          <div className="text-[14px] font-semibold" style={{ color: INK }}>{money2(retailNum)}</div>
        </div>
        <button
          type="button"
          onClick={() => setCostOpen((v) => !v)}
          aria-expanded={costOpen}
          className="w-full flex items-start justify-between gap-4 text-left"
          style={{ padding: '14px 18px', border: 'none', borderBottom: `1px solid ${HAIRLINE_SOFT}`, background: 'transparent', cursor: 'pointer' }}
          data-testid="toggle-package-cost"
        >
          <div>
            <div className="text-[13px] font-semibold" style={{ color: INK }}>Profit per unit sold</div>
            <div className="inline-flex items-center gap-1 text-[11.5px]" style={{ color: FAINT, marginTop: 2 }}>
              After the {money2(pkg.perUnit)} package cost from {PARTNER_NAME}
              <ChevronDown className="w-3 h-3 transition-transform" style={{ transform: costOpen ? 'rotate(180deg)' : 'none' }} />
            </div>
          </div>
          <div className="text-[14px] font-semibold" style={{ color: INK }}>{money2(profit)}</div>
        </button>
        {costOpen && (
          <div style={{ background: CARD_RAISED, borderBottom: `1px solid ${HAIRLINE_SOFT}` }} data-testid="panel-package-cost">
            {pkg.lines.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-4" style={{ padding: '9px 18px 9px 32px', borderTop: `1px solid ${HAIRLINE_SOFT}` }}>
                <div>
                  <div className="text-[12.5px] font-medium" style={{ color: INK }}>{l.name}</div>
                  {l.note && <div className="text-[11px]" style={{ color: FAINT, marginTop: 1 }}>{l.note}</div>}
                </div>
                <span className="text-[12.5px]" style={{ color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money2(l.v)} <span style={{ color: FAINT, fontSize: 11 }}>/unit</span></span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-4" style={{ padding: '14px 18px', borderBottom: `1px solid ${HAIRLINE_SOFT}` }}>
          <div className="text-[13px] font-semibold" style={{ color: INK }}>
            Base earnings · {run.toLocaleString()} units
          </div>
          <div className="text-[14px] font-bold" style={{ color: INK }}>{money2(base)}</div>
        </div>
        {/* highlighted artist net */}
        <div
          className="flex items-center justify-between gap-4"
          style={{ padding: '16px 18px', background: CARD_RAISED }}
          data-testid="row-artist-net"
        >
          <div>
            <div className="text-[10.5px] font-bold uppercase" style={{ letterSpacing: 1.1, color: BLUE }}>
              Artist net
            </div>
            <div className="text-[11.5px]" style={{ color: SUBINK, marginTop: 2 }}>If the full run sells through</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, color: INK }}>{money2(base)}</div>
        </div>
      </div>
    </div>
  );
}

// Per-cert print cost ladder by projected signed-cert volume tier. Net per
// cert = sale price − ladder cost. Higher volume → lower cost. (Copied
// self-contained from ArtistProjectPackageConfigurator.)
const SIGNED_COST_LADDER: Array<{ min: number; max: number; cost: number }> = [
  { min: 25, max: 49, cost: 13 },
  { min: 50, max: 99, cost: 12 },
  { min: 100, max: 249, cost: 9 },
  { min: 250, max: 499, cost: 7 },
  { min: 500, max: Infinity, cost: 6 },
];

export function signedCostFor(count: number): number {
  const tier = SIGNED_COST_LADDER.find((t) => count >= t.min && count <= t.max);
  // Below the 25-unit minimum there is no print run; fall back to the entry
  // tier cost for a stable net-per-cert projection.
  return tier ? tier.cost : SIGNED_COST_LADDER[0].cost;
}

// ─── GoodDeed® section ──────────────────────────────────────────────────────
// ─── GoodDeed cert — ArtistPackageBuilder's MiniGoodDeed, verbatim ──────────
// A tiny live GoodDeed — built from the album art, so it always matches the
// cover on the record. Orange border, art on top, navy certificate plate below.
function MiniGoodDeed({ coverSrc }: { coverSrc: string | null }) {
  return (
    <div
      className="flex-shrink-0 transition-transform duration-300 hover:scale-105 hover:rotate-0"
      style={{
        width: 76,
        padding: 5,
        backgroundColor: '#f4831f',
        borderRadius: 4,
        transform: 'rotate(-2deg)',
        boxShadow: '0 6px 16px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.1)',
      }}
      data-testid="gooddeed-mini-cert"
    >
      {coverSrc ? (
        <img src={coverSrc} alt="Your album art on the GoodDeed certificate" className="block w-full object-cover" style={{ aspectRatio: '1 / 1' }} />
      ) : (
        /* Nothing uploaded yet — the press mark stands in, never artist art */
        <div className="w-full flex items-center justify-center" style={{ aspectRatio: '1 / 1', background: '#111112' }}>
          <img src={PRESS_LABEL_LOGO} alt="Memphis Record Pressing" style={{ width: '62%', height: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.92 }} />
        </div>
      )}
      {/* The certificate plate */}
      <div style={{ backgroundColor: '#101d36', padding: '4px 4px 3px' }}>
        <div style={{ height: 2, width: '70%', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 1 }} />
        <div style={{ height: 1.5, width: '50%', backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 1, marginTop: 2.5 }} />
        <div className="flex items-end justify-between" style={{ marginTop: 3 }}>
          <div style={{ height: 1.5, width: '40%', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1, marginBottom: 1 }} />
          <div style={{ width: 7, height: 7, backgroundColor: '#fff', borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

export function GoodDeedSection({ onState, coverSrc = californialandCover, runQty = 200 }: {
  onState?: (s: { enabled: boolean; limit: 'none' | 'limit'; certCount: number; certPrice: string }) => void;
  /** Cert art — null falls back to the Memphis press mark. */
  coverSrc?: string | null;
  runQty?: number;
} = {}) {
  const [enabled, setEnabled] = useState(true);
  const [limit, setLimit] = useState<'none' | 'limit'>('limit');
  const [certCount, setCertCount] = useState(250);
  const [certPrice, setCertPrice] = useState('20.00');
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  useEffect(() => { onStateRef.current?.({ enabled, limit, certCount, certPrice }); }, [enabled, limit, certCount, certPrice]);
  const signedVolume = limit === 'limit' ? certCount : runQty;
  const certCost = signedCostFor(signedVolume);
  const certNet = (Number(certPrice) || 0) - certCost;

  return (
    <div
      style={{
        marginTop: 18, borderRadius: 18,
        border: enabled ? `1.5px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
        background: CARD, overflow: 'hidden',
      }}
      data-testid="card-gooddeed"
    >
      {/* offer row — Otis's real top portion: tilted cert, switch far right */}
      <div className="flex items-start gap-4" style={{ padding: 18 }}>
        {/* GoodDeed certificate — ArtistPackageBuilder's MiniGoodDeed, verbatim */}
        <MiniGoodDeed coverSrc={coverSrc} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-4">
            <span className="text-[14px] font-semibold flex-1 min-w-0" style={{ color: INK }}>Offer Signed GoodDeed®</span>
            {/* iOS-style switch — far right, no word label (Otis) */}
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              role="switch"
              aria-checked={enabled}
              aria-label="Offer Signed GoodDeed"
              className="flex-shrink-0"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              data-testid="toggle-gooddeed"
            >
              <span
                style={{
                  display: 'block', width: 40, height: 24, borderRadius: 999, position: 'relative',
                  background: enabled ? BLUE : '#3a3a3e', transition: 'background 0.2s ease',
                }}
              >
                <span
                  style={{
                    position: 'absolute', top: 3, left: enabled ? 19 : 3, width: 18, height: 18,
                    borderRadius: 999, background: '#fff', transition: 'left 0.2s ease',
                  }}
                />
              </span>
            </button>
          </div>
          <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.5 }}>
            You sign each certificate. We handle printing, the holographic authenticity seal,
            and fulfillment with the record. One per vinyl — a true collectible that helps the
            record sell.
          </p>
          <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 8 }}>
            Up to one per vinyl · typically <span className="font-semibold" style={{ color: SUBINK }}>250</span> of 1,000 sell certified
          </div>
        </div>
      </div>

      {enabled && (
        <div style={{ padding: '18px 18px', borderTop: `1px solid ${HAIRLINE_SOFT}` }}>
          {/* certificate price */}
          <div className="text-[10.5px] font-bold uppercase" style={{ letterSpacing: 1.1, color: FAINT }}>
            Certificate price
          </div>
          <div
            className="flex items-center"
            style={{ marginTop: 8, width: 120, borderRadius: 12, border: `1px solid ${HAIRLINE}`, background: CARD_RAISED, padding: '9px 13px' }}
          >
            <span className="text-[13px]" style={{ color: FAINT, marginRight: 4 }}>$</span>
            <input
              value={certPrice}
              onChange={(e) => setCertPrice(e.target.value)}
              className="w-full text-[14px] font-semibold focus:outline-none"
              style={{ background: 'transparent', border: 'none', color: INK }}
              inputMode="decimal"
              aria-label="Certificate price"
              data-testid="input-cert-price"
            />
          </div>

          {/* how many */}
          <div className="text-[10.5px] font-bold uppercase" style={{ letterSpacing: 1.1, color: FAINT, marginTop: 20 }}>
            How many
          </div>
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button
              type="button"
              onClick={() => setLimit('none')}
              aria-pressed={limit === 'none'}
              className="rounded-xl text-left focus:outline-none"
              style={{
                padding: '12px 14px',
                background: limit === 'none' ? CARD_RAISED : 'transparent',
                border: limit === 'none' ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                cursor: 'pointer',
              }}
              data-testid="option-no-limit"
            >
              <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: limit === 'none' ? BLUE : INK }}>
                {limit === 'none' && <Check className="w-3 h-3" strokeWidth={3} />}
                No limit
              </div>
              <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 3 }}>Up to one per vinyl sold</div>
            </button>
            <button
              type="button"
              onClick={() => setLimit('limit')}
              aria-pressed={limit === 'limit'}
              className="rounded-xl text-left focus:outline-none"
              style={{
                padding: '12px 14px',
                background: limit === 'limit' ? CARD_RAISED : 'transparent',
                border: limit === 'limit' ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                cursor: 'pointer',
              }}
              data-testid="option-limit-quantity"
            >
              <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: limit === 'limit' ? BLUE : INK }}>
                {limit === 'limit' && <Check className="w-3 h-3" strokeWidth={3} />}
                Limit quantity
              </div>
              <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 3 }}>Set a cap for scarcity</div>
            </button>
          </div>

          {limit === 'limit' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div
                className="inline-flex items-center"
                style={{ borderRadius: 10, border: `1px solid ${HAIRLINE}`, background: CARD_RAISED, overflow: 'hidden' }}
                data-testid="stepper-certs"
              >
                <button
                  type="button"
                  onClick={() => setCertCount((n) => Math.max(0, n - 10))}
                  aria-label="Fewer certificates"
                  className="flex items-center justify-center"
                  style={{ width: 34, height: 36, background: 'transparent', border: 'none', color: SUBINK, cursor: 'pointer', borderRight: `1px solid ${HAIRLINE_SOFT}` }}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-[13px]" style={{ padding: '0 14px', color: INK }}>
                  <span className="font-bold">{certCount}</span>
                  <span style={{ color: FAINT }}> certs</span>
                </span>
                <button
                  type="button"
                  onClick={() => setCertCount((n) => n + 10)}
                  aria-label="More certificates"
                  className="flex items-center justify-center"
                  style={{ width: 34, height: 36, background: 'transparent', border: 'none', color: SUBINK, cursor: 'pointer', borderLeft: `1px solid ${HAIRLINE_SOFT}` }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 8 }}>
                Never more than one per vinyl sold.
              </div>
            </div>
          )}

          {/* profit per certificate — collapsed */}
          <div
            className="flex items-center justify-between gap-4"
            style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${HAIRLINE_SOFT}` }}
            data-testid="row-cert-profit"
          >
            <div>
              <div className="text-[13px] font-semibold" style={{ color: INK }}>Profit per certificate</div>
              <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 2 }}>
                After the {money2(certCost)} print cost at {signedVolume.toLocaleString()} signed certs
              </div>
            </div>
            <div className="text-[14px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{money2(certNet)}</div>
          </div>

          {/* ladder note — word + icon, never color alone */}
          <div
            className="flex items-center justify-between gap-4"
            style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${HAIRLINE_SOFT}` }}
          >
            <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: SUBINK }}>
              <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: FAINT }} />
              Print cost follows the press&rsquo;s signed-cert ladder &mdash; it drops as volume grows.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Two-tone heading ───────────────────────────────────────────────────────
function TwoTone({ lead, rest, size = 22 }: { lead: string; rest: string; size?: number }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: size, lineHeight: 1.12, fontWeight: 600, margin: 0 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: SUBINK }}>{rest}</span>
    </h2>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
export function ArtistReleasePackageBuilderContent({ embedded = false }: { embedded?: boolean } = {}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);

  return (
    <>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: embedded ? '0 0 48px' : '32px 40px 96px' }}>
        {/* Eyebrow */}
        <div
          className="text-[11px] font-bold uppercase"
          style={{ letterSpacing: 1.4, color: FAINT }}
          data-testid="text-eyebrow"
        >
          Releases › {RELEASE_TITLE}
        </div>

        {/* Header + the single filled accent button (Save) */}
        <div className="flex items-start justify-between gap-6" style={{ marginTop: 10 }}>
          <div className="min-w-0">
            <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, margin: 0 }}>
              <span style={{ color: INK }}>Package. </span>
              <span style={{ color: SUBINK, fontWeight: 600 }}>Design it and see what it earns.</span>
            </h1>
            <p style={{ fontSize: 15, color: SUBINK, marginTop: 12, maxWidth: 580, lineHeight: 1.5 }}>
              One confident decision at a time — size, vinyl, price. Every choice updates the
              record on the left and your take-home on the right. Honest math, no surprises.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0" style={{ marginTop: 4 }}>
            {/* status — word + icon, never color alone */}
            <span className="inline-flex items-center gap-1.5" data-testid="status-saved">
              {saved
                ? <Check className="w-3.5 h-3.5" style={{ color: SUBINK }} />
                : <AlertCircle className="w-3.5 h-3.5" style={{ color: SUBINK }} />}
              <span className="text-[12.5px]" style={{ color: SUBINK }}>{saved ? 'All changes saved' : 'Edited'}</span>
            </span>
            <button
              type="button"
              onClick={() => setSaved(true)}
              disabled={saved}
              className="inline-flex items-center gap-1.5 rounded-full text-[13px] font-semibold"
              style={{
                padding: '8px 22px',
                background: BLUE,
                color: '#fff',
                border: 'none',
                cursor: saved ? 'default' : 'pointer',
                opacity: saved ? 0.45 : 1,
              }}
              data-testid="button-save"
            >
              <Check className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '32px 0 28px' }} />

        {/* ── NEW: Start from a package ── */}
        <section data-testid="section-packages">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4" style={{ color: FAINT }} />
            <TwoTone lead="Packages." rest="Start with a ready build or make your own." />
          </div>
          <p style={{ fontSize: 13, color: SUBINK, marginTop: 8, maxWidth: 620, lineHeight: 1.45 }}>
            Four ready builds from {PARTNER_NAME}. Each one includes its inserts and extras —
            pick one to prefill your record, then keep tuning.
          </p>

          {/* Horizontal rail */}
          <div
            style={{ marginTop: 20, display: 'flex', gap: 20, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'thin' }}
            data-testid="rail-packages"
          >
            {PACKAGES.map((p) => (
              <PackageCard
                key={p.id}
                pkg={p}
                selected={selected === p.id}
                onSelect={() => setSelected(p.id === selected ? null : p.id)}
              />
            ))}
          </div>

          {/* quiet build-your-own hint */}
          <div className="inline-flex items-center gap-1.5" style={{ marginTop: 14, fontSize: 12.5, color: FAINT }}>
            <Sparkles className="w-3.5 h-3.5" />
            Prefer to start clean? The builder below is yours from scratch.
          </div>
        </section>
      </div>

      {/* ── Build your own — the press's canonical builder, on its own darker band ── */}
      <div style={{ background: '#131314', borderTop: `1px solid ${HAIRLINE_SOFT}` }} data-testid="band-builder">
        <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: embedded ? '48px 0 96px' : '48px 40px 96px' }}>
          {/* Breadcrumb + page heading — verbatim from PressQuoteBuilder */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>
              <a href="#" onClick={(e) => e.preventDefault()} className="transition-colors" style={{ color: FAINT }}>Releases</a>
              <span style={{ color: FAINT }}>›</span>
              <a href="#" onClick={(e) => e.preventDefault()} className="transition-colors" style={{ color: FAINT }}>{RELEASE_TITLE}</a>
              <span style={{ color: FAINT }}>›</span>
              <span style={{ color: SUBINK }}>Build from scratch</span>
            </div>
            <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
              <span style={{ color: INK }}>Build. </span>
              <span style={{ color: SUBINK, fontWeight: 600 }}>Price your custom release from scratch.</span>
            </h1>
            <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: SUBINK }}>
              Pick the size once — every later choice is already sized to match.
              When you&rsquo;re done, save it to your release or share it.
            </p>
          </div>

          <BuildFlow />
        </div>
      </div>
    </>
  );
}

export default function ArtistReleasePackageTemplates() {
  return <DarkShell><ArtistReleasePackageBuilderContent /></DarkShell>;
}

// ─── Shared exports — page 2 (ArtistReleasePriceGoodDeed) builds on these ───
export {
  DarkShell, SplitSection, TwoTone, PriceSection, money2, PACKAGE_COST,
  RELEASE_TITLE, PARTNER_NAME, CATALOG_COLORS, SLEEVE_OPTIONS, sleeveLook,
  CANVAS, CARD, CARD_RAISED, INK, SUBINK, FAINT, HAIRLINE, HAIRLINE_SOFT, BLUE,
};
