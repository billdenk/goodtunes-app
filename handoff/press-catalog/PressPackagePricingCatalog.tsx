// PressPackagePricing — a PRESS-facing "Vinyl catalog" pricing editor,
// reimagined around ONE principle: a press quotes a single cost per FINISHED
// PACKAGE per run quantity — never per-component. A package = pressed record +
// jacket + inner sleeve + center labels, one number covers the whole thing.
//
// This is a copy-then-rework of PressVinylColorSetup.tsx (donor, untouched):
// same light press-portal chrome (sidebar, top bar, "POWERED BY GoodTunes"
// footer), same token constants (BLUE/INK/SUBINK/HAIRLINE/CANVAS), same fonts,
// same glossy vinyl disc render kit + hover-spin physics. It replaces the real
// app's confusing per-unit ladder + eye-toggles + scattered spec/audio fields
// with a calm, spreadsheet-familiar package price book:
//   • LEFT — a large glossy vinyl disc that live-previews the selected color
//     group, plus the "what's in a package" contents card and turnaround.
//   • RIGHT — product type segmented control, a color-group rail, and the star
//     of the page: the PACKAGE PRICE BOOK — one clear dollar input per run
//     quantity, with a dead-simple three-way state (Priced / Quote on request /
//     Not offered), no eye-toggle guesswork. Print template files sit tidy and
//     secondary below.
//
// Apple canon: two-tone headlines, hairline dividers, generous whitespace, one
// filled blue "Save catalog" pill, no emojis, real ® character. Self-contained,
// inline mock data — no imports from other mockups, no external UI libs beyond
// the design-system Button/Popover already used by the donor.

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
  Plus,
  RotateCcw,
  Pencil,
  FileText,
  UploadCloud,
  Link2,
  DollarSign,
  HelpCircle,
  MinusCircle,
  Package,
  Disc,
  Square,
  Layers,
  Tag,
  ChevronDown,
  MoreHorizontal,
  Trash2,
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

// ── Per-press label branding (matches donor: black label, white logo always) ──
// The MRP center-label logo is always white-on-black on the pressed disc, in
// both themes — the vinyl product renders identically light or dark.
const PRESS_LABEL_LOGO = mrpLabelLogo;
const PRESS_LABEL_BG = '#0a0a0a';
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';

// ─── Theme-aware brand tokens (Apple calm visual language) ───────────
// Theme-aware: light = the ratified press-portal palette (apple-canon light);
// dark = apple-canon "Dark controls & surfaces" (charcoal, never navy). The
// mock page carries a floating light/dark toggle (mock-only chrome). Light is
// the default so this surface renders exactly as it did before.
//
// These are mutable bindings reassigned by applyTheme() at the top of the
// page render, so the ~40 self-contained sub-components read the active theme
// without threading a prop through every call site.
type Theme = {
  BLUE: string;
  INK: string;
  SUBINK: string;
  FAINT: string;      // #a1a1a6 family — captions, muted icons
  HAIRLINE: string;
  CANVAS: string;
  RAIL: string;
  CARD: string;       // raised card surface (was bg-white / #ffffff)
  CARD_SOFT: string;  // airier card wash (was #fbfbfd)
  TRACK: string;      // segmented-control pill track (was #f0f0f2)
  HEADER_BG: string;  // translucent sticky header
  HOVER_WASH: string; // neutral hover tint (was hover:bg-slate-*)
  BLUE_WASH: string;  // blue text-button hover wash (was #f0f7fc)
  DASHED: string;     // dashed "add" cell border (was #c7c7cc)
  RING: string;       // avatar/search ring (was slate-200)
  CHECK_HALO: string; // selected-swatch check halo behind the tick
  READY: string;
  WARN: string;
  CRITICAL: string;
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
    CARD_SOFT: '#fbfbfd',
    TRACK: '#f0f0f2',
    HEADER_BG: 'rgba(255,255,255,0.72)',
    HOVER_WASH: 'rgba(0,0,0,0.05)',
    BLUE_WASH: '#f0f7fc',
    DASHED: '#c7c7cc',
    RING: '#e2e8f0',
    CHECK_HALO: 'rgba(255,255,255,0.85)',
    READY: '#1c8a5b',
    WARN: '#c98a00',
    CRITICAL: '#e0245e',
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
    CARD_SOFT: '#232326',
    TRACK: '#26262a',
    HEADER_BG: 'rgba(22,22,23,0.72)',
    HOVER_WASH: 'rgba(255,255,255,0.05)',
    BLUE_WASH: 'rgba(49,158,216,0.14)',
    DASHED: 'rgba(255,255,255,0.22)',
    RING: 'rgba(255,255,255,0.14)',
    CHECK_HALO: 'rgba(0,0,0,0.55)',
    READY: '#3fbf62',
    WARN: '#d99a3d',
    CRITICAL: '#f2555a',
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
let CARD_SOFT = THEMES.light.CARD_SOFT;
let TRACK = THEMES.light.TRACK;
let HEADER_BG = THEMES.light.HEADER_BG;
let HOVER_WASH = THEMES.light.HOVER_WASH;
let BLUE_WASH = THEMES.light.BLUE_WASH;
let DASHED = THEMES.light.DASHED;
let RING = THEMES.light.RING;
let CHECK_HALO = THEMES.light.CHECK_HALO;
let READY = THEMES.light.READY;
let WARN = THEMES.light.WARN;
let CRITICAL = THEMES.light.CRITICAL;
let PILL_SHADOW = THEMES.light.PILL_SHADOW;

// True while the dark theme is active — used to flip the GoodTunes wordmark
// (dark asset only) to white via CSS invert on dark surfaces, per apple-canon
// Logos. Light mode renders the wordmark as-is (no filter).
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
  CARD_SOFT = th.CARD_SOFT;
  TRACK = th.TRACK;
  HEADER_BG = th.HEADER_BG;
  HOVER_WASH = th.HOVER_WASH;
  BLUE_WASH = th.BLUE_WASH;
  DASHED = th.DASHED;
  RING = th.RING;
  CHECK_HALO = th.CHECK_HALO;
  READY = th.READY;
  WARN = th.WARN;
  CRITICAL = th.CRITICAL;
  PILL_SHADOW = th.PILL_SHADOW;
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Vinyl layer kit (from donor / SplatterVinylPreview) ─────────────
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
  /** Which record sizes this color is available in (mirrors Add Your Vinyl). */
  sizes?: string[];
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
            <path id="gt-pkg-label-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill="rgba(245,245,247,0.5)" style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#gt-pkg-label-bottom" startOffset="50%" textAnchor="middle">
              MRP-001 · 33 ⅓ RPM
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

// Stacks the sticky two-column body when the viewport gets too narrow for a
// 360px rail + a comfortable price book (avoids horizontal overflow below 1440).
function useNarrow(maxWidth = 1000): boolean {
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

  const spinLoop = useCallback(
    (ts: number) => {
      if (lastTsRef.current !== null) {
        angleRef.current += (ts - lastTsRef.current) * SPIN_DPS;
        apply();
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(spinLoop);
    },
    [apply],
  );

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

const STAGE_PX_PER_INCH = 300 / 12;

function DiscStage({ swatch, product }: { swatch: Swatch; product: ProductType }) {
  const { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind } = useVinylSpin();
  const discPx = Math.round(product.inches * STAGE_PX_PER_INCH);
  const labelRatio = product.labelInches / product.inches;
  const holeRatio = 0.3 / product.inches;
  const isDouble = product.discs > 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', height: 320, display: 'flex', alignItems: 'flex-end' }}>
        {/* Second disc peeking behind for the Double LP */}
        {isDouble && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-38%) rotate(-9deg)',
              transformOrigin: 'bottom center',
              opacity: 0.85,
              filter: 'brightness(0.94)',
            }}
          >
            <VinylDisc size={discPx} swatch={swatch} labelRatio={labelRatio} holeRatio={holeRatio} />
          </div>
        )}
        <div style={{ position: 'relative', display: 'inline-block', transition: 'all 0.35s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <div onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
            <VinylDisc size={discPx} swatch={swatch} bodyRef={bodyRef} labelRatio={labelRatio} holeRatio={holeRatio} />
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: -16,
              left: '50%',
              transform: 'translateX(-50%)',
              width: Math.round(discPx * 0.43),
              height: 12,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.32)',
              filter: 'blur(7px)',
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'absolute', bottom: 6, right: -6, zIndex: 5 }}>
            <RewindButton show={showRewind} onClick={rewind} size={28} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Glossy round color ball
