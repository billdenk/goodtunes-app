// PressAlbumPackageBuilder — the press-facing (white-glove) package builder page.
// The press operator configures the package on the artist's behalf; copy speaks
// to the press about the artist, never as the artist.
//
// A press (Memphis Record Pressing) has invited an artist (Niina Soleil) to
// design the vinyl package for one album — CALIFORNIALAND — and see, honestly
// and delightfully, exactly what they'd earn. This is the moment the artist
// decides whether pressing their record feels real.
//
// It is a sibling of PressPackagePricingTableRuns.tsx (the approved press
// pricing screen) and deliberately reuses its canon: the PressShell chrome,
// the token constants (BLUE/INK/SUBINK/HAIRLINE/CANVAS), the two-tone
// conversational headings, the "Pick a size" cards, the vinyl type + color
// swatch cards, and — the heart of it — the jacket + spinning vinyl disc
// visualization (jacket scales with size, disc peeks out and spins on hover).
//
// It differs from the donor in intent: the press screen is an editor that
// authors a price BOOK; this screen is a configurator that reads one album's
// choices and turns them into the artist's earnings. Instead of the press
// price-book strip / audio spec / turnaround editors, it carries:
//   • an album-context banner (scoped to one album, "At press"),
//   • a conversational album setup (title / artist / tracks),
//   • the canon size + type + color pickers with the live jacket preview,
//   • a pricing & earnings panel — retail, run, profit/unit, GoodDeed®,
//     Artist Net — the delightful, honest math,
//   • add-ons with GoodDeed® as the flagship,
//   • print-template download tiles (mirrors the donor tile style),
//   • one quiet "Share with artist" closing action and a single quiet save
//     model (no per-section save buttons).
//
// Self-contained: donor components are copied in, not imported. Local state
// and seed data only. Apple canon: two-tone headlines, hairline dividers,
// generous whitespace, one filled blue pill, no emojis, real ® character.

import { useMemo, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  UserPlus,
  Search,
  LayoutDashboard,
  Disc3,
  Users,
  Library,
  Gift,
  Settings as Cog,
  Bell,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  Check,
  RotateCcw,
  FileText,
  Download,
  Award,
  Heart,
  BookOpen,
  Send,
  ChevronRight,
  Sparkles,
  Moon,
  Sun,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.png';
import mrpLabelLogo from '../assets/mrp-logo.svg';
import brandonPhoto from '../assets/brandon-seavers.png';
import niinaPhoto from '../assets/niina-soleil.webp';
import californialandCover from '../assets/californialand-cover.jpg';

// ── Per-press label branding (matches donor: black label, white logo always) ──
// The MRP center-label logo is always white-on-black on the pressed disc, and
// the jacket + spinning vinyl render identically in both themes — the product
// preview never changes with the theme.
const PRESS_LABEL_LOGO = mrpLabelLogo;
const PRESS_LABEL_BG = '#0a0a0a';
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';

// ─── Theme-aware brand tokens (Apple calm visual language) ───────────
// Theme-aware: light = the ratified press-portal palette (apple-canon light);
// dark = apple-canon "Dark controls & surfaces" (charcoal, never navy). A
// floating light/dark toggle lives on the mock page (mock-only chrome). Light
// is the default so this surface renders exactly as it did before.
//
// Mutable bindings reassigned by applyTheme() at the top of the page render,
// so the self-contained sub-components read the active theme without threading
// a prop through every call site.
type Theme = {
  BLUE: string;
  INK: string;
  SUBINK: string;
  FAINT: string;      // #a1a1a6 family — captions, muted icons
  HAIRLINE: string;
  CANVAS: string;
  RAIL: string;
  CARD: string;       // raised card surface (was bg-white / #ffffff / #fff)
  TRACK: string;      // segmented-control pill track (was #f0f0f2)
  HEADER_BG: string;  // translucent sticky header
  HOVER_WASH: string; // neutral hover tint (was hover:bg-slate-*)
  BLUE_WASH: string;  // blue text-button hover wash (was #f0f7fc)
  BLUE_TINT_TOP: string; // top stop of the GoodDeed blue-tinted card gradient
  RING: string;       // avatar/search ring (was slate-200)
  CHECK_HALO: string; // selected-swatch check halo behind the tick
  READY: string;
  PILL_SHADOW: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    BLUE: '#319ED8',
    INK: '#1d1d1f',
    SUBINK: '#6e6e73',
    FAINT: '#a1a1a6',
    HAIRLINE: '#e6e6ea',
    CANVAS: '#f5f5f7',
    RAIL: '#f5f5f7',
    CARD: '#ffffff',
    TRACK: '#f0f0f2',
    HEADER_BG: 'rgba(255,255,255,0.72)',
    HOVER_WASH: 'rgba(0,0,0,0.05)',
    BLUE_WASH: '#f0f7fc',
    BLUE_TINT_TOP: '#f4faff',
    RING: '#e2e8f0',
    CHECK_HALO: 'rgba(255,255,255,0.85)',
    READY: '#1c8a5b',
    PILL_SHADOW: '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
  },
  dark: {
    BLUE: '#319ED8',
    INK: '#f5f5f7',
    SUBINK: '#98989d',
    FAINT: '#6e6e73',
    HAIRLINE: 'rgba(255,255,255,0.10)',
    CANVAS: '#161617',
    RAIL: '#1c1c1e',
    CARD: '#1e1e20',
    TRACK: '#26262a',
    HEADER_BG: 'rgba(22,22,23,0.72)',
    HOVER_WASH: 'rgba(255,255,255,0.05)',
    BLUE_WASH: 'rgba(49,158,216,0.14)',
    BLUE_TINT_TOP: 'rgba(49,158,216,0.10)',
    RING: 'rgba(255,255,255,0.14)',
    CHECK_HALO: 'rgba(0,0,0,0.55)',
    READY: '#3fbf62',
    PILL_SHADOW: '0 1px 3px rgba(0,0,0,0.4)',
  },
};

// Mutable active-theme bindings (default light = unchanged render).
let BLUE = THEMES.light.BLUE;
let INK = THEMES.light.INK;
let SUBINK = THEMES.light.SUBINK;
let FAINT = THEMES.light.FAINT;
let HAIRLINE = THEMES.light.HAIRLINE;
let CANVAS = THEMES.light.CANVAS;
let RAIL = THEMES.light.RAIL;
let CARD = THEMES.light.CARD;
let TRACK = THEMES.light.TRACK;
let HEADER_BG = THEMES.light.HEADER_BG;
let HOVER_WASH = THEMES.light.HOVER_WASH;
let BLUE_WASH = THEMES.light.BLUE_WASH;
let BLUE_TINT_TOP = THEMES.light.BLUE_TINT_TOP;
let RING = THEMES.light.RING;
let CHECK_HALO = THEMES.light.CHECK_HALO;
let READY = THEMES.light.READY;
let PILL_SHADOW = THEMES.light.PILL_SHADOW;

// True while the dark theme is active — flips the GoodTunes wordmark (dark
// asset only) to white via CSS invert on dark surfaces, per apple-canon Logos.
let IS_DARK = false;

function applyTheme(mode: 'light' | 'dark') {
  IS_DARK = mode === 'dark';
  const th = THEMES[mode];
  BLUE = th.BLUE;
  INK = th.INK;
  SUBINK = th.SUBINK;
  FAINT = th.FAINT;
  HAIRLINE = th.HAIRLINE;
  CANVAS = th.CANVAS;
  RAIL = th.RAIL;
  CARD = th.CARD;
  TRACK = th.TRACK;
  HEADER_BG = th.HEADER_BG;
  HOVER_WASH = th.HOVER_WASH;
  BLUE_WASH = th.BLUE_WASH;
  BLUE_TINT_TOP = th.BLUE_TINT_TOP;
  RING = th.RING;
  CHECK_HALO = th.CHECK_HALO;
  READY = th.READY;
  PILL_SHADOW = th.PILL_SHADOW;
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Vinyl layer kit (from donor) ────────────────────────────────────
const LAYERS = {
  opaque: '/__mockup/vinyl-layers/opaque-vinyl.png',
  translucent: '/__mockup/vinyl-layers/translucent-vinyl.png',
  splatter1: '/__mockup/vinyl-layers/splatter-one.png',
  splatter2: '/__mockup/vinyl-layers/splatter-two.png',
  splatter3: '/__mockup/vinyl-layers/splatter-three.png',
  highlights: '/__mockup/vinyl-layers/vinyl-highlights.png',
  inner: '/__mockup/vinyl-layers/inner-circle.png',
};

type SwatchKind = 'black' | 'opaque' | 'translucent' | 'splatter';

type Swatch = {
  id: string;
  name: string;
  kind: SwatchKind;
  base: string;
  s1?: string;
  s2?: string;
  s3?: string;
};

function MaskLayer({
  color,
  mask,
  blendMode = 'normal',
  opacity = 1,
  maskSize = '102% 102%',
}: {
  color: string;
  mask: string;
  blendMode?: React.CSSProperties['mixBlendMode'];
  opacity?: number;
  maskSize?: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        backgroundColor: color,
        opacity,
        mixBlendMode: blendMode,
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
            <path id="gt-cland-label-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill="rgba(245,245,247,0.5)" style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#gt-cland-label-bottom" startOffset="50%" textAnchor="middle">
              MRP-CLND · 33 ⅓ RPM
            </textPath>
          </text>
        </svg>
      )}
    </div>
  );
}

function VinylDisc({
  size,
  swatch,
  bodyRef,
  labelRatio,
  holeRatio = 0.018,
}: {
  size: number;
  swatch: Swatch;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  labelRatio?: number;
  holeRatio?: number;
}) {
  const LABEL_RATIO = labelRatio ?? 368 / 1104;
  const INNER_RATIO = 129 / 1104;
  const translucent = swatch.kind === 'translucent';
  const isSplatter = swatch.kind === 'splatter';
  const spin = !!bodyRef;

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
      <div
        ref={bodyRef}
        style={{ position: 'absolute', inset: 0, borderRadius: '50%', willChange: spin ? 'transform' : undefined }}
      >
        {translucent ? (
          <MaskLayer color={swatch.base} mask={LAYERS.translucent} opacity={1} />
        ) : (
          <MaskLayer color={swatch.base} mask={LAYERS.opaque} />
        )}

        {isSplatter && (
          <>
            <MaskLayer color={swatch.s1 ?? swatch.base} mask={LAYERS.splatter1} />
            <MaskLayer color={swatch.s2 ?? swatch.base} mask={LAYERS.splatter2} />
            <MaskLayer color={swatch.s3 ?? swatch.base} mask={LAYERS.splatter3} />
          </>
        )}

        {spin && translucent && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              pointerEvents: 'none',
              mixBlendMode: 'multiply',
              opacity: 0.14,
              background:
                'radial-gradient(38% 44% at 38% 34%, rgba(0,0,0,0.7), rgba(0,0,0,0) 62%),' +
                'radial-gradient(30% 34% at 68% 66%, rgba(0,0,0,0.55), rgba(0,0,0,0) 60%),' +
                'radial-gradient(24% 26% at 60% 24%, rgba(0,0,0,0.4), rgba(0,0,0,0) 58%)',
            }}
          />
        )}

        {spin && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              pointerEvents: 'none',
              mixBlendMode: translucent ? 'multiply' : 'screen',
              opacity: translucent ? 0.05 : 0.06,
              background:
                'conic-gradient(from 0deg,' +
                'rgba(255,255,255,0) 0deg, rgba(255,255,255,0.9) 24deg, rgba(255,255,255,0) 70deg,' +
                'rgba(255,255,255,0) 150deg, rgba(255,255,255,0.7) 176deg, rgba(255,255,255,0) 220deg,' +
                'rgba(255,255,255,0) 300deg, rgba(255,255,255,0.6) 324deg, rgba(255,255,255,0) 360deg)',
            }}
          />
        )}

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

      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#ffffff',
          opacity: 0.6,
          mixBlendMode: 'normal',
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

// ─── Hover-spin physics (self-contained; from donor) ─────────────────
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

// Stacks the sticky two-column body when the viewport gets too narrow for the
// preview rail + a 620px earnings column (avoids horizontal overflow < 1440).
function useNarrow(maxWidth = 1080): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [maxWidth]);
  return narrow;
}

const REWIND_MS = 700;

function RewindButton({ show, onClick, size = 28 }: { show: boolean; onClick: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label="Rewind record to start"
      data-testid="button-rewind"
      className="rounded-full flex items-center justify-center transition-all"
      style={{
        width: size,
        height: size,
        opacity: show ? 1 : 0,
        pointerEvents: show ? 'auto' : 'none',
        transform: show ? 'scale(1)' : 'scale(0.9)',
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${HAIRLINE}`,
        boxShadow: PILL_SHADOW,
        color: SUBINK,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = INK;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = SUBINK;
      }}
    >
      <RotateCcw style={{ width: size * 0.5, height: size * 0.5 }} />
    </button>
  );
}

// ─── Product types + disc scale ──────────────────────────────────────
type ProductTypeId = 'single7' | 'lp12' | 'double12';
type ProductType = {
  id: ProductTypeId;
  name: string;
  format: string;
  inches: number;
  labelInches: number;
  discs: number;
};

const PRODUCT_TYPES: ProductType[] = [
  { id: 'single7', name: '7" Single', format: '7" · 45 RPM', inches: 7, labelInches: 3.3, discs: 1 },
  { id: 'lp12', name: '12" LP', format: '12" · 33 ⅓ RPM', inches: 12, labelInches: 3.94, discs: 1 },
  { id: 'double12', name: '12" Double LP', format: '2 × 12" · 33 ⅓ RPM', inches: 12, labelInches: 3.94, discs: 2 },
];

// ─── Jacket stage — album cover with the record peeking out to the right ──
function JacketStage({ swatch, product, cover }: { swatch: Swatch; product: ProductType; cover?: string }) {
  const [hover, setHover] = useState(false);
  const reduced = usePrefersReducedMotion();
  // Rotate only the disc body so the specular highlight stays fixed like a
  // real light source. On hover the record slides out and gives a slow turn.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.transition = 'transform 0.55s cubic-bezier(0.32, 0.72, 0.28, 1)';
    el.style.transform = hover && !reduced ? 'rotate(32deg)' : 'rotate(0deg)';
  }, [hover, reduced]);
  const bodyRef2 = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = bodyRef2.current;
    if (!el) return;
    el.style.transition = 'transform 0.75s cubic-bezier(0.32, 0.72, 0.28, 1) 0.1s';
    el.style.transform = hover && !reduced ? 'rotate(18deg)' : 'rotate(0deg)';
  }, [hover, reduced]);

  const jacketPx = Math.round(300 * (product.inches / 12));
  const discPx = Math.round(jacketPx * 0.96);
  const labelRatio = product.labelInches / product.inches;
  const holeRatio = 0.3 / product.inches;

  return (
    <div
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{ position: 'relative', width: jacketPx + jacketPx * 0.5, height: jacketPx + 24, cursor: 'pointer' }}
      aria-label={`${swatch.name} record inside the CALIFORNIALAND jacket`}
    >
      {/* second record (Double LP) — peeks a touch further, on a slight delay */}
      {product.discs > 1 && (
        <div
          style={{
            position: 'absolute',
            top: (jacketPx - discPx) / 2,
            left: jacketPx - discPx + jacketPx * 0.27,
            transition: 'transform 0.55s cubic-bezier(0.32, 0.72, 0.28, 1) 0.1s',
            transform: hover ? `translateX(${jacketPx * 0.3}px)` : 'translateX(0)',
            willChange: 'transform',
            zIndex: 0,
            filter: 'brightness(0.88)',
          }}
        >
          <VinylDisc size={discPx} swatch={swatch} bodyRef={bodyRef2} labelRatio={labelRatio} holeRatio={holeRatio} />
        </div>
      )}

      {/* record — behind the jacket, slides right on hover */}
      <div
        style={{
          position: 'absolute',
          top: (jacketPx - discPx) / 2,
          left: jacketPx - discPx + jacketPx * 0.22,
          transition: 'transform 0.55s cubic-bezier(0.32, 0.72, 0.28, 1)',
          transform: hover ? `translateX(${jacketPx * 0.24}px)` : 'translateX(0)',
          willChange: 'transform',
          zIndex: 1,
        }}
      >
        <VinylDisc size={discPx} swatch={swatch} bodyRef={bodyRef} labelRatio={labelRatio} holeRatio={holeRatio} />
      </div>

      {/* jacket — in front, the artist's CALIFORNIALAND artwork */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: jacketPx,
          height: jacketPx,
          borderRadius: 3,
          overflow: 'hidden',
          backgroundColor: '#141416',
          boxShadow: '0 18px 40px rgba(0,0,0,0.25), inset -1px 0 0 rgba(255,255,255,0.06)',
          zIndex: 2,
        }}
      >
        {cover ? (
          <img src={cover} alt="CALIFORNIALAND cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={PRESS_LABEL_LOGO} alt="" style={{ width: jacketPx * 0.42, height: jacketPx * 0.42, filter: 'invert(1)', opacity: 0.92 }} />
          </span>
        )}
        {/* spine hint */}
        <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 7, background: 'linear-gradient(90deg, rgba(0,0,0,0.5), transparent)' }} />
      </div>

      {/* floor shadow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: -6,
          left: jacketPx * 0.1,
          width: jacketPx * 0.9 + jacketPx * 0.22 * 0.6,
          height: 14,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.28)',
          filter: 'blur(9px)',
          pointerEvents: 'none',
          transform: hover ? 'scaleX(1.18)' : 'scaleX(1)',
          transformOrigin: '30% center',
          transition: 'transform 0.55s cubic-bezier(0.32, 0.72, 0.28, 1)',
          willChange: 'transform',
        }}
      />
    </div>
  );
}

// Glossy round color ball
function ColorBall({ swatch, size = 34 }: { swatch: Swatch; size?: number }) {
  const isSplatter = swatch.kind === 'splatter';
  if (isSplatter) {
    return (
      <span className="relative block rounded-full overflow-hidden" style={{ width: size, height: size, boxShadow: '0 0 0 1px rgba(15,23,42,0.10)' }}>
        <VinylDisc size={size} swatch={swatch} />
      </span>
    );
  }
  return (
    <span className="relative block rounded-full" style={{ width: size, height: size, boxShadow: '0 0 0 1px rgba(15,23,42,0.10)' }}>
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${swatch.base} 70%)`,
          opacity: swatch.kind === 'translucent' ? 0.86 : 0.96,
        }}
      />
    </span>
  );
}