function ColorBall({ swatch, size = 34 }: { swatch: Swatch; size?: number }) {
  const isSplatter = swatch.kind === 'splatter';
  if (isSplatter) {
    return (
      <span className="relative block rounded-full overflow-hidden" style={{ width: size, height: size, boxShadow: '0 0 0 1px rgba(15,23,42,0.10)' }}>
        <span className="absolute inset-0 rounded-full" style={{ backgroundColor: swatch.base }} />
        <span className="absolute rounded-full" style={{ width: size * 0.28, height: size * 0.28, top: '18%', left: '20%', backgroundColor: swatch.s1 }} />
        <span className="absolute rounded-full" style={{ width: size * 0.22, height: size * 0.22, top: '52%', left: '54%', backgroundColor: swatch.s2 }} />
        <span className="absolute rounded-full" style={{ width: size * 0.18, height: size * 0.18, top: '30%', left: '60%', backgroundColor: swatch.s3 }} />
        <span className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.45), transparent 55%)' }} />
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

// ─── Color groups (each carries its own package price ladder) ────────
type ColorGroup = {
  id: string;
  name: string;
  blurb: string;
  swatch: Swatch;
  /** Every color the press offers in this group — they ALL share the group's package prices. */
  colors: Swatch[];
};

const COLOR_GROUPS: ColorGroup[] = [
  {
    id: 'black',
    name: 'Black',
    blurb: 'Standard weight',
    swatch: { id: 'g-black', name: 'Classic Black', kind: 'black', base: '#111114' },
    colors: [
      { id: 'blk-1', name: 'Classic Black', kind: 'black', base: '#111114' },
      { id: 'blk-2', name: 'Midnight', kind: 'black', base: '#1a1a22' },
      { id: 'blk-3', name: 'Jet', kind: 'black', base: '#0a0a0c' },
    ],
  },
  {
    id: 'opaque',
    name: 'Opaque',
    blurb: 'Solid color',
    swatch: { id: 'g-opaque', name: 'Oxblood', kind: 'opaque', base: '#5A1620' },
    colors: [
      { id: 'op-1', name: 'Oxblood', kind: 'opaque', base: '#5A1620' },
      { id: 'op-2', name: 'Canary', kind: 'opaque', base: '#EFD34C' },
      { id: 'op-3', name: 'Coral', kind: 'opaque', base: '#E9705F' },
      { id: 'op-4', name: 'Sky', kind: 'opaque', base: '#8FB8DF' },
      { id: 'op-5', name: 'Mint', kind: 'opaque', base: '#9CC5B0' },
      { id: 'op-6', name: 'Purple', kind: 'opaque', base: '#6B4FA1' },
      { id: 'op-7', name: 'Bone White', kind: 'opaque', base: '#EFEBE2' },
      { id: 'op-8', name: 'Royal Blue', kind: 'opaque', base: '#1E3E9E' },
    ],
  },
  {
    id: 'translucent',
    name: 'Translucent',
    blurb: 'See-through tint',
    swatch: { id: 'g-trans', name: 'Cobalt', kind: 'translucent', base: '#2563EB' },
    colors: [
      { id: 'tr-1', name: 'Ruby', kind: 'translucent', base: '#C4373F' },
      { id: 'tr-2', name: 'Clear', kind: 'translucent', base: '#EDEDF0' },
      { id: 'tr-3', name: 'Cobalt', kind: 'translucent', base: '#2563EB' },
      { id: 'tr-4', name: 'Emerald', kind: 'translucent', base: '#2E8B5F' },
      { id: 'tr-5', name: 'Magenta', kind: 'translucent', base: '#B04578' },
      { id: 'tr-6', name: 'Seafoam', kind: 'translucent', base: '#A9D6C6' },
      { id: 'tr-7', name: 'Amber', kind: 'translucent', base: '#D9A94E' },
      { id: 'tr-8', name: 'Tangerine', kind: 'translucent', base: '#D97038' },
      { id: 'tr-9', name: 'Smoke', kind: 'translucent', base: '#9A9AA0' },
      { id: 'tr-10', name: 'Chartreuse', kind: 'translucent', base: '#C6CE4A' },
      { id: 'tr-11', name: 'Bone', kind: 'translucent', base: '#E8E2D2' },
      { id: 'tr-12', name: 'Forest', kind: 'translucent', base: '#4A5D4E' },
    ],
  },
  {
    id: 'splatter',
    name: 'Splatter',
    blurb: 'Multi-color spray',
    swatch: { id: 'g-splat', name: 'Cosmic', kind: 'splatter', base: '#1B3A6B', s1: '#F5F5DC', s2: '#E8C84A', s3: '#E0E0E0' },
    colors: [
      { id: 'sp-1', name: 'Cosmic', kind: 'splatter', base: '#1B3A6B', s1: '#F5F5DC', s2: '#E8C84A', s3: '#E0E0E0' },
      { id: 'sp-2', name: 'Firecracker', kind: 'splatter', base: '#B3262E', s1: '#F2E7C9', s2: '#E8A13C', s3: '#1d1d1f' },
      { id: 'sp-3', name: 'Sea Glass', kind: 'splatter', base: '#CFE8DF', s1: '#2E8B5F', s2: '#2563EB', s3: '#F5F5DC' },
      { id: 'sp-4', name: 'Grape Soda', kind: 'splatter', base: '#5A3D8A', s1: '#E5B8D0', s2: '#EDEDF0', s3: '#2A1E45' },
      { id: 'sp-5', name: 'Sunburst', kind: 'splatter', base: '#E8C84A', s1: '#D97038', s2: '#B3262E', s3: '#F5F5DC' },
    ],
  },
];

// ─── Run quantities + the price book model ───────────────────────────
const RUN_QTYS = [100, 300, 500, 1000, 2000, 3000] as const;
type RunQty = (typeof RUN_QTYS)[number];

type PriceMode = 'priced' | 'quote' | 'off';
type RunCell = { mode: PriceMode; price: string };

// The full price book: colorGroupId -> runQty -> cell. Seeded with realistic
// package prices that step down with volume; colored vinyl carries a premium.
type PriceBook = Record<string, Record<number, RunCell>>;

function seedBook(): PriceBook {
  const rows: Record<string, number[]> = {
    // per-unit finished-package cost at each run qty
    black: [16.0, 12.5, 10.0, 8.25, 7.25, 6.5],
    opaque: [19.0, 14.5, 11.75, 9.75, 8.5, 7.75],
    translucent: [20.0, 15.25, 12.5, 10.25, 9.0, 8.25],
    splatter: [24.0, 18.5, 15.0, 12.75, 11.25, 10.5],
  };
  const book: PriceBook = {};
  for (const g of COLOR_GROUPS) {
    book[g.id] = {};
    const vals = rows[g.id] ?? [];
    RUN_QTYS.forEach((q, i) => {
      const price = vals[i];
      book[g.id][q] = { mode: price != null ? 'priced' : 'off', price: price != null ? price.toFixed(2) : '' };
    });
  }
  // A couple of realistic exceptions so the states read as real:
  book.splatter[100] = { mode: 'quote', price: '' }; // small splatter runs = quote
  book.translucent[3000] = { mode: 'quote', price: '' };
  book.black[100] = { mode: 'off', price: '' }; // press doesn't take 100-unit black runs
  return book;
}

// ─── Shell primitives (Press persona, from donor) ────────────────────
type PressNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  { label: 'Vinyl catalog', icon: Library, active: true },
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

// ─── Product-type segmented control (disc icon per option) ───────────
function ProductTypeControl({ value, onChange }: { value: ProductTypeId; onChange: (v: ProductTypeId) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full p-1" style={{ backgroundColor: TRACK }} data-testid="control-product-type">
      {PRODUCT_TYPES.map((pt) => {
        const active = pt.id === value;
        return (
          <button
            key={pt.id}
            type="button"
            onClick={() => onChange(pt.id)}
            aria-pressed={active}
            data-testid={`producttype-${pt.id}`}
            className="flex items-center gap-2 rounded-full transition-all focus:outline-none"
            style={{
              padding: '8px 18px',
              fontSize: 13.5,
              fontWeight: 600,
              color: active ? INK : SUBINK,
              backgroundColor: active ? CARD : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
            }}
          >
            {pt.discs > 1 ? <Layers className="w-4 h-4" style={{ color: active ? INK : FAINT }} /> : <Disc className="w-4 h-4" style={{ color: active ? INK : FAINT }} />}
            {pt.name}
          </button>
        );
      })}
    </div>
  );
}

// ─── "What's in a package" contents card ─────────────────────────────
const PACKAGE_ITEMS: Array<{ icon: typeof Disc; label: string; sub: string }> = [
  { icon: Disc, label: 'Pressed record', sub: 'Grooved & sleeved' },
  { icon: Square, label: 'Printed jacket', sub: 'Full-color outer' },
  { icon: FileText, label: 'Inner sleeve', sub: 'Printed liner' },
  { icon: Tag, label: 'Center labels', sub: 'A-side & B-side' },
];

function PackageContentsCard({ product }: { product: ProductType }) {
  const items = product.discs > 1 ? [{ icon: Disc, label: `${product.discs} pressed records`, sub: 'Grooved & sleeved' }, ...PACKAGE_ITEMS.slice(1)] : PACKAGE_ITEMS;
  return (
    <div className="rounded-2xl p-5" style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: CARD }}>
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4" style={{ color: BLUE }} />
        <span className="text-[13.5px] font-semibold" style={{ color: INK }}>
          One package. Everything included.
        </span>
      </div>
      <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 4, lineHeight: 1.45 }}>
        Your price covers the finished, shrink-wrapped unit — no per-piece math.
      </p>
      <div className="grid grid-cols-2 gap-2.5" style={{ marginTop: 14 }}>
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.label} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ backgroundColor: CANVAS }}>
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: CARD }}>
                <Icon className="w-4 h-4" style={{ color: SUBINK }} />
              </span>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold truncate" style={{ color: INK }}>
                  {it.label}
                </div>
                <div className="text-[11px] truncate" style={{ color: FAINT }}>
                  {it.sub}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Turnaround field ────────────────────────────────────────────────