// ─── Vinyl types + colors (mirrors the canon type/color pickers) ─────
type VinylType = {
  id: SwatchKind;
  name: string;
  blurb: string;
  swatch: Swatch;
  colors: Swatch[];
};

const VINYL_TYPES: VinylType[] = [
  {
    id: 'black',
    name: 'Black',
    blurb: 'Standard weight',
    swatch: { id: 'b-black', name: 'Classic Black', kind: 'black', base: '#111114' },
    colors: [
      { id: 'blk-1', name: 'Classic Black', kind: 'black', base: '#111114' },
      { id: 'blk-2', name: 'Midnight', kind: 'black', base: '#1a1a22' },
    ],
  },
  {
    id: 'opaque',
    name: 'Opaque',
    blurb: 'Solid color',
    swatch: { id: 'b-opaque', name: 'Oxblood', kind: 'opaque', base: '#5A1620' },
    colors: [
      { id: 'op-1', name: 'Oxblood', kind: 'opaque', base: '#5A1620' },
      { id: 'op-2', name: 'Canary', kind: 'opaque', base: '#EFD34C' },
      { id: 'op-3', name: 'Coral', kind: 'opaque', base: '#E9705F' },
      { id: 'op-4', name: 'Sky', kind: 'opaque', base: '#8FB8DF' },
      { id: 'op-5', name: 'Mint', kind: 'opaque', base: '#9CC5B0' },
      { id: 'op-6', name: 'Bone White', kind: 'opaque', base: '#EFEBE2' },
    ],
  },
  {
    id: 'translucent',
    name: 'Translucent',
    blurb: 'See-through tint',
    swatch: { id: 'b-trans', name: 'Ruby', kind: 'translucent', base: '#C4373F' },
    colors: [
      { id: 'T01', name: 'T01 Ruby', kind: 'translucent', base: '#C4373F' },
      { id: 'T02', name: 'T02 Cobalt', kind: 'translucent', base: '#2563EB' },
      { id: 'T03', name: 'T03 Emerald', kind: 'translucent', base: '#2E8B5F' },
      { id: 'T04', name: 'T04 Amber', kind: 'translucent', base: '#D9A94E' },
      { id: 'T05', name: 'T05 Magenta', kind: 'translucent', base: '#B04578' },
      { id: 'T06', name: 'T06 Clear', kind: 'translucent', base: '#EDEDF0' },
    ],
  },
  {
    id: 'splatter',
    name: 'Splatter',
    blurb: 'Multi-color spray',
    swatch: { id: 'b-splat', name: 'Cosmic', kind: 'splatter', base: '#1B3A6B', s1: '#F5F5DC', s2: '#E8C84A', s3: '#E0E0E0' },
    colors: [
      { id: 'sp-1', name: 'Cosmic', kind: 'splatter', base: '#1B3A6B', s1: '#F5F5DC', s2: '#E8C84A', s3: '#E0E0E0' },
      { id: 'sp-2', name: 'Firecracker', kind: 'splatter', base: '#B3262E', s1: '#F2E7C9', s2: '#E8A13C', s3: '#1d1d1f' },
      { id: 'sp-3', name: 'Sunburst', kind: 'splatter', base: '#E8C84A', s1: '#D97038', s2: '#B3262E', s3: '#F5F5DC' },
    ],
  },
];

// ─── Shell primitives (Press persona, from donor) ────────────────────
type PressNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  { label: 'Projects', icon: Disc3, active: true },
  { label: 'Acquisition', icon: UserPlus },
  { label: 'Vinyl catalog', icon: Library },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

function NavRow({ label, icon: Icon, active }: PressNavItem) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className="flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors"
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        backgroundColor: active ? CARD : undefined,
        boxShadow: active ? PILL_SHADOW : undefined,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = HOVER_WASH; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = ''; }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : FAINT }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

const PARTNER_NAME = 'Memphis Record Pressing';
const USER_FIRST_NAME = 'Brandon';
const USER_EMAIL = 'brandon@memphisrecordpressing.com';
const USER_INITIALS = 'BS';

const USER_MENU: Array<{ label: string; icon: typeof UserPen }> = [
  { label: 'Edit profile', icon: UserPen },
  { label: 'Invite teammate', icon: UserPlus },
  { label: 'Security', icon: ShieldCheck },
];

function UserMenu() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-shadow"
          aria-label="Account menu"
          data-testid="button-user-menu"
        >
          <img src={brandonPhoto} alt={USER_INITIALS} className="w-full h-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-0 rounded-2xl" style={{ border: `1px solid ${HAIRLINE}` }} data-testid="menu-user">
        <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="text-[13.5px] font-semibold" style={{ color: INK }}>
            {USER_FIRST_NAME}
          </div>
          <div className="text-[11.5px] truncate" style={{ color: SUBINK }}>
            {USER_EMAIL}
          </div>
        </div>
        <div className="py-1.5">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors"
                style={{ color: INK }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: FAINT }} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1.5" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <button type="button" className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors" style={{ color: INK }}>
            <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: FAINT }} />
            <span>Sign out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PressShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{
          backgroundColor: HEADER_BG,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-9 w-9 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0 p-1">
            <img src={mrpLogo} alt={PARTNER_NAME} className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            {PARTNER_NAME}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button size="sm" variant="ghost" className="rounded-full" style={{ color: SUBINK, paddingLeft: 12, paddingRight: 12 }} data-testid="button-feedback">
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ color: SUBINK }}
            aria-label="Notifications"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = HOVER_WASH)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: RAIL, borderRight: `1px solid ${HAIRLINE}` }}>
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: FAINT }} />
              <input
                className="w-full h-9 pl-8 pr-2 rounded-full text-[12.5px] placeholder:text-slate-400 focus:outline-none"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK, backgroundColor: CARD }}
                placeholder="Search…  ⌘K"
                readOnly
              />
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {PRESS_NAV.map((item) => (
              <NavRow key={item.label} {...item} />
            ))}
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: FAINT }}>
              Powered by
            </span>
            <img
              src={goodtunesLogo}
              alt="GoodTunes"
              className="h-5 w-auto"
              style={{ filter: IS_DARK ? 'invert(1) brightness(2)' : undefined }}
            />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

// ─── Two-tone headings ───────────────────────────────────────────────
function PageHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: FAINT, fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: FAINT }}>
      {children}
    </div>
  );
}

function TwoTone({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: FAINT }}>{rest}</span>
    </h2>
  );
}

function Divider() {
  return <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />;
}

// ─── Conversational album setup (title / artist / tracks) ────────────
function SetupField({
  label,
  value,
  onChange,
  wide,
  numeric,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
  numeric?: boolean;
  testId: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: wide ? '2 1 0' : '1 1 0', minWidth: 0 }}>
      <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: FAINT }}>
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/[^0-9]/g, '') : e.target.value)}
        inputMode={numeric ? 'numeric' : undefined}
        data-testid={testId}
        className={cn('text-[14px] focus:outline-none focus:border-slate-400 transition-colors', numeric && 'tabular-nums')}
        style={{ height: 44, width: '100%', minWidth: 0, border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: '0 14px', color: INK, background: CARD, fontWeight: 600 }}
      />
    </div>
  );
}