function TurnaroundCard({
  min,
  max,
  onMin,
  onMax,
}: {
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl p-5" style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: CARD }}>
      <SectionLabel>Turnaround</SectionLabel>
      <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 4, lineHeight: 1.4 }}>
        Weeks from approved test pressing to ship.
      </p>
      <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
        <input
          value={min}
          onChange={(e) => onMin(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          data-testid="input-turnaround-min"
          className="text-[14px] text-center tabular-nums focus:outline-none focus:border-slate-400 transition-colors"
          style={{ width: 56, height: 40, border: `1px solid ${HAIRLINE}`, borderRadius: 10, color: INK, background: CARD, fontWeight: 600 }}
        />
        <span className="text-[13px]" style={{ color: FAINT }}>
          –
        </span>
        <input
          value={max}
          onChange={(e) => onMax(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          data-testid="input-turnaround-max"
          className="text-[14px] text-center tabular-nums focus:outline-none focus:border-slate-400 transition-colors"
          style={{ width: 56, height: 40, border: `1px solid ${HAIRLINE}`, borderRadius: 10, color: INK, background: CARD, fontWeight: 600 }}
        />
        <span className="text-[13px] font-medium" style={{ color: SUBINK }}>
          weeks
        </span>
      </div>
    </div>
  );
}

// ─── Color-group rail (right column selector) ────────────────────────
function pricedCount(book: PriceBook, groupId: string): number {
  const row = book[groupId] ?? {};
  return RUN_QTYS.filter((q) => row[q]?.mode === 'priced').length;
}

function ColorGroupCard({
  group,
  active,
  count,
  canRemove,
  onSelect,
  onRename,
  onRemove,
}: {
  group: ColorGroup;
  active: boolean;
  count: number;
  canRemove: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={active}
      data-testid={`colorgroup-${group.id}`}
      className="group relative rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 14, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, backgroundColor: CARD }}
    >
      <div
        className="absolute opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        style={{ top: 8, right: 8, zIndex: 2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <GroupEditorPopover
          group={group}
          canRemove={canRemove}
          onSave={onRename}
          onRemove={onRemove}
          trigger={<DotsTrigger label={`Edit ${group.name}`} testId={`group-menu-${group.id}`} />}
        />
      </div>
      <div className="flex justify-center" style={{ marginBottom: 10 }}>
        <VinylDisc size={90} swatch={group.swatch} />
      </div>
      <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {group.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 2, color: FAINT }}>
        {group.colors.length} {group.colors.length === 1 ? 'color' : 'colors'}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 1, color: count === 0 ? '#c2410c' : FAINT }}>
        {count === 0 ? 'No prices yet' : `${count} of ${RUN_QTYS.length} runs priced`}
      </div>
    </div>
  );
}