// ─── Size cards (canon "Pick a size") ────────────────────────────────
function SizeCards({ value, onChange }: { value: ProductTypeId; onChange: (v: ProductTypeId) => void }) {
  return (
    <div style={{ marginTop: 14, display: 'flex', gap: 12 }}>
      {PRODUCT_TYPES.map((p) => {
        const active = p.id === value;
        const [big, ...rest] = p.name.split(' ');
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            aria-pressed={active}
            data-testid={`size-${p.id}`}
            className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
            style={{ backgroundColor: CARD, flex: 1, padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
          >
            <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{big}</div>
            <div className="text-[11px]" style={{ marginTop: 3, color: FAINT }}>{rest.join(' ')}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Vinyl-type cards (disc thumbnails) ──────────────────────────────
function TypeCards({ value, onChange }: { value: SwatchKind; onChange: (v: SwatchKind) => void }) {
  return (
    <div className="grid grid-cols-4 gap-3" style={{ marginTop: 14 }}>
      {VINYL_TYPES.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={active}
            data-testid={`type-${t.id}`}
            className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
            style={{ backgroundColor: CARD, padding: 14, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
          >
            <div className="flex justify-center" style={{ marginBottom: 10 }}>
              <VinylDisc size={84} swatch={t.swatch} />
            </div>
            <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
              {t.name}
            </div>
            <div className="text-[11.5px]" style={{ marginTop: 2, color: FAINT }}>
              {t.blurb}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Color swatch cards ──────────────────────────────────────────────
function ColorCards({ colors, value, onChange }: { colors: Swatch[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-3" style={{ marginTop: 14 }}>
      {colors.map((c) => {
        const on = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            aria-pressed={on}
            data-testid={`color-${c.id}`}
            className="rounded-2xl text-center transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
            style={{ backgroundColor: CARD, padding: '16px 10px 12px', border: on ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
          >
            <div className="relative flex justify-center" style={{ marginBottom: 8 }}>
              <ColorBall swatch={c} size={48} />
              {on && (
                <span
                  className="absolute flex items-center justify-center rounded-full"
                  style={{ width: 18, height: 18, backgroundColor: CHECK_HALO, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                >
                  <Check className="w-3 h-3" style={{ color: BLUE }} strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="text-[12.5px] font-semibold leading-tight" style={{ color: on ? BLUE : INK }}>
              {c.name}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Money helpers ───────────────────────────────────────────────────
function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// ─── A single earnings line in the receipt-style panel ───────────────
function EarnLine({
  label,
  hint,
  value,
  strong,
}: {
  label: string;
  hint?: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4" style={{ padding: '11px 0' }}>
      <div className="min-w-0">
        <div className={cn('leading-tight', strong ? 'text-[14px] font-semibold' : 'text-[13.5px]')} style={{ color: strong ? INK : SUBINK }}>
          {label}
        </div>
        {hint && (
          <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      <div className={cn('tabular-nums flex-shrink-0', strong ? 'text-[15px] font-semibold' : 'text-[14px] font-medium')} style={{ color: INK }}>
        {value}
      </div>
    </div>
  );
}

// ─── Add-on tile (GoodDeed flagship + the request-a-quote rows) ──────
// The GoodDeed flagship card — visually distinct, warm, the special one.
// A tiny live GoodDeed — built from the album art, so it always matches the
// cover on the record. Orange border, art on top, navy certificate plate below.
function MiniGoodDeed({ coverSrc }: { coverSrc: string }) {
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
      <img src={coverSrc} alt="Album art on the GoodDeed certificate" className="block w-full object-cover" style={{ aspectRatio: '1 / 1.1' }} />
      {/* The certificate plate */}
      <div style={{ backgroundColor: '#101d36', padding: '4px 4px 3px' }}>
        <div style={{ height: 2, width: '70%', backgroundColor: CHECK_HALO, borderRadius: 1 }} />
        <div style={{ height: 1.5, width: '50%', backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 1, marginTop: 2.5 }} />
        <div className="flex items-end justify-between" style={{ marginTop: 3 }}>
          <div style={{ height: 1.5, width: '40%', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1, marginBottom: 1 }} />
          <div style={{ width: 7, height: 7, backgroundColor: '#fff', borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

function GoodDeedCard({
  on,
  onToggle,
  runQty,
  deedUnits,
  perUnit,
  total,
  coverSrc,
  retail,
  onRetail,
  mode,
  onMode,
  cap,
  onCap,
  take,
  onTake,
  mfg,
  fee,
  cost,
}: {
  on: boolean;
  onToggle: () => void;
  runQty: number;
  deedUnits: number;
  perUnit: number;
  total: number;
  coverSrc: string;
  retail: number;
  onRetail: (v: number) => void;
  mode: 'nolimit' | 'cap';
  onMode: (m: 'nolimit' | 'cap') => void;
  cap: number;
  onCap: (v: number) => void;
  take: number;
  onTake: (v: number) => void;
  mfg: number;
  fee: number;
  cost: number;
}) {
  const [showDeedCost, setShowDeedCost] = useState(false);
  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        border: on ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
        background: on
          ? `linear-gradient(180deg, ${BLUE_TINT_TOP} 0%, ${CARD} 55%)`
          : CARD,
      }}
      data-testid="addon-gooddeed"
    >
      <div className="flex items-start gap-4" style={{ padding: 18 }}>
        <MiniGoodDeed coverSrc={coverSrc} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold tracking-tight" style={{ color: INK }}>
              Offer Signed GoodDeed<sup style={{ fontSize: '0.6em', top: '-0.5em' }}>®</sup>
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full text-[10px] font-bold uppercase tracking-wider px-2 h-5"
              style={{ color: BLUE, backgroundColor: '#e8f4fc' }}
            >
              <Sparkles className="w-3 h-3" /> Flagship
            </span>
          </div>
          <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 5, lineHeight: 1.45, maxWidth: 460 }}>
            The artist signs each certificate. GoodTunes handles printing, the holographic authenticity seal, and
            fulfillment with the record. One per vinyl — a true collectible that helps the record sell.
          </p>
          <div className="text-[12px]" style={{ color: FAINT, marginTop: 8 }}>
            {mode === 'cap' ? (
              <>Capped at <span className="font-semibold tabular-nums" style={{ color: INK }}>{deedUnits.toLocaleString('en-US')}</span> certificates
                {' · '}run of <span className="tabular-nums">{runQty.toLocaleString('en-US')}</span></>
            ) : (
              <>Up to one per vinyl · typically <span className="font-semibold tabular-nums" style={{ color: INK }}>{deedUnits.toLocaleString('en-US')}</span> of{' '}
                <span className="tabular-nums">{runQty.toLocaleString('en-US')}</span> sell certified</>
            )}
          </div>
        </div>
        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={onToggle}
          data-testid="toggle-gooddeed"
          className="relative flex-shrink-0 rounded-full transition-colors focus:outline-none"
          style={{ width: 46, height: 28, backgroundColor: on ? BLUE : '#d1d1d6' }}
        >
          <span
            className="absolute rounded-full transition-transform"
            style={{ backgroundColor: CARD, width: 22, height: 22, top: 3, left: 3, transform: on ? 'translateX(18px)' : 'translateX(0)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
          />
        </button>
      </div>
      {/* Price controls + receipt appear when on */}
      {on && (
        <>
          <div
            className="flex flex-col gap-5"
            style={{ padding: '16px 18px', borderTop: `1px solid ${HAIRLINE}`, background: 'rgba(255,255,255,0.6)' }}
          >
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: FAINT, marginBottom: 8 }}>
                Certificate price
              </div>
              <RetailControl value={retail} onChange={onRetail} />
            </div>
            <div style={{ maxWidth: 460 }}>
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: FAINT, marginBottom: 8 }}>
                How many
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {([
                  { m: 'nolimit' as const, title: 'No limit', sub: 'Up to one per vinyl sold' },
                  { m: 'cap' as const, title: 'Limit quantity', sub: 'Set a cap for scarcity' },
                ]).map(({ m, title, sub }) => {
                  const active = mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onMode(m)}
                      data-testid={`deed-mode-${m}`}
                      className="rounded-xl text-left transition-all"
                      style={{
                        backgroundColor: CARD,
                        padding: '12px 14px',
                        border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                        margin: active ? 0 : 1,
                      }}
                    >
                      <div className="text-[13.5px] font-semibold" style={{ color: active ? BLUE : INK }}>{title}</div>
                      <div className="text-[11.5px]" style={{ color: SUBINK, marginTop: 2 }}>{sub}</div>
                    </button>
                  );
                })}
              </div>
              {mode === 'nolimit' && (
                <div className="grid grid-cols-2 gap-2.5" style={{ marginTop: 14 }}>
                <div style={{ gridColumn: 1 }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: FAINT, marginBottom: 6 }}>
                    Expected take rate
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center rounded-xl overflow-hidden" style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: CARD }}>
                      <button
                        type="button"
                        onClick={() => onTake(Math.max(5, take - 5))}
                        data-testid="deed-take-minus"
                        className="flex items-center justify-center transition-colors"
                        style={{ width: 36, height: 38, color: SUBINK, fontSize: 16 }}
                      >
                        −
                      </button>
                      <div className="tabular-nums text-[14px] font-semibold text-center" style={{ color: INK, minWidth: 64, borderLeft: `1px solid ${HAIRLINE}`, borderRight: `1px solid ${HAIRLINE}`, padding: '8px 10px' }}>
                        {take} <span className="font-normal" style={{ color: SUBINK }}>%</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onTake(Math.min(100, take + 5))}
                        data-testid="deed-take-plus"
                        className="flex items-center justify-center transition-colors"
                        style={{ width: 36, height: 38, color: SUBINK, fontSize: 16 }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 6 }}>
                    of vinyl buyers — an example of what typically sells
                  </div>
                </div>
                </div>
              )}
              {mode === 'cap' && (
                <div className="grid grid-cols-2 gap-2.5" style={{ marginTop: 14 }}>
                <div style={{ gridColumn: 2 }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: FAINT, marginBottom: 6 }}>
                    Cap
                  </div>
                  <div className="inline-flex items-center rounded-xl overflow-hidden" style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: CARD }}>
                    <button
                      type="button"
                      onClick={() => onCap(Math.max(50, cap - 50))}
                      data-testid="deed-cap-minus"
                      className="flex items-center justify-center transition-colors"
                      style={{ width: 36, height: 38, color: SUBINK, fontSize: 16 }}
                    >
                      −
                    </button>
                    <div className="tabular-nums text-[14px] font-semibold text-center" style={{ color: INK, minWidth: 92, borderLeft: `1px solid ${HAIRLINE}`, borderRight: `1px solid ${HAIRLINE}`, padding: '8px 10px' }}>
                      {cap.toLocaleString('en-US')} <span className="font-normal" style={{ color: SUBINK }}>certs</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onCap(Math.min(runQty, cap + 50))}
                      data-testid="deed-cap-plus"
                      className="flex items-center justify-center transition-colors"
                      style={{ width: 36, height: 38, color: SUBINK, fontSize: 16 }}
                    >
                      +
                    </button>
                  </div>
                  <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 6 }}>Never more than one per vinyl sold.</div>
                </div>
                </div>
              )}
            </div>
          </div>

          {/* The certificate receipt — same honest math as the record */}
          <div style={{ padding: '0 18px', background: 'rgba(255,255,255,0.6)' }}>
            <div className="flex items-baseline justify-between gap-4" style={{ paddingTop: 12 }}>
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium leading-tight" style={{ color: INK }}>Profit per certificate</div>
                <button
                  type="button"
                  onClick={() => setShowDeedCost((v) => !v)}
                  data-testid="button-deed-cost-breakdown"
                  className="flex items-center gap-1 text-[11.5px] transition-colors"
                  style={{ color: FAINT, marginTop: 2 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = SUBINK)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = FAINT)}
                >
                  After the {money(cost)} cost per signed certificate
                  <ChevronRight className="w-3 h-3 transition-transform" style={{ transform: showDeedCost ? 'rotate(90deg)' : 'none' }} />
                </button>
              </div>
              <div className="tabular-nums flex-shrink-0 text-[14px] font-medium" style={{ color: INK }}>
                {money(perUnit)}
              </div>
            </div>
            <div
              style={{
                overflow: 'hidden',
                maxHeight: showDeedCost ? 140 : 0,
                opacity: showDeedCost ? 1 : 0,
                transition: 'max-height 0.35s ease, opacity 0.25s ease',
              }}
            >
              <div style={{ margin: '8px 0 4px', paddingLeft: 14, borderLeft: `2px solid ${HAIRLINE}` }}>
                <div className="flex items-baseline justify-between gap-4" style={{ padding: '4px 0' }}>
                  <span className="text-[12px]" style={{ color: SUBINK }}>Manufacturing & shipping · printed, sealed, fulfilled</span>
                  <span className="tabular-nums text-[12px]" style={{ color: SUBINK }}>{money(mfg)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-4" style={{ padding: '4px 0' }}>
                  <span className="text-[12px]" style={{ color: SUBINK }}>Payment processing</span>
                  <span className="tabular-nums text-[12px]" style={{ color: SUBINK }}>{money(fee)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-4" style={{ padding: '6px 0 2px', borderTop: `1px solid ${HAIRLINE}`, marginTop: 4 }}>
                  <span className="text-[12px] font-semibold" style={{ color: INK }}>Cost per certificate</span>
                  <span className="tabular-nums text-[12px] font-semibold" style={{ color: INK }}>{money(cost)}</span>
                </div>
              </div>
            </div>
            <div style={{ paddingBottom: 12 }} />
          </div>

          <div
            className="flex items-center justify-between"
            style={{ padding: '13px 18px', borderTop: `1px solid ${HAIRLINE}`, background: 'rgba(255,255,255,0.6)' }}
            data-testid="gooddeed-earnings"
          >
            <div className="text-[12.5px]" style={{ color: SUBINK }}>
              Adds <span className="font-semibold tabular-nums" style={{ color: INK }}>{money(perUnit)}</span> per certified unit
              {' · '}
              <span className="tabular-nums">{deedUnits.toLocaleString('en-US')}</span> certificates
              <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 2 }}>
                This is an estimate — the artist is billed on actual sales.
              </div>
            </div>
            <div className="text-[15px] font-semibold tabular-nums" style={{ color: READY }}>
              + {money(total)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Print template download tile (mirrors donor filled-tile style) ──
type TemplateFile = { key: string; label: string; file: string };

function middleTruncate(s: string, max = 26): string {
  if (s.length <= max) return s;
  const keep = Math.floor((max - 1) / 2);
  return `${s.slice(0, max - 1 - keep)}…${s.slice(-keep)}`;
}

// Blueprint icons — line drawings of the actual piece, drawn like a die-line.
// Solid strokes are edges; dashed strokes are folds, holes, and hidden parts.
function BlueprintIcon({ kind }: { kind: string }) {
  const s: React.SVGProps<SVGSVGElement> = {
    width: 44,
    height: 44,
    viewBox: '0 0 26 26',
    fill: 'none',
    stroke: BLUE,
    strokeWidth: 0.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (kind) {
    case 'jacket': // square jacket, dashed spine fold, record peeking out the right
      return (
        <svg {...s}>
          <circle cx="17.5" cy="13" r="6.5" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="17.5" cy="13" r="1.4" strokeDasharray="1.2 1.6" opacity={0.7} />
          <rect x="3" y="4" width="18" height="18" rx="1.2" fill="#fff" />
        </svg>
      );
    case 'labels': // center label — dashed record as context, solid label as the piece
      return (
        <svg {...s}>
          <circle cx="13" cy="13" r="11" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="13" cy="13" r="6.5" fill="#fff" />
          <circle cx="13" cy="13" r="1.3" />
          <path d="M9.6 10.4a4.6 4.6 0 0 1 6.8 0" opacity={0.6} />
        </svg>
      );
    case 'inner': // inner sleeve — square sleeve half-hidden behind the dashed jacket
      return (
        <svg {...s}>
          <rect x="9" y="5.5" width="15" height="15" rx="1" fill="#fff" />
          <rect x="2" y="5" width="16" height="16" rx="1.2" strokeDasharray="2 2.2" opacity={0.7} fill="#fff" />
        </svg>
      );
    case 'booklet': // folded booklet — dashed center fold, text lines
      return (
        <svg {...s}>
          <rect x="4" y="4.5" width="18" height="17" rx="1.2" fill="#fff" />
          <path d="M13 4.5v17" strokeDasharray="2 2.2" opacity={0.7} />
          <path d="M7 9.5h3.5M7 12.5h3.5M7 15.5h2.5M15.5 9.5h3.5M15.5 12.5h3.5" opacity={0.7} />
        </svg>
      );
    default:
      return <FileText className="w-4 h-4" style={{ color: BLUE }} />;
  }
}

function TemplateTile({ tf }: { tf: TemplateFile }) {
  return (
    <div
      className="group relative flex flex-col items-center justify-center rounded-xl text-center"
      style={{ border: `1px solid ${HAIRLINE}`, padding: '18px 12px', backgroundColor: CARD }}
      data-testid={`template-${tf.key}`}
    >
      <BlueprintIcon kind={tf.key} />
      <div className="text-[13px] font-semibold" style={{ color: INK, marginTop: 8 }}>
        {tf.label}
      </div>
      <div className="text-[11.5px] tabular-nums" style={{ color: SUBINK, marginTop: 3 }} title={tf.file}>
        {middleTruncate(tf.file)}
      </div>
      <button
        type="button"
        data-testid={`template-download-${tf.key}`}
        className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: SUBINK }}
        aria-label={`Download ${tf.label} template`}
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

const TEMPLATES: TemplateFile[] = [
  { key: 'jacket', label: 'Jacket', file: 'MRP-12in-jacket-template.pdf' },
  { key: 'labels', label: 'Center labels', file: 'MRP-label-3.94in.pdf' },
  { key: 'inner', label: 'Inner sleeve', file: 'MRP-inner-sleeve-template.pdf' },
];

// ─── Segmented control for run quantity (canon segmented control) ────
// In the real app these come from the press's priced runs in their catalog —
// only run sizes the press actually offers appear. MRP prices six.
const RUN_OPTIONS = [100, 300, 500, 1000, 2000, 3000] as const;

function RunControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full p-1" style={{ backgroundColor: TRACK }} data-testid="control-run">
      {RUN_OPTIONS.map((q) => {
        const active = q === value;
        return (
          <button
            key={q}
            type="button"
            onClick={() => onChange(q)}
            aria-pressed={active}
            data-testid={`run-${q}`}
            className="rounded-full transition-all focus:outline-none tabular-nums"
            style={{
              padding: '7px 13px',
              fontSize: 13,
              fontWeight: 600,
              color: active ? INK : SUBINK,
              backgroundColor: active ? CARD : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
            }}
          >
            {q.toLocaleString('en-US')}
          </button>
        );
      })}
    </div>
  );
}

// Retail price stepper — a quiet inline control the artist can nudge.
function RetailControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label
      className="inline-flex items-center h-11 rounded-xl transition-shadow focus-within:ring-1 focus-within:ring-slate-300"
      style={{ border: `1px solid ${HAIRLINE}`, background: CARD, cursor: 'text', padding: '0 14px' }}
      data-testid="retail-field"
    >
      <span className="text-[16px] font-semibold" style={{ color: FAINT, marginRight: 2 }}>$</span>
      <input
        value={value.toFixed(2)}
        onChange={(e) => {
          const n = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
          onChange(Number.isFinite(n) ? n : 0);
        }}
        inputMode="decimal"
        data-testid="input-retail"
        className="text-[16px] font-semibold tabular-nums focus:outline-none"
        style={{ color: INK, background: 'transparent', border: 'none', width: '5ch', padding: 0 }}
      />
    </label>
  );
}

// ─── Main page ───────────────────────────────────────────────────────
export function PressAlbumPackageBuilder() {
  // Theme-aware: default light (unchanged render). Reassign the active-theme
  // token bindings synchronously before any child renders this pass.
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  applyTheme(mode);
  const narrow = useNarrow(1080);

  // Album context (editable in the conversational setup)
  const [albumTitle, setAlbumTitle] = useState('CALIFORNIALAND');
  const [artistName, setArtistName] = useState('Niina Soleil');
  const [trackCount, setTrackCount] = useState('12');

  // Package choices — seeded to the canon's approved state:
  //   12" LP · Translucent · T01 Ruby
  const [sizeId, setSizeId] = useState<ProductTypeId>('lp12');
  const [typeId, setTypeId] = useState<SwatchKind>('translucent');
  const [colorSel, setColorSel] = useState<Record<string, string>>({ translucent: 'T01' });

  // Pricing & earnings
  const [retail, setRetail] = useState(35.0);
  const [runQty, setRunQty] = useState(1000);

  // Add-ons
  const [gooddeedOn, setGooddeedOn] = useState(true);

  // One quiet save model
  const [dirty, setDirty] = useState(false);
  const [shared, setShared] = useState(false);
  const markDirty = () => setDirty(true);

  const product = useMemo(() => PRODUCT_TYPES.find((p) => p.id === sizeId) ?? PRODUCT_TYPES[1], [sizeId]);
  const activeType = useMemo(() => VINYL_TYPES.find((t) => t.id === typeId) ?? VINYL_TYPES[0], [typeId]);
  const selectedColor = useMemo(
    () => activeType.colors.find((c) => c.id === colorSel[activeType.id]) ?? activeType.colors[0],
    [activeType, colorSel],
  );
  const previewSwatch = selectedColor ?? activeType.swatch;

  // ── The earnings math — honest and legible ─────────────────────────
  // Per-unit finished-package cost the press quotes, by type + size. This is
  // what turns the retail price into a profit-per-unit the artist can feel.
  const packageCost = useMemo(() => {
    const byType: Record<SwatchKind, number> = { black: 11.9, opaque: 13.1, translucent: 14.3, splatter: 16.6 };
    const sizeMult = product.id === 'single7' ? 0.72 : product.id === 'double12' ? 1.48 : 1;
    // Volume discount steps the cost down with the run.
    const volMult =
      runQty >= 3000 ? 0.9 : runQty >= 2000 ? 0.95 : runQty >= 1000 ? 1 : runQty >= 500 ? 1.08 : runQty >= 300 ? 1.28 : 1.6;
    return byType[activeType.id] * sizeMult * volMult;
  }, [activeType.id, product.id, runQty]);

  const profitPerUnit = Math.max(0, retail - packageCost);
  const baseTotal = profitPerUnit * runQty;

  // The cost breakdown — where the package cost goes, per unit.
  const [showCost, setShowCost] = useState(false);
  const costParts = useMemo(() => {
    const tracks = Math.max(1, parseInt(trackCount, 10) || 12);
    const publishing = 0.127 * 2 * tracks; // (vinyl + digital) per track
    const payment = retail * 0.029 + 0.3;
    const goodtunes = 4.5;
    const manufacturing = Math.max(0, packageCost - publishing - payment - goodtunes);
    return [
      { label: 'Manufacturing', value: manufacturing },
      { label: `Publishing · ($0.127 × 2 [vinyl + digital]) × ${tracks} tracks`, value: publishing },
      { label: 'Payment processing', value: payment },
      { label: 'GoodTunes', value: goodtunes },
    ];
  }, [trackCount, retail, packageCost]);

  // GoodDeed: applies to 25% of the run, adds a per-unit collectible premium.
  const [deedRetail, setDeedRetail] = useState(20);
  const [deedMode, setDeedMode] = useState<'nolimit' | 'cap'>('nolimit');
  const [deedCap, setDeedCap] = useState(200);
  // No limit → estimate on the artist's expected take rate; capped → the cap, never more than the run.
  const [deedTake, setDeedTake] = useState(25); // % of vinyl buyers
  const deedUnits = deedMode === 'cap' ? Math.min(deedCap, runQty) : Math.round((runQty * deedTake) / 100);
  // The certificate's own honest math — same shape as the record's.
  const deedMfg = 12; // manufacturing & shipping, printed + sealed + fulfilled
  const deedFee = deedRetail * 0.029 + 0.3; // payment processing
  const deedCost = deedMfg + deedFee;
  const deedPerUnit = Math.max(0, deedRetail - deedCost);
  const deedTotal = gooddeedOn ? deedPerUnit * deedUnits : 0;

  const artistNet = baseTotal + deedTotal;

  // Keep dirty in sync when any decision changes.
  useEffect(() => {
    markDirty();
    setShared(false);
  }, [albumTitle, artistName, trackCount, sizeId, typeId, colorSel, retail, runQty, gooddeedOn, deedRetail, deedMode, deedCap, deedTake]);

  const handleSave = () => setDirty(false);
  const handleShare = () => {
    setShared(true);
    setDirty(false);
  };

  return (
    <>
    <PressShell>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        {/* Page header + quiet save state */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <SectionLabel>Projects · {albumTitle}</SectionLabel>
            <PageHeading lead={`${albumTitle}.`} rest={artistName} />
            <p className="text-[15px]" style={{ color: SUBINK, marginTop: 12, maxWidth: 560, lineHeight: 1.5 }}>
              Size, vinyl, price — set on the artist&rsquo;s behalf. Every choice updates the
              record on the left and their take-home on the right.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0" style={{ marginTop: 24 }}>
            <span className="inline-flex items-center gap-2" data-testid="album-status">
              <span className="inline-block rounded-full" style={{ width: 7, height: 7, backgroundColor: READY }} />
              <span className="text-[12.5px] font-medium" style={{ color: INK }}>At press</span>
            </span>
            <span style={{ color: HAIRLINE }}>·</span>
            <span className="text-[12.5px]" style={{ color: dirty ? SUBINK : FAINT }}>
              {dirty ? 'Edited' : 'All changes saved'}
            </span>
            <Button
              disabled={!dirty}
              onClick={handleSave}
              className="text-white hover:opacity-90 rounded-full disabled:opacity-40"
              style={{ backgroundColor: BLUE, borderColor: BLUE, paddingLeft: 22, paddingRight: 22 }}
              data-testid="button-save"
            >
              <Check className="w-4 h-4" />
              Save
            </Button>
          </div>
        </div>

        <Divider />

        {/* Two-column body — jacket preview left (sticky), decisions right */}
        <div className="grid gap-16" style={{ gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) minmax(0, 620px)' }}>
          {/* LEFT — the record, no card around it */}
          <div
            className="flex flex-col items-center justify-center"
            style={narrow
              ? { minHeight: 560, paddingTop: 24 }
              : { position: 'sticky', top: 24, alignSelf: 'start', minHeight: 560, paddingTop: 24 }}
          >
            <JacketStage swatch={previewSwatch} product={product} cover={californialandCover} />
            <div className="flex flex-col items-center" style={{ transform: `translateX(-${Math.round(300 * (product.inches / 12) * 0.25)}px)` }}>
              <div className="flex items-center gap-2.5 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
                <ColorBall swatch={previewSwatch} size={18} />
                <span>{product.inches}"</span>
                <span style={{ color: '#d1d1d6' }}>·</span>
                <span>{activeType.name}</span>
                <span style={{ color: '#d1d1d6' }}>·</span>
                <span className="font-semibold" style={{ color: INK }}>{previewSwatch.name}</span>
              </div>
              <div className="text-[12.5px] text-center" style={{ marginTop: 10, color: SUBINK, lineHeight: 1.4 }}>
                {product.inches < 12 ? (
                  <>Comes with a <span className="font-semibold" style={{ color: INK }}>printed jacket</span>.</>
                ) : (
                  <>Comes with a <span className="font-semibold" style={{ color: INK }}>printed jacket</span> and{' '}
                  <span className="font-semibold" style={{ color: INK }}>printed inner sleeve</span>.</>
                )}
              </div>
              <div className="flex items-center gap-2" style={{ marginTop: 18 }}>
                <img src={niinaPhoto} alt={artistName} className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-200" />
                <span className="text-[12px]" style={{ color: FAINT }}>
                  Designed for <span className="font-semibold" style={{ color: INK }}>{artistName}</span>
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT — the decisions. Above the sliding jacket, opaque canvas bg. */}
          <div className="min-w-0" style={{ position: 'relative', zIndex: 2, backgroundColor: CANVAS }}>
            {/* The album — conversational setup */}
            <TwoTone lead="The album." rest="What's it called?" />
            <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
              This is what fans will see on the shelf. Tweak it if the artist&rsquo;s details have changed.
            </p>
            <div className="flex items-end gap-3" style={{ marginTop: 14 }}>
              <SetupField label="Album title" value={albumTitle} onChange={setAlbumTitle} wide testId="input-album-title" />
              <SetupField label="Tracks" value={trackCount} onChange={setTrackCount} numeric testId="input-tracks" />
            </div>

            <Divider />

            {/* Pick a size */}
            <TwoTone lead="Pick a size." rest="Prices follow the record." />
            <SizeCards value={sizeId} onChange={setSizeId} />

            <Divider />

            {/* Pick a type */}
            <TwoTone lead="Pick your vinyl." rest="Black, color, or a wild splatter." />
            <TypeCards value={typeId} onChange={setTypeId} />

            <Divider />

            {/* Pick a color */}
            <TwoTone lead="Pick a color." rest="This is the one fans hold." />
            <p className="text-[12.5px]" style={{ marginTop: 6 }}>
              <span className="font-semibold" style={{ color: INK }}>{activeType.name}</span>
              <span style={{ color: FAINT }}> · {activeType.colors.length} colors</span>
            </p>
            <ColorCards
              colors={activeType.colors}
              value={selectedColor?.id ?? ''}
              onChange={(id) => setColorSel((prev) => ({ ...prev, [activeType.id]: id }))}
            />

            <Divider />

            {/* Pricing & earnings — the delightful, honest moment */}
            <TwoTone lead="Set the price." rest="Watch what the artist earns." />
            <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
              Pick a retail price and a run. GoodTunes<sup style={{ fontSize: '0.6em', top: '-0.5em' }}>®</sup> does the math live —
              this is the artist&rsquo;s take-home, before a single record ships.
            </p>

            {/* Retail + run controls */}
            <div className="flex flex-wrap items-end gap-x-10 gap-y-5" style={{ marginTop: 18 }}>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: FAINT, marginBottom: 8 }}>
                  Retail price
                </div>
                <RetailControl value={retail} onChange={setRetail} />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: FAINT, marginBottom: 8 }}>
                  Run quantity
                </div>
                <RunControl value={runQty} onChange={setRunQty} />
              </div>
            </div>

            {/* The earnings receipt */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: `1px solid ${HAIRLINE}`, background: CARD, marginTop: 20 }}
              data-testid="earnings-panel"
            >
              <div style={{ padding: '4px 18px' }}>
                <EarnLine label="Retail price" hint="What fans pay per record" value={money(retail)} />
                <div className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />
                <div className="flex items-baseline justify-between gap-4" style={{ padding: '11px 0 0' }}>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium leading-tight" style={{ color: INK }}>Profit per unit sold</div>
                    <button
                      type="button"
                      onClick={() => setShowCost((v) => !v)}
                      data-testid="button-cost-breakdown"
                      className="flex items-center gap-1 text-[11.5px] transition-colors"
                      style={{ color: FAINT, marginTop: 2 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = SUBINK)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = FAINT)}
                    >
                      After the {money(packageCost)} package cost from {PARTNER_NAME}
                      <ChevronRight
                        className="w-3 h-3 transition-transform"
                        style={{ transform: showCost ? 'rotate(90deg)' : 'none' }}
                      />
                    </button>
                  </div>
                  <div className="tabular-nums flex-shrink-0 text-[14px] font-medium" style={{ color: INK }}>
                    {money(profitPerUnit)}
                  </div>
                </div>
                <div
                  style={{
                    overflow: 'hidden',
                    maxHeight: showCost ? 220 : 0,
                    opacity: showCost ? 1 : 0,
                    transition: 'max-height 0.35s ease, opacity 0.25s ease',
                  }}
                >
                  <div style={{ margin: '8px 0 12px', paddingLeft: 14, borderLeft: `2px solid ${HAIRLINE}` }}>
                    {costParts.map((p) => (
                      <div key={p.label} className="flex items-baseline justify-between gap-4" style={{ padding: '4px 0' }}>
                        <span className="text-[12px]" style={{ color: SUBINK }}>{p.label}</span>
                        <span className="tabular-nums text-[12px]" style={{ color: SUBINK }}>{money(p.value)}</span>
                      </div>
                    ))}
                    <div className="flex items-baseline justify-between gap-4" style={{ padding: '6px 0 2px', borderTop: `1px solid ${HAIRLINE}`, marginTop: 4 }}>
                      <span className="text-[12px] font-semibold" style={{ color: INK }}>
                        Cost per unit <span style={{ color: FAINT, fontWeight: 400 }}>({money(packageCost * runQty)} for the run)</span>
                      </span>
                      <span className="tabular-nums text-[12px] font-semibold" style={{ color: INK }}>{money(packageCost)}</span>
                    </div>
                  </div>
                </div>
                {!showCost && <div style={{ paddingBottom: 11 }} />}
                <div className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />
                <EarnLine
                  label={`Base earnings · ${runQty.toLocaleString('en-US')} units`}
                  value={money(baseTotal)}
                  strong
                />
                {gooddeedOn && (
                  <>
                    <div className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />
                    <div className="flex items-baseline justify-between gap-4" style={{ padding: '11px 0' }}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[13.5px] leading-tight" style={{ color: INK }}>
                          <Award className="w-3.5 h-3.5" style={{ color: BLUE }} />
                          <span className="font-medium">
                            GoodDeed<sup style={{ fontSize: '0.6em', top: '-0.5em' }}>®</sup> certificates
                          </span>
                        </div>
                        <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 2 }}>
                          {deedMode === 'cap' ? 'Capped at' : 'Est.'} {deedUnits.toLocaleString('en-US')} of {runQty.toLocaleString('en-US')} → {money(deedPerUnit)}/unit
                        </div>
                      </div>
                      <div className="tabular-nums flex-shrink-0 text-[14px] font-medium" style={{ color: READY }}>
                        + {money(deedTotal)}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Artist Net — the hero number */}
              <div
                className="flex items-center justify-between"
                style={{ padding: '18px', borderTop: `1px solid ${HAIRLINE}`, background: `linear-gradient(180deg, ${BLUE_TINT_TOP} 0%, ${CARD} 100%)` }}
                data-testid="artist-net"
              >
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: BLUE }}>
                    Artist Net
                  </div>
                  <div className="text-[12px]" style={{ color: SUBINK, marginTop: 3 }}>
                    If the full run sells through
                  </div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums tracking-tight" style={{ fontSize: 38, fontWeight: 600, color: INK, lineHeight: 1 }}>
                    {money(artistNet)}
                  </div>
                </div>
              </div>
            </div>

            <Divider />

            {/* Add-on — the GoodDeed flagship */}
            <TwoTone lead="GoodDeed®." rest="Make it collectible." />
            <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
              Every record includes a free certificate. Add a signed premium tier below.
            </p>

            <div style={{ marginTop: 14 }}>
              <GoodDeedCard
                coverSrc={californialandCover}
                on={gooddeedOn}
                onToggle={() => setGooddeedOn((v) => !v)}
                runQty={runQty}
                deedUnits={deedUnits}
                perUnit={deedPerUnit}
                total={deedPerUnit * deedUnits}
                retail={deedRetail}
                onRetail={setDeedRetail}
                mode={deedMode}
                onMode={setDeedMode}
                cap={deedCap}
                onCap={setDeedCap}
                take={deedTake}
                onTake={setDeedTake}
                mfg={deedMfg}
                fee={deedFee}
                cost={deedCost}
              />
            </div>

            <Divider />

            {/* Print templates — download tiles from the press */}
            <TwoTone lead="Print templates." rest="Everything the artwork team needs." />
            <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
              Sized for this package. Download, share with the artist&rsquo;s design team, and drop the finished files back in.
            </p>
            <div className="grid grid-cols-3 gap-3" style={{ marginTop: 14 }}>
              {TEMPLATES.map((tf) => (
                <TemplateTile key={tf.key} tf={tf} />
              ))}
            </div>

            <Divider />

            {/* Closing — quiet share action */}
            <TwoTone lead="Ready to show it off?" rest="Share the quotes." />
            <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
              Send this exact package and its earnings to {artistName} — one clean link, no login required.
            </p>
            <div className="flex items-center gap-4" style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={handleShare}
                data-testid="button-share-artist"
                className="inline-flex items-center gap-2 text-[13.5px] font-semibold rounded-full px-4 h-10 transition-colors"
                style={{ color: BLUE }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_WASH)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Send className="w-4 h-4" />
                Share with artist
              </button>
              {shared && (
                <span className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: READY }} data-testid="share-confirm">
                  <Check className="w-3.5 h-3.5" />
                  Quote shared with {artistName}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </PressShell>

    {/* Mock-only theme toggle — not part of the product surface */}
    <button
      type="button"
      onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
      className="fixed bottom-4 right-4 z-50 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
      style={{ backgroundColor: CARD, color: INK, border: `1px solid ${HAIRLINE}` }}
      data-testid="button-theme-toggle"
    >
      {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
      {mode === 'light' ? 'View dark' : 'View light'}
    </button>
    </>
  );
}

export default PressAlbumPackageBuilder;