// ─── Frosted editor popovers (same feel as Add Your Vinyl) ───────────
const FROSTED_PANEL: React.CSSProperties = {
  border: `1px solid ${HAIRLINE}`,
  backgroundColor: 'rgba(255,255,255,0.82)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  boxShadow: '0 20px 48px rgba(0,0,0,0.16)',
};

const FIELD_INPUT: React.CSSProperties = {
  height: 40,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 10,
  padding: '0 12px',
  color: INK,
  background: CARD,
};

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
      {children}
    </label>
  );
}

/** Frosted ··· trigger button, revealed on hover / focus by the parent `.group`. */
function DotsTrigger({ label, testId }: { label: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      data-testid={testId}
      className="inline-flex items-center justify-center rounded-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      style={{
        width: 26,
        height: 26,
        backgroundColor: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${HAIRLINE}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
        color: SUBINK,
      }}
    >
      <MoreHorizontal className="w-4 h-4" />
    </button>
  );
}

/** Rename / delete a color type (group). */
function GroupEditorPopover({
  group,
  canRemove,
  onSave,
  onRemove,
  trigger,
}: {
  group: ColorGroup;
  canRemove: boolean;
  onSave: (name: string) => void;
  onRemove: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);
  useEffect(() => {
    if (open) setName(group.name);
  }, [open, group.name]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-72 p-0 rounded-2xl overflow-hidden" style={FROSTED_PANEL} data-testid={`popover-edit-group-${group.id}`}>
        <div style={{ padding: 18 }}>
          <div className="text-[15px] font-semibold" style={{ color: INK }}>
            Edit type
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <FieldLabel>Type name</FieldLabel>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
              style={FIELD_INPUT}
              data-testid={`input-group-name-${group.id}`}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-1" style={{ padding: '12px 18px', borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            disabled={!canRemove}
            onClick={() => {
              onRemove();
              setOpen(false);
            }}
            className="flex items-center gap-1.5 text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-red-50 disabled:opacity-40"
            style={{ color: '#d02c2c' }}
            data-testid={`button-delete-group-${group.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete type
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              onSave(name.trim());
              setOpen(false);
            }}
            className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors disabled:opacity-40"
            style={{ color: BLUE }}
            data-testid={`button-save-group-${group.id}`}
          >
            Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Color field (picker + hex + chip), size chips — same as Add Your Vinyl ─
const SIZES = ['7"', '10"', '12"'] as const;

function ColorField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer"
          style={{ width: 38, height: 38, border: 'none', padding: 2, borderRadius: 10, background: 'none' }}
          aria-label={`${label} picker`}
          data-testid={`${testId}-picker`}
        />
        <input
          type="text"
          value={value.toUpperCase()}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v);
          }}
          className="font-mono text-[13px] focus:outline-none"
          style={{ width: 100, height: 38, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: '0 12px', color: INK, background: CARD }}
          aria-label={`${label} hex`}
          data-testid={`${testId}-hex`}
        />
        <span className="rounded-lg flex-shrink-0" style={{ width: 26, height: 26, backgroundColor: value, border: `1px solid ${HAIRLINE}` }} />
      </div>
    </div>
  );
}

function SizeChip({ size, active, onToggle }: { size: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      data-testid={`size-${size.replace('"', 'in')}`}
      className="rounded-full transition-colors focus:outline-none tabular-nums"
      style={{
        padding: '8px 18px',
        fontSize: 13.5,
        fontWeight: 600,
        color: active ? CARD : INK,
        backgroundColor: active ? BLUE : CARD,
        border: active ? `1px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
      }}
    >
      {size}
    </button>
  );
}

// ─── Full color editor popover — mirrors Add Your Vinyl's, self-managed open ─
function SwatchEditorPopover({
  kind,
  edit,
  onSave,
  onRemove,
  trigger,
}: {
  kind: SwatchKind;
  edit?: Swatch;
  onSave: (s: Swatch) => void;
  onRemove?: () => void;
  trigger: ReactNode;
}) {
  const isBlack = kind === 'black';
  const isSplatter = kind === 'splatter';
  const defaultBase = isBlack ? '#111114' : isSplatter ? '#1B3A6B' : '#C81E38';

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(edit?.name ?? '');
  const [base, setBase] = useState(edit?.base ?? defaultBase);
  const [s1, setS1] = useState(edit?.s1 ?? '#F5F5DC');
  const [s2, setS2] = useState(edit?.s2 ?? '#E8C84A');
  const [s3, setS3] = useState(edit?.s3 ?? '#E0E0E0');
  const [sizes, setSizes] = useState<string[]>(edit?.sizes ?? ['12"']);
  const [uploaded, setUploaded] = useState(false);

  const canSave = name.trim().length > 0 && sizes.length > 0;
  const toggleSize = (s: string) => setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const seed = () => {
    setName(edit?.name ?? '');
    setBase(edit?.base ?? defaultBase);
    setS1(edit?.s1 ?? '#F5F5DC');
    setS2(edit?.s2 ?? '#E8C84A');
    setS3(edit?.s3 ?? '#E0E0E0');
    setSizes(edit?.sizes ?? ['12"']);
    setUploaded(false);
  };

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: edit?.id ?? `new-${Date.now()}`,
      name: name.trim(),
      kind,
      base: isBlack ? '#111114' : base,
      s1: isSplatter ? s1 : undefined,
      s2: isSplatter ? s2 : undefined,
      s3: isSplatter ? s3 : undefined,
      sizes,
    });
    setOpen(false);
  };

  const previewSwatch: Swatch = {
    id: 'preview',
    name: name || (edit ? edit.name : 'New color'),
    kind,
    base: isBlack ? '#111114' : base,
    s1: isSplatter ? s1 : undefined,
    s2: isSplatter ? s2 : undefined,
    s3: isSplatter ? s3 : undefined,
    sizes,
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (v) seed();
        setOpen(v);
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        avoidCollisions
        collisionPadding={16}
        className="w-[360px] p-0 rounded-2xl overflow-hidden flex flex-col"
        style={{ ...FROSTED_PANEL, boxShadow: '0 24px 56px rgba(0,0,0,0.18)', maxHeight: 'min(640px, calc(100vh - 32px))' }}
        data-testid={edit ? `popover-edit-color-${edit.id}` : 'popover-add-color'}
      >
        {/* Pinned header — two-tone title */}
        <div className="flex items-center gap-3 flex-shrink-0" style={{ padding: '18px 18px 14px 18px' }}>
          <VinylDisc size={44} swatch={previewSwatch} />
          <div>
            <div className="text-[15px] font-semibold tracking-tight" style={{ color: INK }}>
              {edit ? (
                <>
                  Edit color. <span style={{ color: FAINT, fontWeight: 600 }}>{edit.name}.</span>
                </>
              ) : (
                'New color'
              )}
            </div>
            <div className="text-[12px]" style={{ color: SUBINK }}>
              {isBlack ? 'Black is black — just name and size it.' : 'Define, then save to your catalog.'}
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '0 18px 18px 18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel>Color name</FieldLabel>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cosmic Splatter"
                className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
                style={FIELD_INPUT}
                data-testid="input-color-name"
              />
            </div>

            {!isBlack && (
              <div className="rounded-xl" style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: CARD, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ColorField
                  label={kind === 'translucent' ? 'Translucent tint' : isSplatter ? 'Base color' : 'Vinyl color'}
                  value={base}
                  onChange={setBase}
                  testId="color-base"
                />
                {isSplatter && (
                  <>
                    <div style={{ height: 1, background: HAIRLINE }} />
                    <ColorField label="Splatter color 1" value={s1} onChange={setS1} testId="color-s1" />
                    <ColorField label="Splatter color 2" value={s2} onChange={setS2} testId="color-s2" />
                    <ColorField label="Splatter color 3" value={s3} onChange={setS3} testId="color-s3" />
                  </>
                )}
              </div>
            )}

            {/* upload */}
            <button
              type="button"
              onClick={() => setUploaded((v) => !v)}
              data-testid="button-upload-swatch"
              className="w-full rounded-xl flex flex-col items-center justify-center text-center transition-colors focus:outline-none"
              style={{ padding: '16px 12px', border: `1px dashed ${uploaded ? BLUE : DASHED}`, background: uploaded ? BLUE_WASH : CARD }}
            >
              {uploaded ? (
                <>
                  <Check className="w-4 h-4" style={{ color: BLUE }} strokeWidth={2.5} />
                  <span className="text-[12.5px] font-semibold" style={{ color: BLUE, marginTop: 6 }}>
                    swatch-reference.png
                  </span>
                  <span className="text-[11.5px]" style={{ color: SUBINK, marginTop: 1 }}>
                    Uploaded — tap to replace
                  </span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" style={{ color: FAINT }} />
                  <span className="text-[12.5px] font-semibold" style={{ color: INK, marginTop: 6 }}>
                    Upload a swatch
                  </span>
                  <span className="text-[11.5px]" style={{ color: SUBINK, marginTop: 1 }}>
                    PNG or JPG reference
                  </span>
                </>
              )}
            </button>

            {/* sizes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <FieldLabel>Available sizes</FieldLabel>
              <div className="flex items-center gap-2">
                {SIZES.map((s) => (
                  <SizeChip key={s} size={s} active={sizes.includes(s)} onToggle={() => toggleSize(s)} />
                ))}
              </div>
            </div>

            {edit && onRemove && (
              <div style={{ paddingTop: 2 }}>
                <button
                  type="button"
                  onClick={() => {
                    onRemove();
                    setOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-full px-2.5 py-1.5 transition-colors"
                  style={{ color: CRITICAL }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fdeef2')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  data-testid="button-remove-color"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove color
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Pinned footer — the one filled blue pill */}
        <div className="flex items-center justify-end gap-3 flex-shrink-0" style={{ padding: '12px 18px', borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors"
            style={{ color: SUBINK }}
            data-testid="button-color-cancel"
          >
            Cancel
          </button>
          <Button
            size="sm"
            disabled={!canSave}
            onClick={submit}
            className="text-white hover:opacity-90 rounded-full disabled:opacity-40"
            style={{ backgroundColor: BLUE, borderColor: BLUE, paddingLeft: 18, paddingRight: 18 }}
            data-testid="button-save-color"
          >
            {edit ? 'Save' : 'Save color'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Add a new type (color group) — mirrors "More types" on Add Your Vinyl. */
function AddGroupPopover({ onAdd, trigger }: { onAdd: (name: string) => void; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName('');
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className="w-80 p-0 rounded-2xl overflow-hidden" style={FROSTED_PANEL} data-testid="popover-add-group">
        <div style={{ padding: 18 }}>
          <div className="text-[15px] font-semibold" style={{ color: INK }}>
            New color type
          </div>
          <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 2, lineHeight: 1.4 }}>
            Add a type you press that isn&rsquo;t listed. It gets its own package prices.
          </p>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <FieldLabel>Type name</FieldLabel>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="e.g. Glow in the dark"
              className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
              style={FIELD_INPUT}
              data-testid="input-add-group-name"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-1" style={{ padding: '12px 18px', borderTop: `1px solid ${HAIRLINE}` }}>
          <button type="button" onClick={() => setOpen(false)} className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors" style={{ color: SUBINK }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!name.trim()} className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors disabled:opacity-40" style={{ color: BLUE }} data-testid="button-add-group-confirm">
            Add type
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── The mode picker for a single run cell (three-way, no eye-guessing) ─
// Built per-render so the status colors track the active theme.
function modeMeta(): Record<PriceMode, { label: string; hint: string; icon: typeof DollarSign; color: string }> {
  return {
    priced: { label: 'Priced', hint: 'Show artists this package price', icon: DollarSign, color: READY },
    quote: { label: 'Quote on request', hint: 'Artist asks; you reply with a number', icon: HelpCircle, color: WARN },
    off: { label: 'Not offered', hint: 'This run size is hidden from artists', icon: MinusCircle, color: FAINT },
  };
}

function RunModePicker({ mode, onChange }: { mode: PriceMode; onChange: (m: PriceMode) => void }) {
  const [open, setOpen] = useState(false);
  const MODE_META = modeMeta();
  const meta = MODE_META[mode];
  const MetaIcon = meta.icon;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-run-mode"
          className="flex items-center gap-1.5 rounded-full px-2.5 h-7 text-[11.5px] font-semibold transition-colors"
          style={{ border: `1px solid ${HAIRLINE}`, color: meta.color, backgroundColor: CARD }}
        >
          <MetaIcon className="w-3.5 h-3.5" />
          <span>{meta.label}</span>
          <ChevronDown className="w-3 h-3" style={{ color: FAINT }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-64 p-1.5 rounded-2xl" style={{ border: `1px solid ${HAIRLINE}` }} data-testid="menu-run-mode">
        {(Object.keys(MODE_META) as PriceMode[]).map((m) => {
          const mm = MODE_META[m];
          const Icon = mm.icon;
          const on = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
              className="w-full flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors"
              data-testid={`run-mode-${m}`}
            >
              <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: on ? BLUE_WASH : CANVAS }}>
                <Icon className="w-3.5 h-3.5" style={{ color: mm.color }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold" style={{ color: INK }}>
                    {mm.label}
                  </span>
                  {on && <Check className="w-3.5 h-3.5" style={{ color: BLUE }} />}
                </span>
                <span className="block text-[11.5px]" style={{ color: SUBINK, lineHeight: 1.35 }}>
                  {mm.hint}
                </span>
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// ─── One run-quantity card in the price book ─────────────────────────
function formatQty(q: RunQty): string {
  return q.toLocaleString('en-US');
}

function RunCard({
  qty,
  cell,
  onMode,
  onPrice,
}: {
  qty: RunQty;
  cell: RunCell;
  onMode: (m: PriceMode) => void;
  onPrice: (v: string) => void;
}) {
  const meta = modeMeta()[cell.mode];
  const isPriced = cell.mode === 'priced';
  const isOff = cell.mode === 'off';
  return (
    <div
      className="rounded-2xl p-4 transition-colors"
      style={{
        border: isPriced ? `1px solid ${HAIRLINE}` : `1px dashed ${HAIRLINE}`,
        backgroundColor: isOff ? CANVAS : CARD,
        opacity: isOff ? 0.78 : 1,
      }}
      data-testid={`run-card-${qty}`}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[19px] font-bold tabular-nums tracking-tight" style={{ color: INK }}>
            {formatQty(qty)}
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>
            units per run
          </div>
        </div>
        <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: CANVAS }}>
          <meta.icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
        </span>
      </div>

      <div style={{ marginTop: 14, minHeight: 44 }}>
        {isPriced ? (
          <label className="relative flex items-center" data-testid={`price-field-${qty}`}>
            <span className="absolute left-3 text-[15px] font-semibold" style={{ color: FAINT }}>
              $
            </span>
            <input
              value={cell.price}
              onChange={(e) => onPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0.00"
              data-testid={`input-price-${qty}`}
              className="w-full h-11 pl-7 pr-14 rounded-xl text-[17px] font-semibold tabular-nums focus:outline-none focus:border-slate-400 transition-colors"
              style={{ border: `1px solid ${HAIRLINE}`, color: INK, background: CARD }}
            />
            <span className="absolute right-3 text-[11px] font-medium" style={{ color: FAINT }}>
              / unit
            </span>
          </label>
        ) : (
          <div className="h-11 rounded-xl flex items-center px-3 text-[13px]" style={{ border: `1px dashed ${HAIRLINE}`, color: SUBINK, backgroundColor: isOff ? CARD : CANVAS }}>
            {cell.mode === 'quote' ? 'Priced on request' : 'Hidden from artists'}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <RunModePicker mode={cell.mode} onChange={onMode} />
      </div>
    </div>
  );
}

// ─── Print template file row ─────────────────────────────────────────
type TemplateFile = { key: string; label: string; sub: string; file?: string };

function TemplateRow({ tf, onAttach, onRemove }: { tf: TemplateFile; onAttach: () => void; onRemove: () => void }) {
  const has = !!tf.file;
  return (
    <div className="flex items-center gap-3 rounded-xl px-3.5 py-3" style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: CARD }} data-testid={`template-${tf.key}`}>
      <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: CANVAS }}>
        <FileText className="w-4 h-4" style={{ color: has ? BLUE : FAINT }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold" style={{ color: INK }}>
          {tf.label}
        </div>
        {has ? (
          <div className="text-[11.5px] truncate tabular-nums" style={{ color: SUBINK }}>
            {tf.file}
          </div>
        ) : (
          <div className="text-[11.5px]" style={{ color: FAINT }}>
            {tf.sub}
          </div>
        )}
      </div>
      {has ? (
        <button
          type="button"
          onClick={onRemove}
          data-testid={`template-remove-${tf.key}`}
          className="text-[12.5px] font-semibold rounded-full px-3 h-8 transition-colors"
          style={{ color: SUBINK }}
        >
          Replace
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAttach}
            data-testid={`template-upload-${tf.key}`}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-3 h-8 transition-colors"
            style={{ color: BLUE }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_WASH)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Upload
          </button>
          <button
            type="button"
            onClick={onAttach}
            data-testid={`template-link-${tf.key}`}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ color: SUBINK }}
            aria-label="Paste a link"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────
export function PressPackagePricing() {
  // Theme-aware: default light (unchanged render). Reassign the active-theme
  // token bindings synchronously before any child renders this pass.
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  applyTheme(mode);
  const narrow = useNarrow(1000);

  const [productTypeId, setProductTypeId] = useState<ProductTypeId>('lp12');
  const [activeGroupId, setActiveGroupId] = useState<string>('black');
  const [book, setBook] = useState<PriceBook>(() => seedBook());
  const [turnMin, setTurnMin] = useState('12');
  const [turnMax, setTurnMax] = useState('14');
  const [dirty, setDirty] = useState(false);

  const [templates, setTemplates] = useState<TemplateFile[]>([
    { key: 'jacket', label: 'Jacket', sub: 'Outer sleeve print template', file: 'MRP-12in-jacket-template.pdf' },
    { key: 'inner', label: 'Inner sleeve', sub: 'Printed liner template' },
    { key: 'labels', label: 'Center labels', sub: 'A-side & B-side label template', file: 'MRP-label-3.94in.pdf' },
  ]);

  const product = useMemo(() => PRODUCT_TYPES.find((p) => p.id === productTypeId) ?? PRODUCT_TYPES[1], [productTypeId]);
  const [groups, setGroups] = useState<ColorGroup[]>(COLOR_GROUPS);
  const activeGroup = useMemo(() => groups.find((g) => g.id === activeGroupId) ?? groups[0], [groups, activeGroupId]);
  // Remember the picked color per group so flipping between types keeps each pick.
  const [colorSel, setColorSel] = useState<Record<string, string>>({});
  const selectedColor = activeGroup.colors.find((c) => c.id === colorSel[activeGroup.id]) ?? activeGroup.colors[0];
  const previewSwatch = selectedColor ?? activeGroup.swatch;

  const renameGroup = (id: string, name: string) => {
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, name } : g)));
    setDirty(true);
  };
  const removeGroup = (id: string) => {
    setGroups((gs) => {
      const next = gs.filter((g) => g.id !== id);
      if (activeGroupId === id && next.length) setActiveGroupId(next[0].id);
      return next;
    });
    setDirty(true);
  };
  const addGroup = (name: string) => {
    const id = `grp-${Date.now()}`;
    const swatch: Swatch = { id: `${id}-preview`, name, kind: 'opaque', base: '#9a9aa0' };
    setGroups((gs) => [...gs, { id, name, blurb: '', swatch, colors: [] }]);
    setBook((prev) => ({
      ...prev,
      [id]: Object.fromEntries(RUN_QTYS.map((q) => [q, { mode: 'off', price: '' } as RunCell])) as Record<number, RunCell>,
    }));
    setActiveGroupId(id);
    setDirty(true);
  };
  /** Upsert a color from the full editor — replaces an existing swatch or appends a new one. */
  const upsertColor = (groupId: string, s: Swatch) => {
    setGroups((gs) =>
      gs.map((g) => {
        if (g.id !== groupId) return g;
        const exists = g.colors.some((c) => c.id === s.id);
        return { ...g, colors: exists ? g.colors.map((c) => (c.id === s.id ? s : c)) : [...g.colors, s] };
      }),
    );
    setColorSel((prev) => ({ ...prev, [groupId]: s.id }));
    setDirty(true);
  };
  const removeColor = (groupId: string, colorId: string) => {
    setGroups((gs) => gs.map((g) => (g.id === groupId ? { ...g, colors: g.colors.filter((c) => c.id !== colorId) } : g)));
    setDirty(true);
  };
  const row = book[activeGroupId] ?? {};

  const setCell = useCallback((groupId: string, qty: RunQty, patch: Partial<RunCell>) => {
    setBook((prev) => ({
      ...prev,
      [groupId]: {
        ...prev[groupId],
        [qty]: { ...prev[groupId][qty], ...patch },
      },
    }));
    setDirty(true);
  }, []);

  const handleMode = (qty: RunQty, mode: PriceMode) => {
    // Switching to priced with no number seeds a blank input; other modes clear it.
    setCell(activeGroupId, qty, { mode });
  };
  const handlePrice = (qty: RunQty, v: string) => setCell(activeGroupId, qty, { price: v });

  const removeTemplate = (key: string) => {
    setTemplates((prev) => prev.map((t) => (t.key === key ? { ...t, file: undefined } : t)));
    setDirty(true);
  };
  const doAttach = (key: string) => {
    setTemplates((prev) => prev.map((t) => (t.key === key ? { ...t, file: `MRP-${key}-uploaded.pdf` } : t)));
    setDirty(true);
  };

  const activePricedCount = pricedCount(book, activeGroupId);

  const handleSave = () => setDirty(false);

  return (
    <>
    <PressShell>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        {/* Page header + save */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <SectionLabel>Vinyl catalog · Package pricing</SectionLabel>
            <PageHeading lead="One price." rest="The whole record." />
            <p className="text-[15px]" style={{ color: SUBINK, marginTop: 12, maxWidth: 560, lineHeight: 1.5 }}>
              Quote the way you already do — a single cost per finished package, per run size. Record, jacket,
              inner sleeve, and labels are all in it. No per-piece math.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0" style={{ marginTop: 24 }}>
            <div className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: dirty ? WARN : READY }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dirty ? WARN : READY }} />
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </div>
            <Button
              disabled={!dirty}
              onClick={handleSave}
              className="text-white hover:opacity-90 rounded-full disabled:opacity-40"
              style={{ backgroundColor: BLUE, borderColor: BLUE, paddingLeft: 22, paddingRight: 22 }}
              data-testid="button-save-catalog"
            >
              <Check className="w-4 h-4" />
              Save catalog
            </Button>
          </div>
        </div>

        {/* Product type control */}
        <div style={{ marginTop: 28 }}>
          <SectionLabel>Product type</SectionLabel>
          <div className="flex items-center gap-4" style={{ marginTop: 10 }}>
            <ProductTypeControl value={productTypeId} onChange={setProductTypeId} />
            <span className="text-[12.5px]" style={{ color: FAINT }}>
              {product.format}
            </span>
          </div>
        </div>

        <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

        {/* Two-column body */}
        <div className="grid gap-8" style={{ gridTemplateColumns: narrow ? '1fr' : '360px 1fr' }}>
          {/* LEFT — disc preview + package contents + turnaround */}
          <div className="flex flex-col gap-5" style={narrow ? undefined : { position: 'sticky', top: 24, alignSelf: 'start' }}>
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: CARD }}>
              <div className="flex items-center justify-center px-6 pt-8 pb-6" style={{ background: `linear-gradient(180deg, ${CARD_SOFT} 0%, ${CARD} 100%)` }}>
                <DiscStage swatch={previewSwatch} product={product} />
              </div>
              <div className="px-5 py-4 flex items-center gap-3" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                <ColorBall swatch={previewSwatch} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate" style={{ color: INK }}>
                    {selectedColor.name} · {activeGroup.name} · {product.name}
                  </div>
                </div>
              </div>
            </div>

            <PackageContentsCard product={product} />
            <TurnaroundCard min={turnMin} max={turnMax} onMin={(v) => { setTurnMin(v); setDirty(true); }} onMax={(v) => { setTurnMax(v); setDirty(true); }} />
          </div>

          {/* RIGHT — color groups + price book + templates */}
          <div className="min-w-0">
            {/* Pick a type */}
            <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
              <span style={{ color: INK }}>Pick a type. </span>
              <span style={{ color: FAINT }}>Each keeps its own package prices.</span>
            </h2>
            <div className="grid grid-cols-4 gap-3" style={{ marginTop: 12 }}>
              {groups.map((g) => (
                <ColorGroupCard
                  key={g.id}
                  group={g}
                  active={g.id === activeGroupId}
                  count={pricedCount(book, g.id)}
                  canRemove={groups.length > 1}
                  onSelect={() => setActiveGroupId(g.id)}
                  onRename={(name) => renameGroup(g.id, name)}
                  onRemove={() => removeGroup(g.id)}
                />
              ))}
            </div>
            <AddGroupPopover
              onAdd={addGroup}
              trigger={
                <button
                  type="button"
                  data-testid="button-add-colorgroup"
                  className="flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-3 h-8 transition-colors"
                  style={{ color: BLUE, marginTop: 10 }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_WASH)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Plus className="w-3.5 h-3.5" />
                  More types
                </button>
              }
            />

            <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

            {/* Pick a color */}
            <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
              <span style={{ color: INK }}>Pick a color. </span>
              <span style={{ color: FAINT }}>Or add a new one.</span>
            </h2>
            <p className="text-[12.5px]" style={{ marginTop: 6 }}>
              <span className="font-semibold" style={{ color: INK }}>{activeGroup.name}</span>
              <span style={{ color: FAINT }}> · {activeGroup.colors.length} colors</span>
            </p>
            <div className="grid grid-cols-4 gap-3" style={{ marginTop: 12 }}>
              {activeGroup.colors.map((c) => {
                const on = c.id === selectedColor?.id;
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setColorSel((prev) => ({ ...prev, [activeGroup.id]: c.id }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setColorSel((prev) => ({ ...prev, [activeGroup.id]: c.id }));
                      }
                    }}
                    aria-pressed={on}
                    data-testid={`color-${c.id}`}
                    className="group relative rounded-2xl text-center transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
                    style={{ padding: '16px 10px 12px', border: on ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, backgroundColor: CARD }}
                  >
                    <div
                      className="absolute opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                      style={{ top: 6, right: 6, zIndex: 2 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SwatchEditorPopover
                        kind={c.kind}
                        edit={c}
                        onSave={(s) => upsertColor(activeGroup.id, s)}
                        onRemove={() => removeColor(activeGroup.id, c.id)}
                        trigger={<DotsTrigger label={`Edit ${c.name}`} testId={`color-menu-${c.id}`} />}
                      />
                    </div>
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
                  </div>
                );
              })}
              <SwatchEditorPopover
                kind={activeGroup.colors[0]?.kind ?? activeGroup.swatch.kind}
                onSave={(s) => upsertColor(activeGroup.id, s)}
                trigger={
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="button-add-color"
                    className="rounded-2xl text-center transition-all hover:-translate-y-px focus:outline-none cursor-pointer flex flex-col items-center justify-center"
                    style={{ padding: '16px 10px 12px', border: `1.5px dashed ${DASHED}`, minHeight: 104 }}
                  >
                    <span className="flex items-center justify-center rounded-full" style={{ width: 32, height: 32, border: `1.5px solid ${BLUE}` }}>
                      <Plus className="w-4 h-4" style={{ color: BLUE }} />
                    </span>
                    <span className="text-[12.5px] font-semibold" style={{ color: INK, marginTop: 8 }}>
                      Add color
                    </span>
                  </div>
                }
              />
            </div>

            <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

            {/* Price book */}
            <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
              <span style={{ color: INK }}>Name your price. </span>
              <span style={{ color: FAINT }}>Per package, per run.</span>
            </h2>
            <p className="text-[12.5px]" style={{ marginTop: 6 }}>
              <span className="font-semibold" style={{ color: INK }}>{activeGroup.name}</span>
              <span style={{ color: FAINT }}>
                {activeGroup.colors.length > 0
                  ? ` · one price covers all ${activeGroup.colors.length} colors`
                  : ' · add colors in the step above'}
              </span>
            </p>

            <div className="grid grid-cols-3 gap-3" style={{ marginTop: 18 }}>
              {RUN_QTYS.map((q) => (
                <RunCard key={q} qty={q} cell={row[q] ?? { mode: 'off', price: '' }} onMode={(m) => handleMode(q, m)} onPrice={(v) => handlePrice(q, v)} />
              ))}
            </div>

            <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

            {/* Print templates (secondary) */}
            <SectionLabel>Print templates</SectionLabel>
            <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 4, lineHeight: 1.4 }}>
              Your artwork specs for artists — attach a file or paste a link. Optional and quiet.
            </p>
            <div className="flex flex-col gap-2.5" style={{ marginTop: 12 }}>
              {templates.map((tf) => (
                <TemplateRow key={tf.key} tf={tf} onAttach={() => doAttach(tf.key)} onRemove={() => removeTemplate(tf.key)} />
              ))}
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

export default PressPackagePricing;
