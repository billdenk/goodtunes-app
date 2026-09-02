// ArtistReleaseDraftBuilder — the FULL Build-a-Quote builder, pixel-perfect
// from PressQuoteBuilder (no drift — Bill, Aug 13 2026), wearing the GoodTunes
// ARTIST shell instead of Memphis's press shell. This is the page an artist's
// "Continue draft" lands on inside a Vinyl draft of CALIFORNIALAND.
//
// Differences from the press donor — ONLY these:
//   • Shell: GoodTunes artist portal (Niina Soleil header, artist rail with
//     Releases active) instead of the Memphis header + press rail.
//   • Breadcrumb / identity: Releases › CALIFORNIALAND › Vinyl draft, with
//     "Saved just now" + drafts switcher (auto-save — no Save button).
//   • Pricing: Memphis hasn't returned confirmed pricing, so every money
//     surface reads "$ —" (never $0.00). Math stays wired for when it lands.
//   • Bottom: no client picker / "Save quote" — the draft auto-saves; the
//     closing action takes the artist to the templates page filtered to just
//     the templates THIS draft needs (download → create art → upload).
//
// Everything else — sections, stages, tiles, geometry, gating — is copied
// verbatim from PressQuoteBuilder. If that file changes, re-sync this one.

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  UserPlus,
  Search,
  LayoutDashboard,
  Disc3,
  Users,
  Library,
  Gift,
  Settings as Cog,
  User,
  Activity,
  Megaphone,
  ShoppingBag,
  UserCheck,
  Store,
  BarChart3,
  ChevronRight,
  ArrowRight,
  Bell,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  RotateCcw,
  Eye,
  EyeOff,
  Check,
  ChevronDown,
  Plus,
  X,
} from 'lucide-react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate } from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.png';
import mrpLabelLogo from '../assets/mrp-logo.svg';
import niinaPhoto from '../assets/niina-soleil.webp';

// ── Per-press label branding ─────────────────────────────────────────
const PRESS_LABEL_LOGO = mrpLabelLogo;
const PRESS_LABEL_BG = '#0a0a0a';
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';
const PRESS_STICKER_LOGO = mrpLabelLogo;

// ─── Brand tokens (Apple calm visual language) ──────────────────────
const BLUE = '#319ED8';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = '#e6e6ea';
const CANVAS = '#f5f5f7';
const RAIL = '#f5f5f7';
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Vinyl layer kit (from SplatterVinylPreview) ─────────────────────
const LAYERS = {
  opaque: '/__mockup/vinyl-layers/opaque-vinyl.png',
  translucent: '/__mockup/vinyl-layers/translucent-vinyl.png',
  splatter1: '/__mockup/vinyl-layers/splatter-one.png',
  splatter2: '/__mockup/vinyl-layers/splatter-two.png',
  splatter3: '/__mockup/vinyl-layers/splatter-three.png',
  highlights: '/__mockup/vinyl-layers/vinyl-highlights.png',
  inner: '/__mockup/vinyl-layers/inner-circle.png',
};

// ─── A single CSS-masked color layer ─────────────────────────────────
function MaskLayer({
  color,
  mask,
  opacity = 1,
  maskSize = '102% 102%',
}: {
  color: string;
  mask: string;
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

// ─── JS-driven hover-spin physics (from PressCatalogVinylLabels) ─────
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
        background: 'rgba(255,255,255,0.72)',
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

// ═══════════════════════════════════════════════════════════════════
// SECTION 1 — VINYL (from PressVinylColorSetup)
// ═══════════════════════════════════════════════════════════════════
type SwatchKind = 'black' | 'opaque' | 'translucent' | 'splatter';
type SizeId = '7' | '10' | '12';

type Swatch = {
  id: string;
  name: string;
  kind: SwatchKind;
  base: string;
  s1?: string;
  s2?: string;
  s3?: string;
  sizes: SizeId[];
};

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
            <path id="quote-disc-arc-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill="rgba(245,245,247,0.5)" style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#quote-disc-arc-bottom" startOffset="50%" textAnchor="middle">
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
  labelRatio,
  bodyRef,
}: {
  size: number;
  swatch: Swatch;
  labelRatio?: number;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const LABEL_RATIO = labelRatio ?? 368 / 1104;
  const INNER_RATIO = 129 / 1104;
  const holeRatio = 0.018;
  const translucent = swatch.kind === 'translucent';
  const isSplatter = swatch.kind === 'splatter';

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
      {/* Rotating record body */}
      <div ref={bodyRef} style={{ position: 'absolute', inset: 0, borderRadius: '50%', willChange: bodyRef ? 'transform' : undefined }}>
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

// Small solid color dot (caption affordance from PressVinylColorSetup).
function ColorBall({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="relative block rounded-full"
      style={{ width: size, height: size, flexShrink: 0, boxShadow: '0 0 0 1px rgba(15,23,42,0.10)' }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${color} 70%)`, opacity: 0.94 }}
      />
    </span>
  );
}

// Left preview stage — spinning disc, proportional to the record size.
const DISC_PX_PER_INCH = 300 / 12;

function DiscStage({ swatch, sizeId }: { swatch: Swatch; sizeId: SizeId }) {
  const inches = sizeId === '7' ? 7 : sizeId === '10' ? 10 : 12;
  const discSize = Math.round(inches * DISC_PX_PER_INCH);
  const labelRatio = sizeId === '7' ? 3.3 / 7 : 3.94 / inches;
  const { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind } = useVinylSpin();
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', height: 300, display: 'flex', alignItems: 'flex-end' }}>
        <div onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} style={{ transition: 'all 0.4s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <VinylDisc size={discSize} swatch={swatch} labelRatio={labelRatio} bodyRef={bodyRef} />
        </div>
        <div
          style={{
            position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)',
            width: Math.round(discSize * 0.52), height: 14, borderRadius: '50%',
            background: 'rgba(0,0,0,0.24)', filter: 'blur(8px)', pointerEvents: 'none', zIndex: 0,
          }}
        />
        <div style={{ position: 'absolute', bottom: 4, right: -8, zIndex: 5 }}>
          <RewindButton show={showRewind} onClick={rewind} size={28} />
        </div>
      </div>
    </div>
  );
}

// ─── Record sizes (shared across every section) ──────────────────────
const VINYL_SIZES = [
  { id: '7' as SizeId,  label: '7"',  note: 'Single' },
  { id: '10' as SizeId, label: '10"', note: 'EP' },
  { id: '12' as SizeId, label: '12"', note: 'LP · Standard' },
];

// Press-run quantities + discount curve (from PressCatalogPricing).
const QUANTITIES = [100, 300, 500, 1000, 2000, 3000];

function qtyScale(qty: number): number {
  return qty <= 100 ? 1.0 : qty <= 300 ? 0.88 : qty <= 500 ? 0.80 : qty <= 1000 ? 0.70 : qty <= 2000 ? 0.62 : 0.55;
}

const VINYL_WEIGHTS = [
  { id: '140', label: '140g', note: 'Standard' },
  { id: '180', label: '180g', note: 'Heavyweight' },
];

// ─── Catalog colors (from PressVinylColorSetup INITIAL_CATEGORIES) ───
type QuoteSwatch = Swatch & { price: number; kindNote: string };

const qsw = (id: string, name: string, kind: SwatchKind, kindNote: string, base: string, price: number, extra?: Partial<Swatch>): QuoteSwatch => ({
  id, name, kind, kindNote, base, price, sizes: ['7', '10', '12'], ...extra,
});

const CATALOG_COLORS: QuoteSwatch[] = [
  qsw('BK1', 'Classic Black', 'black', 'Black', '#111114', 1.80),
  qsw('T01', 'Ruby',   'translucent', 'Translucent', '#C81E38', 2.60),
  qsw('T02', 'Clear',  'translucent', 'Translucent', '#E8ECEF', 2.40),
  qsw('T03', 'Cobalt', 'translucent', 'Translucent', '#2563EB', 2.60),
  qsw('OP1', 'Bone White', 'opaque', 'Opaque', '#EDE9DF', 2.40),
  qsw('OP3', 'Sea Blue',   'opaque', 'Opaque', '#2B6DA8', 2.40),
  qsw('SP1', 'Cosmic',  'splatter', 'Splatter', '#1B3A6B', 3.20, { s1: '#F5F5DC', s2: '#E8C84A', s3: '#E0E0E0', sizes: ['10', '12'] }),
  qsw('SP2', 'Classic', 'splatter', 'Splatter', '#C81E38', 3.20, { s1: '#F5F5DC', s2: '#1A1A2E', s3: '#E8C84A', sizes: ['10', '12'] }),
  qsw('SP3', 'Forest Mist',   'splatter', 'Splatter', '#3E5E4A', 3.20, { s1: '#DDE5DC', s2: '#8FA98F', s3: '#F0F0EA', sizes: ['10', '12'] }),
  qsw('SP4', 'Blue Flame',    'splatter', 'Splatter', '#1E4FA3', 3.20, { s1: '#E8ECEF', s2: '#8FB4E8', s3: '#F5F5DC', sizes: ['10', '12'] }),
  qsw('SP5', 'Midnight Gold', 'splatter', 'Splatter', '#141418', 3.20, { s1: '#E8C84A', s2: '#B7942E', s3: '#F0E6C8', sizes: ['10', '12'] }),
];

// Vinyl types — donor "Pick a type. What kind of vinyl?" cards.
const COLOR_TYPES: { id: SwatchKind; name: string }[] = [
  { id: 'black', name: 'Black' },
  { id: 'splatter', name: 'Splatter' },
  { id: 'translucent', name: 'Translucent' },
  { id: 'opaque', name: 'Opaque' },
];

// Type card — mini disc + name + color count (mirrors the color-setup type row).
function TypeCard({ name, count, swatch, active, onSelect }: {
  name: string; count: number; swatch: QuoteSwatch; active: boolean; onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`quote-type-${swatch.kind}`}
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 14, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 10 }}>
        <VinylDisc size={64} swatch={swatch} />
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: '#a1a1a6' }}>
        {count} {count === 1 ? 'color' : 'colors'}
      </div>
    </div>
  );
}

// Color card — round color ball + name (mirrors the color-setup color grid).
function ColorBallCard({ swatch, active, onSelect }: { swatch: QuoteSwatch; active: boolean; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`quote-color-${swatch.id}`}
      className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center' }}
    >
      <div className="flex justify-center" style={{ marginBottom: 10 }}>
        <ColorBall color={swatch.base} size={40} />
      </div>
      <div className="text-[12.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {swatch.name}
      </div>
    </div>
  );
}

// Swatch card — mini disc + name (mirrors the color-setup swatch grid).
function SwatchCard({ swatch, active, onSelect }: { swatch: QuoteSwatch; active: boolean; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`quote-color-${swatch.id}`}
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 14, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 10 }}>
        <VinylDisc size={64} swatch={swatch} />
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {swatch.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: '#a1a1a6' }}>
        {swatch.kindNote}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 2 — JACKET (from ArtistChooseJacket, verbatim)
// ═══════════════════════════════════════════════════════════════════
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
    { id: 'single',   name: 'Single Jacket',   note: 'Standard printed jacket. Artist supplies artwork.', gatefoldPanels: 0, printed: true, variants: [
      { id: 'nospine', label: 'No Spine',  note: 'Flat pocket — the classic 45 sleeve.' },
      { id: 'spine3',  label: '3mm Spine', note: 'Adds a slim printable spine.' },
    ] },
    { id: 'gatefold', name: 'Gatefold Jacket', note: 'Two-panel fold-out. Extra interior art space.', gatefoldPanels: 1, printed: true, variants: [V_STANDARD] },
  ],
  '10': [
    { id: 'single',   name: 'Single Jacket',   note: 'Standard printed jacket. Artist supplies artwork.', gatefoldPanels: 0, printed: true, variants: [V_STANDARD, V_WIDESPINE] },
    { id: 'gatefold', name: 'Gatefold Jacket', note: 'Two-panel fold-out. Extra interior art space.',     gatefoldPanels: 1, printed: true, variants: [V_STANDARD] },
  ],
  '12': [
    { id: 'single',   name: 'Single Jacket',            note: 'Standard printed jacket. Artist supplies artwork.', gatefoldPanels: 0, printed: true,  variants: [V_STANDARD, V_WIDESPINE, V_TIPON] },
    { id: 'gatefold', name: 'Gatefold Jacket',          note: 'Two-panel fold-out. Extra interior art space.',     gatefoldPanels: 1, printed: true,  variants: [V_STANDARD, V_TIPON] },
    { id: 'trifold',  name: 'Tri-Fold Gatefold Jacket', note: 'Three-panel fold-out. Maximum interior canvas.',    gatefoldPanels: 2, printed: true,  variants: [V_STANDARD] },
    { id: 'discobag', name: 'Discobag',                 note: 'Plain inner sleeve with die-cut center window.',    gatefoldPanels: 0, printed: false, variants: [V_STANDARD] },
  ],
};

const GATEFOLD_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const JS_BASE = 321;
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

function JacketTile({
  jacket,
  active,
  variantId,
  onSelect,
  onVariantSelect,
}: {
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
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
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
        <div className="text-[12px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.4 }}>
          {jacket.note}
        </div>
        {active && hasVariants && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: '#f2f2f5', border: `1px solid ${HAIRLINE}` }}>
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
                      color: vActive ? INK : '#8e8e93',
                      background: vActive ? '#ffffff' : 'transparent',
                      boxShadow: vActive ? PILL_SHADOW : 'none',
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
              <div className="text-[11.5px]" style={{ marginTop: 8, color: '#a1a1a6', lineHeight: 1.4 }}>
                {selectedVariant.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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
        color: '#a1a1a6',
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
            background: 'rgba(255,255,255,0.72)',
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

// ═══════════════════════════════════════════════════════════════════
// SECTION 3 — INNER SLEEVE (from ArtistChooseInnerSleeve, verbatim)
// ═══════════════════════════════════════════════════════════════════
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

// Full-color print face — conic rainbow + logo (shared by sleeve & inserts).
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

const SS = 321;
const HOLE_RATIO = 0.33;

function SleeveThumbnail({ sleeve, size = 48 }: { sleeve: SleeveLook; size: number }) {
  const isBlack = sleeve.color === 'black';
  const bg      = isBlack ? '#0a0a0a' : '#ffffff';
  const border  = isBlack ? '1.5px solid #333' : `1.5px solid ${HAIRLINE}`;
  const hole    = size * HOLE_RATIO;

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

function SleeveStage({ sleeve }: { sleeve: SleeveLook }) {
  const isBlack = sleeve.color === 'black';
  const bg      = isBlack ? '#0a0a0a' : '#ffffff';
  const border  = isBlack ? `1px solid #222` : `1px solid ${HAIRLINE}`;
  const hole    = SS * HOLE_RATIO;

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

function SleeveTile({
  sleeve,
  active,
  variantId,
  onSelect,
  onVariantSelect,
}: {
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
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <SleeveThumbnail sleeve={sleeveLook(sleeve, variantId)} size={64} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
          {sleeve.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.4 }}>
          {sleeve.note}
        </div>
        {active && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: '#f2f2f5', border: `1px solid ${HAIRLINE}` }}>
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
                      color: vActive ? INK : '#8e8e93',
                      background: vActive ? '#ffffff' : 'transparent',
                      boxShadow: vActive ? PILL_SHADOW : 'none',
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
              <div className="text-[11.5px]" style={{ marginTop: 8, color: '#a1a1a6', lineHeight: 1.4 }}>
                {selectedVariant.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 4 — CENTER LABELS (from PressCatalogVinylLabels, verbatim)
// ═══════════════════════════════════════════════════════════════════
type LabelKind = 'blank' | 'bw' | 'color';

type LabelStyle = {
  id: LabelKind;
  name: string;
  note: string;
};

const LABEL_STYLES: LabelStyle[] = [
  { id: 'color', name: 'Full Color',    note: 'Vibrant full-color label — artists supply the design.' },
  { id: 'bw',    name: 'Black & White', note: 'White label with a single-color black logo print.' },
  { id: 'blank', name: 'Blank',         note: 'Unprinted white label. No artwork required.' },
];

function LabelLogo({ size, whiteFilter = true, offsetRight = false }: { size: number; whiteFilter?: boolean; offsetRight?: boolean }) {
  const showArcText = size >= 70 && !offsetRight;
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
          left: offsetRight ? '13.5%' : '50%',
          transform: 'translate(-50%, -50%)',
          width: size * (offsetRight ? 0.18 : 0.9),
          height: size * (offsetRight ? 0.18 : 0.9),
          objectFit: 'contain',
          filter: whiteFilter ? PRESS_LABEL_LOGO_FILTER : undefined,
        }}
      />
      {showArcText && (
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <path id="quote-lbl-arc-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill={arcTextFill} style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#quote-lbl-arc-bottom" startOffset="50%" textAnchor="middle">
              MRP-001 · 33 ⅓ RPM
            </textPath>
          </text>
        </svg>
      )}
    </div>
  );
}

function CenterLabel({ kind, size, offsetLogo = false }: { kind: LabelKind; size: number; offsetLogo?: boolean }) {
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
          background:
            'radial-gradient(circle at 42% 36%, #ffffff 0%, #f0f0f0 55%, #e8e8e8 100%)',
          boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.08)',
        }}
      />
    );
  }

  if (kind === 'bw') {
    return (
      <div style={{ ...base, background: 'radial-gradient(circle at 42% 36%, #ffffff 0%, #f4f4f4 60%, #ebebeb 100%)', boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.07)' }}>
        {showLogo && <LabelLogo size={size} whiteFilter={false} offsetRight={offsetLogo} />}
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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(60% 60% at 70% 74%, rgba(255,210,74,0.55), rgba(255,210,74,0) 62%)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(55% 55% at 30% 26%, rgba(120,150,255,0.55), rgba(120,150,255,0) 60%)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: offsetLogo
            ? 'radial-gradient(20% 20% at 13.5% 50%, rgba(0,0,0,0.52), rgba(0,0,0,0) 74%)'
            : 'radial-gradient(46% 46% at 50% 50%, rgba(0,0,0,0.52), rgba(0,0,0,0) 74%)',
        }}
      />
      {showLogo && <LabelLogo size={size} offsetRight={offsetLogo} />}
    </div>
  );
}

function LabelDisc({
  size,
  kind,
  bodyRef,
  holeRatio = 0.025,
  labelRatio,
  offsetLogo = false,
  swatch,
}: {
  size: number;
  kind: LabelKind;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  holeRatio?: number;
  labelRatio?: number;
  offsetLogo?: boolean;
  swatch?: Swatch;
}) {
  const LABEL_RATIO = labelRatio ?? (3.94 / 12);
  const INNER_RATIO = 129 / 1104;
  const labelSize = size * LABEL_RATIO;
  const spin = !!bodyRef;
  const translucent = swatch?.kind === 'translucent';
  const isSplatter = swatch?.kind === 'splatter';

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
        {swatch ? (
          <>
            {translucent ? (
              <MaskLayer color={swatch.base} mask={LAYERS.translucent} opacity={1} />
            ) : (
              <MaskLayer color={swatch.base} mask={LAYERS.opaque} />
            )}
            {isSplatter && (
              <>
                <MaskLayer color={swatch.s1 ?? swatch.base} mask={LAYERS.splatter1} />
                <MaskLayer color={swatch.s2 ?? swatch.base} mask={LAYERS.splatter2} />
              </>
            )}
          </>
        ) : (
          <MaskLayer color="#0b0b0d" mask={LAYERS.opaque} />
        )}

        {spin && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              pointerEvents: 'none',
              mixBlendMode: 'screen',
              opacity: 0.06,
              background:
                'conic-gradient(from 0deg,' +
                'rgba(255,255,255,0) 0deg, rgba(255,255,255,0.9) 24deg, rgba(255,255,255,0) 70deg,' +
                'rgba(255,255,255,0) 150deg, rgba(255,255,255,0.7) 176deg, rgba(255,255,255,0) 220deg,' +
                'rgba(255,255,255,0) 300deg, rgba(255,255,255,0.6) 324deg, rgba(255,255,255,0) 360deg)',
            }}
          />
        )}

        <CenterLabel kind={kind} size={labelSize} offsetLogo={offsetLogo} />

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

function LabelStage({ kind, holeRatio, discSize = 300, labelRatio, offsetLogo = false, swatch }: { kind: LabelKind; holeRatio?: number; discSize?: number; labelRatio?: number; offsetLogo?: boolean; swatch?: Swatch }) {
  const DISC_SIZE = discSize;
  const { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind } = useVinylSpin();
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', height: 300, display: 'flex', alignItems: 'flex-end' }}>
        <div onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} style={{ transition: 'all 0.4s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <LabelDisc size={DISC_SIZE} kind={kind} bodyRef={bodyRef} holeRatio={holeRatio} labelRatio={labelRatio} offsetLogo={offsetLogo} swatch={swatch} />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: -14,
            left: '50%',
            transform: 'translateX(-50%)',
            width: Math.round(DISC_SIZE * 0.52),
            height: 14,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.24)',
            filter: 'blur(8px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div style={{ position: 'absolute', bottom: 4, right: -8, zIndex: 5 }}>
          <RewindButton show={showRewind} onClick={rewind} size={28} />
        </div>
      </div>
    </div>
  );
}

function LabelTile({
  style,
  active,
  onSelect,
  discSize = 96,
  labelRatio,
  holeRatio,
  offsetLogo = false,
}: {
  style: LabelStyle;
  active: boolean;
  onSelect: () => void;
  discSize?: number;
  labelRatio?: number;
  holeRatio?: number;
  offsetLogo?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      aria-pressed={active}
      data-testid={`label-${style.id}`}
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 12 }}>
        <div style={{ width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ transition: 'all 0.35s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
            <LabelDisc size={discSize} kind={style.id} labelRatio={labelRatio} holeRatio={holeRatio} offsetLogo={offsetLogo} />
          </div>
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {style.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.35 }}>
        {style.note}
      </div>
    </div>
  );
}

// Label geometry per record size (from PressCatalogVinylLabels).
const LABEL_SIZE_SPECS: Record<SizeId, { inches: number; labelInches: number }> = {
  '7':  { inches: 7,  labelInches: 3.3 },
  '10': { inches: 10, labelInches: 3.94 },
  '12': { inches: 12, labelInches: 3.94 },
};

const HOLE_OPTIONS = [
  { id: 'small', label: 'Small Hole', note: 'Standard 0.3" spindle — plays anywhere.', holeInches: 0.3 },
  { id: 'large', label: 'Large Hole', note: 'Classic 1.5" jukebox 45 — needs an adapter on home turntables.', holeInches: 1.5 },
];

// ═══════════════════════════════════════════════════════════════════
// SECTION 5 — INSERTS (from ArtistChooseInserts, + None)
// ═══════════════════════════════════════════════════════════════════
type InsertVariant = { id: string; label: string; note: string };

type InsertOption = {
  id: 'none' | 'sheet' | 'gatefold' | 'booklet' | 'poster';
  name: string;
  note: string;
  variants: InsertVariant[];
  sizes?: SizeId[];
};

const INSERT_OPTIONS: InsertOption[] = [
  {
    id: 'none',
    name: 'None',
    note: 'No insert — the record ships without printed extras.',
    variants: [],
  },
  {
    id: 'sheet',
    name: 'Insert Sheet',
    note: 'Full-color flat sheet — lyrics, credits, liner notes. Printed both sides.',
    variants: [],
    sizes: ['10', '12'],
  },
  {
    id: 'gatefold',
    name: 'Gatefold Insert',
    note: 'Two-panel fold-out that opens from the center. Printed both sides.',
    variants: [],
    sizes: ['10', '12'],
  },
  {
    id: 'booklet',
    name: 'Booklet',
    note: 'Stapled multi-page booklet. Room for lyrics, art, and stories.',
    variants: [
      { id: 'p4', label: '4-Page', note: '' },
      { id: 'p8', label: '8-Page', note: '' },
    ],
    sizes: ['10', '12'],
  },
  {
    id: 'poster',
    name: 'Poster',
    note: 'Large fold-out poster that ships inside the jacket.',
    variants: [
      { id: 'small', label: '18" × 24"', note: 'Folds to fit the jacket.' },
      { id: 'large', label: '24" × 36"', note: 'Full wall poster — folds to fit.' },
    ],
    sizes: ['12'],
  },
];

const POSTER_RATIO: Record<'small' | 'large', number> = { small: 18 / 24, large: 24 / 36 };

function InsertThumbnail({ insert, variantId, size = 64 }: { insert: InsertOption; variantId: string; size?: number }) {
  if (insert.id === 'none') {
    return (
      <div style={{
        width: size, height: size, flexShrink: 0,
        border: '1.5px dashed #d0d0d5', borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#c7c7cc', fontSize: 18, fontWeight: 300,
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

function InsertStage({ insert, variantId }: { insert: InsertOption; variantId: string }) {
  if (insert.id === 'none') {
    return (
      <div style={{
        width: SS, height: SS, flexShrink: 0,
        border: '1.5px dashed #d0d0d5', borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        color: '#a1a1a6',
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

function InsertTile({
  insert,
  active,
  variantId,
  onSelect,
  onVariantSelect,
}: {
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
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <InsertThumbnail insert={insert} variantId={variantId} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
          {insert.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.4 }}>
          {insert.note}
        </div>
        {active && insert.variants.length > 0 && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: '#f2f2f5', border: `1px solid ${HAIRLINE}` }}>
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
                      color: vActive ? INK : '#8e8e93',
                      background: vActive ? '#ffffff' : 'transparent',
                      boxShadow: vActive ? PILL_SHADOW : 'none',
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
              <div className="text-[11.5px]" style={{ marginTop: 8, color: '#a1a1a6', lineHeight: 1.4 }}>
                {selectedVariant.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 6 — STICKERS (from PressCatalogStickers, verbatim, + None)
// ═══════════════════════════════════════════════════════════════════
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
            src={PRESS_STICKER_LOGO}
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

const STAGE_PX_PER_INCH = 75;

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
            color: '#a1a1a6',
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
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 12 }}>
        <div style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sticker size={rep} shape={shape} pxPerInch={tilePxPerInch} />
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {shape.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.35 }}>
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
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 12 }}>
        <div style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 64, height: 64,
            border: '1.5px dashed #d0d0d5', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#c7c7cc', fontSize: 18, fontWeight: 300,
          }}>—</div>
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        None
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.35 }}>
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
      className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
      style={{ padding: '14px 10px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
    >
      <div className="text-[15px] font-semibold" style={{ color: active ? BLUE : INK }}>{size.name}</div>
      <div className="text-[11px]" style={{ marginTop: 2, color: '#a1a1a6' }}>
        {round ? 'Circle' : size.wIn === size.hIn ? 'Square' : 'Rectangle'}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHELL (from the donor screens, verbatim)
// ═══════════════════════════════════════════════════════════════════
type PressNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

// Artist rail — "Releases" is the active surface (matches the other artist mocks).
const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'People', icon: User },
  { label: 'Releases', icon: Disc3, active: true },
  { label: 'Overview', icon: Activity },
  { label: 'Audience', icon: Users },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Referrals', icon: UserPlus },
  { label: 'Shopify', icon: Store },
  { label: 'Reports', icon: BarChart3 },
];

function NavRow({ label, icon: Icon, active }: PressNavItem) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
        !active && 'hover:bg-slate-200',
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        backgroundColor: active ? '#ffffff' : undefined,
        boxShadow: active ? PILL_SHADOW : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : '#a1a1a6' }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

type CatalogChild = { label: string; icon: typeof LayoutDashboard; soon?: boolean; active?: boolean };
const CATALOG_CHILDREN: CatalogChild[] = [
  { label: 'GoodTunes Packages', icon: NavPackage, active: true },
  { label: 'White Label', icon: NavLayers, soon: true },
  { label: 'GoodDeed Certificates', icon: NavAward },
  { label: 'Specs', icon: NavWave, soon: true },
  { label: 'Templates', icon: NavTemplate, soon: true },
];

function CatalogGroup({ item }: { item: PressNavItem }) {
  return (
    <>
      <button
        type="button"
        className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors hover:bg-slate-200"
        style={{ fontWeight: 500, color: SUBINK }}
      >
        <NavChevron className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
        <span className="truncate flex-1 text-left">{item.label}</span>
      </button>
      <div className="space-y-0.5">
        {CATALOG_CHILDREN.map(({ label, icon: Icon, soon, active }) => (
          <a
            key={label}
            href="#"
            onClick={(e) => e.preventDefault()}
            className={`flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors ${active ? '' : 'hover:bg-slate-200'}`}
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? INK : SUBINK,
              backgroundColor: active ? '#ffffff' : undefined,
              boxShadow: active ? PILL_SHADOW : undefined,
            }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : '#a1a1a6' }} />
            <span className="truncate flex-1">{label}</span>
            {soon && (
              <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: SUBINK }}>
                Request
              </span>
            )}
          </a>
        ))}
      </div>
    </>
  );
}

const PARTNER_NAME = 'Memphis Record Pressing';
const USER_FIRST_NAME = 'Niina';
const USER_EMAIL = 'niina@niinasoleil.com';
const USER_INITIALS = 'NS';

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
          <img src={niinaPhoto} alt={USER_INITIALS} className="w-full h-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0 rounded-2xl"
        style={{ border: `1px solid ${HAIRLINE}` }}
        data-testid="menu-user"
      >
        <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="text-[13.5px] font-semibold" style={{ color: INK }}>{USER_FIRST_NAME}</div>
          <div className="text-[11.5px] truncate" style={{ color: SUBINK }}>{USER_EMAIL}</div>
        </div>
        <div className="py-1.5">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-slate-50 transition-colors"
                style={{ color: INK }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1.5" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-slate-50 transition-colors"
            style={{ color: INK }}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
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
          backgroundColor: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={niinaPhoto}
            alt="Niina Soleil"
            className="h-9 w-9 rounded-full object-cover flex-shrink-0 ring-1 ring-black/10"
          />
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            Niina Soleil
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full"
            style={{ color: SUBINK, paddingLeft: 12, paddingRight: 12 }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-slate-100"
            style={{ color: SUBINK }}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside
          className="w-60 flex-shrink-0 flex flex-col"
          style={{ backgroundColor: RAIL, borderRight: `1px solid ${HAIRLINE}` }}
        >
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: '#a1a1a6' }} />
              <input
                className="w-full h-9 pl-8 pr-2 rounded-full bg-white text-[12.5px] placeholder:text-slate-400 focus:outline-none"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK }}
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
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: '#a1a1a6' }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" />
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
      <span style={{ color: '#a1a1a6', fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

function StepHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 600 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: '#a1a1a6' }}>{rest}</span>
    </h2>
  );
}

// Section heading — the donor screens' PageHeading scale, reused per section.
function SectionHeading({ lead, rest, sub }: { lead: string; rest: string; sub: string }) {
  return (
    <div className="min-w-0">
      <h2 className="tracking-tight" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.08 }}>
        <span style={{ color: INK }}>{lead} </span>
        <span style={{ color: '#a1a1a6', fontWeight: 600 }}>{rest}</span>
      </h2>
      <p style={{ fontSize: 15, marginTop: 8, maxWidth: 560, color: SUBINK }}>
        {sub}
      </p>
    </div>
  );
}

// Progressive-step order — Apple buy-flow style. 'hole' only applies to 7".
type StepKey = 'size' | 'qty' | 'weight' | 'ctype' | 'color' | 'jacket' | 'sleeve' | 'hole' | 'label' | 'insert' | 'sticker';
const STEP_ORDER: StepKey[] = ['size', 'qty', 'weight', 'ctype', 'color', 'jacket', 'sleeve', 'hole', 'label', 'insert', 'sticker'];

// Locked steps sit at low opacity and ignore clicks until unlocked.
function Gate({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div aria-disabled={!on} style={{ opacity: on ? 1 : 0.35, pointerEvents: on ? 'auto' : 'none', transition: 'opacity 0.4s ease' }}>
      {children}
    </div>
  );
}

// Donor split-grid section: sticky preview left, pickers right.
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

// ─── Clients ──────────────────────────────────────────────────────────
const CLIENTS = ['Alma Rivera', 'The Blue Hours', 'Turnstile Collective', 'June & The Half Moons'];

// Seeded prices (per unit, before the run-size discount on the vinyl itself).
const WEIGHT_UP = { '140': 0, '180': 0.40 } as Record<string, number>;
const LABEL_PRICE = { blank: 0.30, bw: 0.45, color: 0.60 } as Record<LabelKind, number>;
const JACKET_PRICE = { single: 1.80, gatefold: 2.80, trifold: 3.60, discobag: 1.20 } as Record<string, number>;
const SLEEVE_PRICE = { printed: 1.20, unprinted: 0.35, polylined: 0.45 } as Record<string, number>;
const INSERT_PRICE = { none: 0, sheet: 0.65, gatefold: 0.95, booklet: 1.40, poster: 1.60 } as Record<string, number>;
const STICKER_PRICE = { none: 0, rect: 0.30, square: 0.35, circle: 0.45, upc: 0.18 } as Record<string, number>;

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
export function ArtistReleaseDraftBuilder() {
  // ── Shared state — the record size flows through every section ──
  const [sizeId, setSizeId] = useState<SizeId>('12');
  const [qty, setQty] = useState<number>(500);
  const [weightId, setWeightId] = useState<string>('140');
  const [colorId, setColorId] = useState<string>('BK1');
  const [colorKind, setColorKind] = useState<SwatchKind>('black');

  const [jacketId, setJacketId] = useState<string>('single');
  const [jacketVariantId, setJacketVariantId] = useState<string>('standard');

  const [sleeveId, setSleeveId] = useState<string>('printed');
  const [sleeveVariantId, setSleeveVariantId] = useState<string>('board');

  const [labelId, setLabelId] = useState<LabelKind>('bw');
  const [holeId, setHoleId] = useState<string>('small');

  const [insertId, setInsertId] = useState<string>('none');
  const [insertVariantId, setInsertVariantId] = useState<string>('');

  const [stickerShapeId, setStickerShapeId] = useState<StickerShapeId | 'none'>('none');
  const [stickerSizeId, setStickerSizeId] = useState<string>('3x3');

  const [clientName, setClientName] = useState<string>(CLIENTS[0]);
  const [saved, setSaved] = useState(false);

  // Collapse: the type grid folds to a summary row once a color is picked.
  const [typeOpen, setTypeOpen] = useState(true);

  // ── Apple-style progressive steps — each unlocks after the one before ──
  const [done, setDone] = useState<Set<StepKey>>(() => new Set());
  const mark = (k: StepKey) => setDone((p) => (p.has(k) ? p : new Set(p).add(k)));
  const picked = (k: StepKey) => done.has(k);
  const skipStep = (k: StepKey) => k === 'hole' && sizeId !== '7';
  const canDo = (k: StepKey) =>
    STEP_ORDER.slice(0, STEP_ORDER.indexOf(k)).every((s) => skipStep(s) || done.has(s));
  const allDone = STEP_ORDER.every((s) => skipStep(s) || done.has(s));

  // First-time picks glide the page down to the step that just unlocked.
  const goTo = (id: string) => {
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  const advance = (k: StepKey, target: string) => {
    if (!picked(k)) goTo(target);
  };

  // ── Derived options per size ──
  const colors = CATALOG_COLORS.filter((c) => c.sizes.includes(sizeId));
  const color = colors.find((c) => c.id === colorId) ?? colors[0];

  const jacketOptions = JACKET_CATALOG[sizeId] ?? JACKET_CATALOG['12'];
  const jacketType = jacketOptions.find((j) => j.id === jacketId) ?? jacketOptions[0];
  const selectedJacketVariant = jacketType.variants.find((v) => v.id === jacketVariantId) ?? jacketType.variants[0];

  const sleeveType = SLEEVE_OPTIONS.find((s) => s.id === sleeveId) ?? SLEEVE_OPTIONS[0];
  const selectedSleeveVariant = sleeveType.variants.find((v) => v.id === sleeveVariantId);
  const look = sleeveLook(sleeveType, sleeveVariantId);

  const labelStyle = LABEL_STYLES.find((l) => l.id === labelId) ?? LABEL_STYLES[0];
  const is7 = sizeId === '7';
  const hole = is7 ? (HOLE_OPTIONS.find((h) => h.id === holeId) ?? HOLE_OPTIONS[0]) : HOLE_OPTIONS[0];
  const labelSpec = LABEL_SIZE_SPECS[sizeId];
  const labelDiscSize = Math.round(labelSpec.inches * DISC_PX_PER_INCH);
  const labelRatio = labelSpec.labelInches / labelSpec.inches;
  const labelHoleRatio = hole.holeInches / labelSpec.inches;
  const offsetLogo = is7 && hole.id === 'large';
  const tileDiscSize = Math.round(96 * (labelSpec.inches / 12));

  const visibleInserts = INSERT_OPTIONS.filter((o) => !o.sizes || o.sizes.includes(sizeId));
  const insertType = visibleInserts.find((s) => s.id === insertId) ?? visibleInserts[0];
  const selectedInsertVariant = insertType.variants.find((v) => v.id === insertVariantId) ?? null;
  const insertsAvailable = visibleInserts.length > 1;

  const stickerShape = stickerShapeId === 'none' ? null : (STICKER_SHAPES.find((s) => s.id === stickerShapeId) ?? null);
  const stickerSize = stickerShape ? (stickerShape.sizes.find((s) => s.id === stickerSizeId) ?? stickerShape.sizes[Math.floor(stickerShape.sizes.length / 2)]) : null;

  // ── Selection handlers (donor logic, wired to shared size) ──
  const touch = () => setSaved(false);

  const selectSize = (id: SizeId) => {
    setSizeId(id);
    advance('size', 'step-qty');
    mark('size');
    touch();
    // colors: fall back to Classic Black when the color doesn't press this size
    if (!CATALOG_COLORS.find((c) => c.id === colorId)?.sizes.includes(id)) {
      setColorId('BK1');
      setColorKind('black');
    }
    // jackets: keep the style if this size offers it, else the first
    const opts = JACKET_CATALOG[id] ?? JACKET_CATALOG['12'];
    const nextJacket = opts.find((j) => j.id === jacketId) ?? opts[0];
    setJacketId(nextJacket.id);
    setJacketVariantId(
      nextJacket.variants.some((v) => v.id === jacketVariantId) ? jacketVariantId : nextJacket.variants[0].id,
    );
    // inserts: fall back to None when the style isn't offered
    const currentInsert = INSERT_OPTIONS.find((s) => s.id === insertId);
    if (currentInsert?.sizes && !currentInsert.sizes.includes(id)) {
      setInsertId('none');
      setInsertVariantId('');
    }
    // labels: leaving 7" resets the jukebox hole
    if (id !== '7') setHoleId('small');
  };

  const selectJacket = (id: string) => {
    setJacketId(id);
    const opt = jacketOptions.find((j) => j.id === id);
    setJacketVariantId(opt?.variants[0]?.id ?? 'standard');
    mark('jacket');
    touch();
  };

  const selectSleeve = (id: string) => {
    setSleeveId(id);
    const opt = SLEEVE_OPTIONS.find((s) => s.id === id);
    setSleeveVariantId(opt?.variants[0]?.id ?? 'board');
    mark('sleeve');
    touch();
  };

  const selectInsert = (id: string) => {
    setInsertId(id);
    const opt = INSERT_OPTIONS.find((s) => s.id === id);
    setInsertVariantId(opt?.variants[0]?.id ?? '');
    mark('insert');
    touch();
  };

  const chooseStickerShape = (id: StickerShapeId | 'none') => {
    setStickerShapeId(id);
    if (id !== 'none') {
      const next = STICKER_SHAPES.find((s) => s.id === id);
      if (next) setStickerSizeId(next.sizes[Math.floor(next.sizes.length / 2)].id);
    }
    mark('sticker');
    touch();
  };

  // ── Pricing — only what's been picked counts toward the estimate ──
  const vinylDone = picked('size') && picked('qty') && picked('weight') && picked('color');
  const perUnit =
    (vinylDone ? (color.price + WEIGHT_UP[weightId]) * qtyScale(qty) : 0) +
    (picked('label') ? LABEL_PRICE[labelId] : 0) +
    (picked('jacket') ? JACKET_PRICE[jacketType.id] : 0) +
    (picked('sleeve') ? SLEEVE_PRICE[sleeveType.id] : 0) +
    (picked('insert') ? INSERT_PRICE[insertType.id] : 0) +
    (picked('sticker') && stickerShapeId !== 'none' ? STICKER_PRICE[stickerShapeId] : 0);
  const total = picked('qty') ? perUnit * qty : 0;

  // Memphis hasn't returned confirmed pricing — every money surface reads a
  // quiet "$ —" (never $0.00). The math above stays wired for when it lands.
  const fmt = (_n: number) => '$ —';

  // ── Earnings worksheet (artist-only section, Bill Aug 13 2026) ──
  // The one place real numbers show: a what-if tool. Manufacturing uses the
  // wired estimate math; a caveat line says it firms up when Memphis confirms.
  const usd = (n: number, cents = true) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  const PUBLISHING_UNIT = 0.131 * 2 * 12; // $0.131 × 2 (vinyl+digital) × 12 tracks
  const GOODTUNES_UNIT = 4.50;
  const processingUnit = (retail: number) => retail * 0.029 + 0.30;
  // Per-record manufacturing at a given run size — same wired math as above.
  const manufacturingUnit = (q: number) =>
    (color.price + WEIGHT_UP[weightId]) * qtyScale(q) +
    LABEL_PRICE[labelId] +
    JACKET_PRICE[jacketType.id] +
    SLEEVE_PRICE[sleeveType.id] +
    INSERT_PRICE[insertType.id] +
    (stickerShapeId !== 'none' ? STICKER_PRICE[stickerShapeId] : 0);

  type Scenario = { qty: number; retail: number };
  const [scenarios, setScenarios] = useState<Scenario[]>([{ qty: 500, retail: 35 }]);
  const [mathOpen, setMathOpen] = useState<Set<number>>(() => new Set());
  const addScenario = () => {
    setScenarios((prev) => {
      if (prev.length >= 3) return prev;
      const used = prev.map((s) => s.qty);
      const nextQty = QUANTITIES.find((q) => q > Math.max(...used) && !used.includes(q)) ?? QUANTITIES[QUANTITIES.length - 1];
      return [...prev, { qty: nextQty, retail: prev[prev.length - 1].retail }];
    });
  };
  const removeScenario = (i: number) => setScenarios((prev) => prev.filter((_, idx) => idx !== i));
  const patchScenario = (i: number, patch: Partial<Scenario>) =>
    setScenarios((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const toggleMath = (i: number) =>
    setMathOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const sizeLabel = VINYL_SIZES.find((s) => s.id === sizeId)?.label ?? '';

  return (
    <PressShell>
      {/* Frosted running summary — pinned under the top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-4"
        style={{
          height: 48, paddingLeft: 40, paddingRight: 40,
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}>
        <div className="flex items-center gap-2 text-[12.5px] min-w-0" style={{ color: SUBINK }}>
          {picked('size') ? (
            <>
              <span className="font-semibold" style={{ color: INK }}>{sizeLabel}</span>
              {picked('qty') && (<><span style={{ color: '#d0d0d5' }}>·</span><span>{qty.toLocaleString()} units</span></>)}
              {picked('weight') && (<><span style={{ color: '#d0d0d5' }}>·</span><span>{weightId}g</span></>)}
              {picked('color') && (<><span style={{ color: '#d0d0d5' }}>·</span><span className="truncate">{color.name}</span></>)}
              {picked('jacket') && (<><span style={{ color: '#d0d0d5' }}>·</span><span className="truncate">{jacketType.name}</span></>)}
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
                  backgroundImage: `linear-gradient(90deg, ${SUBINK} 0%, ${SUBINK} 35%, ${BLUE} 50%, ${SUBINK} 65%, ${SUBINK} 100%)`,
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
          {/* Memphis lives up here (Bill, Aug 13 2026) — compact chip in the
              quote strip, where confirmed pricing will land. */}
          <span
            className="flex items-center gap-2 text-[12.5px] min-w-0"
            style={{ color: SUBINK }}
            data-testid="press-chip"
            title="Memphis Record Pressing — invited, pricing pending"
          >
            <span className="h-6 w-6 rounded-full bg-white ring-1 ring-black/10 flex items-center justify-center flex-shrink-0 p-[3px]">
              <img src={mrpLabelLogo} alt={PARTNER_NAME} className="w-full h-full object-contain" style={{ filter: 'brightness(0)' }} />
            </span>
            <span className="font-medium truncate" style={{ color: INK }}>Memphis</span>
            <span className="flex items-center gap-1.5" style={{ color: '#a1a1a6' }}>
              <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, border: '1.5px solid #a1a1a6' }} />
              pricing pending
            </span>
          </span>
          <span aria-hidden style={{ width: 1, height: 18, backgroundColor: HAIRLINE }} />
          <span className="text-[12.5px]" style={{ color: SUBINK }}>
            Est. <span className="font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmt(perUnit)}</span> / unit
          </span>
          <span className="text-[13px] font-semibold rounded-full" style={{ padding: '4px 14px', background: `${BLUE}12`, color: BLUE, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(total)}
          </span>
        </div>
      </div>

      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 36, paddingBottom: 96 }}>

        {/* Breadcrumb + draft identity — artist context (auto-save, sibling draft) */}
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>
              <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors" data-testid="crumb-releases">Releases</a>
              <span style={{ color: '#d0d0d5' }}>›</span>
              <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors" data-testid="crumb-release">CALIFORNIALAND</a>
              <span style={{ color: '#d0d0d5' }}>›</span>
              <span style={{ color: SUBINK }} data-testid="crumb-current">Vinyl draft</span>
            </div>
            {/* No drafts/variations dropdown for now (Bill, Aug 13 2026) —
                just the ambient auto-save indicator. */}
            <span
              className="inline-flex items-center gap-1.5 text-[12.5px] flex-shrink-0"
              style={{ color: '#a1a1a6' }}
              data-testid="autosave-indicator"
              title="Every change is saved automatically. A crash never loses your draft."
            >
              <Check className="w-3.5 h-3.5" />
              Saved just now
            </span>
          </div>
          <PageHeading lead="CALIFORNIALAND — Vinyl." rest="Your working draft." />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: SUBINK }}>
            Pick the size once — every later choice is already sized to match.
            Every edit saves to your GoodTunes® draft automatically.
          </p>

          {/* Press moved to the sticky quote strip above (Bill, Aug 13 2026) —
              the big "Invited · pricing pending" card is gone. */}
        </div>

        {/* ═══ 1 · VINYL (Add your vinyl) ═══ */}
        <section style={{ marginTop: 48 }}>
          <SplitSection
            left={
              <Gate on={picked('size')}>
                <div className="flex flex-col items-center">
                <DiscStage swatch={color} sizeId={sizeId} />
                {picked('size') && (
                  <>
                    {(picked('ctype') || picked('weight')) && (
                      <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
                        {picked('ctype') && (
                          <>
                            <ColorBall color={color.base} size={16} />
                            <span className="font-semibold" style={{ color: INK }}>{color.name}</span>
                            <span style={{ color: '#d0d0d5' }}>·</span>
                            <span>{color.kindNote}</span>
                          </>
                        )}
                        {picked('weight') && (
                          <>
                            {picked('ctype') && <span style={{ color: '#d0d0d5' }}>·</span>}
                            <span>{weightId}g</span>
                          </>
                        )}
                      </div>
                    )}
                    <p className="text-[12px] text-center" style={{ marginTop: (picked('ctype') || picked('weight')) ? 6 : 28, color: '#a1a1a6' }}>
                      {sizeLabel}{picked('qty') ? ` · ${qty.toLocaleString()} units` : ''}
                    </p>
                  </>
                )}
                </div>
              </Gate>
            }
            right={
              <div className="flex flex-col" style={{ gap: 48 }}>
                {/* Size */}
                <section>
                  <StepHeading lead="Pick a size." rest="The record sets the fit." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    The size you pick here carries through every step below.
                  </p>
                  <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
                    {VINYL_SIZES.map((s) => {
                      const active = picked('size') && s.id === sizeId;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => selectSize(s.id)}
                          aria-pressed={active}
                          data-testid={`size-${s.id}`}
                          className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
                          style={{ flex: 1, padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
                        >
                          <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{s.label}</div>
                          <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6' }}>{s.note}</div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Quantity — the press run */}
                <Gate on={canDo('qty')}>
                <section id="step-qty" style={{ scrollMarginTop: 120 }}>
                  <StepHeading lead="Pick a quantity." rest="How many you'll press." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    Bigger runs bring the per-record price down.
                  </p>
                  <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                    {QUANTITIES.map((q) => {
                      const active = picked('qty') && q === qty;
                      return (
                        <button
                          key={q}
                          type="button"
                          onClick={() => { setQty(q); advance('qty', 'step-weight'); mark('qty'); touch(); }}
                          aria-pressed={active}
                          data-testid={`qty-${q}`}
                          className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
                          style={{ padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
                        >
                          <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK, fontVariantNumeric: 'tabular-nums' }}>{q.toLocaleString()}</div>
                          <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6' }}>units</div>
                        </button>
                      );
                    })}
                  </div>
                </section>
                </Gate>

                {/* Weight */}
                <Gate on={canDo('weight')}>
                <section id="step-weight" style={{ scrollMarginTop: 120 }}>
                  <StepHeading lead="Pick a weight." rest="How heavy it presses." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    {VINYL_WEIGHTS.length} weights available from {PARTNER_NAME}.
                  </p>
                  <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
                    {VINYL_WEIGHTS.map((w) => {
                      const active = picked('weight') && w.id === weightId;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => { setWeightId(w.id); advance('weight', 'step-ctype'); mark('weight'); touch(); }}
                          aria-pressed={active}
                          data-testid={`weight-${w.id}`}
                          className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
                          style={{ flex: 1, padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
                        >
                          <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{w.label}</div>
                          <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6' }}>{w.note}</div>
                        </button>
                      );
                    })}
                  </div>
                </section>
                </Gate>

                {/* Type — donor "What kind of vinyl?" row.
                    Collapses to a summary row once a color is picked; Change re-expands. */}
                <Gate on={canDo('ctype')}>
                <section id="step-ctype" style={{ scrollMarginTop: 120 }}>
                  {picked('ctype') && !typeOpen ? (
                    <>
                      <StepHeading lead="Pick a type." rest="What kind of vinyl?" />
                      <div
                        className="flex items-center rounded-2xl bg-white"
                        style={{ marginTop: 16, gap: 14, padding: '12px 18px', border: `1px solid ${HAIRLINE}` }}
                        data-testid="type-summary-row"
                      >
                        <VinylDisc size={44} swatch={color} />
                        <div className="flex-1" style={{ minWidth: 0 }}>
                          <div className="text-[14px] font-semibold" style={{ color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {COLOR_TYPES.find((t) => t.id === colorKind)?.name}
                          </div>
                          <div className="text-[11.5px]" style={{ marginTop: 1, color: '#a1a1a6' }}>
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
                      <StepHeading lead="Pick a type." rest="What kind of vinyl?" />
                      <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                        {colors.length} colors in your catalog press for {sizeLabel}.
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
                                mark('ctype');
                                mark('color');
                                setTypeOpen(false);
                                touch();
                              }}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
                </section>
                </Gate>

                {/* Color — the looks within the chosen type */}
                <Gate on={canDo('color')}>
                <section id="step-color" style={{ scrollMarginTop: 120 }}>
                  <StepHeading lead="Pick a color." rest="From your catalog." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    {picked('ctype')
                      ? `${COLOR_TYPES.find((t) => t.id === colorKind)?.name} · ${colors.filter((c) => c.kind === colorKind).length} colors`
                      : 'Pick a type first.'}
                  </p>
                  <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                    {colors.filter((c) => c.kind === colorKind).map((c) => (
                      <ColorBallCard
                        key={c.id}
                        swatch={c}
                        active={picked('ctype') && c.id === color.id}
                        onSelect={() => { setColorId(c.id); mark('color'); setTypeOpen(false); touch(); }}
                      />
                    ))}
                  </div>
                </section>
                </Gate>
              </div>
            }
          />
        </section>

        {/* ═══ 2 · JACKET (Choose your jacket) ═══ */}
        <section id="step-jacket" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={canDo('jacket')}>
          <SplitSection
            left={
              <>
                <JacketStage jacketType={jacketType} widespine={jacketVariantId === 'widespine'} tipOn={jacketVariantId === 'tipon'} />
                <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: INK }}>
                  {sizeLabel} {jacketType.name}
                  {selectedJacketVariant && selectedJacketVariant.id !== 'standard' && (
                    <span style={{ color: '#a1a1a6' }}> · {selectedJacketVariant.label}</span>
                  )}
                </div>
                <p className="text-[12px] text-center" style={{ marginTop: 6, color: '#a1a1a6', maxWidth: 280 }}>
                  {jacketType.note}
                  {jacketType.gatefoldPanels > 0 && <span> Hover to preview the fold.</span>}
                </p>
              </>
            }
            right={
              <>
                <StepHeading lead="Pick a jacket." rest="How it&rsquo;s built." />
                <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                  {jacketOptions.length} styles available from {PARTNER_NAME} for {sizeLabel} records.
                </p>
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {jacketOptions.map((j) => (
                    <JacketTile
                      key={j.id}
                      jacket={j}
                      active={picked('jacket') && j.id === jacketType.id}
                      variantId={j.id === jacketType.id ? jacketVariantId : j.variants[0].id}
                      onSelect={() => selectJacket(j.id)}
                      onVariantSelect={(id) => { setJacketVariantId(id); mark('jacket'); touch(); }}
                    />
                  ))}
                </div>
              </>
            }
          />
          </Gate>
        </section>

        {/* ═══ 3 · INNER SLEEVE (Choose your inner sleeve) ═══ */}
        <section id="step-sleeve" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={canDo('sleeve')}>
          <SplitSection
            left={
              <>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  filter: picked('sleeve') ? 'none' : 'grayscale(1) opacity(0.45)',
                  transition: 'filter 0.4s ease',
                }}>
                  <SleeveStage sleeve={look} />
                  <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: INK }}>
                    {sizeLabel} {sleeveType.name}
                    {selectedSleeveVariant && (
                      <span style={{ color: '#a1a1a6' }}> · {selectedSleeveVariant.label}</span>
                    )}
                  </div>
                  <p className="text-[12px] text-center" style={{ marginTop: 6, color: '#a1a1a6', maxWidth: 280 }}>
                    {picked('sleeve') ? sleeveType.note : 'Select a finish to add it to your quote.'}
                  </p>
                </div>
              </>
            }
            right={
              <>
                <StepHeading lead="Pick an inner sleeve." rest="Printed, unprinted, or polylined." />
                <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                  {SLEEVE_OPTIONS.length} inner sleeve styles available from {PARTNER_NAME}.
                </p>
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {SLEEVE_OPTIONS.map((s) => (
                    <SleeveTile
                      key={s.id}
                      sleeve={s}
                      active={picked('sleeve') && s.id === sleeveId}
                      variantId={s.id === sleeveId ? sleeveVariantId : s.variants[0].id}
                      onSelect={() => selectSleeve(s.id)}
                      onVariantSelect={(id) => { setSleeveVariantId(id); mark('sleeve'); touch(); }}
                    />
                  ))}
                </div>
                <p className="text-[12px]" style={{ marginTop: 12, color: '#a1a1a6' }}>
                  {sleeveType.id === 'printed'
                    ? 'The artist supplies print-ready artwork for the sleeve face.'
                    : sleeveType.id === 'polylined'
                      ? 'No artwork needed — ships with anti-static poly lining.'
                      : 'No artwork needed — packaging ships as-is.'}
                </p>
              </>
            }
          />
          </Gate>
        </section>

        {/* ═══ 4 · CENTER LABELS ═══ */}
        <section id="step-labels" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={canDo(is7 ? 'hole' : 'label')}>
          <SplitSection
            left={
              <>
                <LabelStage kind={labelId} holeRatio={labelHoleRatio} discSize={labelDiscSize} labelRatio={labelRatio} offsetLogo={offsetLogo} swatch={picked('color') ? color : undefined} />
                <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
                  <span className="font-semibold" style={{ color: INK }}>
                    {sizeLabel} {labelStyle.name}
                  </span>
                  {is7 && (
                    <>
                      <span style={{ color: '#d0d0d5' }}>·</span>
                      <span>{hole.label}</span>
                    </>
                  )}
                </div>
                <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 320, color: '#a1a1a6' }}>
                  {labelStyle.note}
                </p>
              </>
            }
            right={
              <div className="flex flex-col" style={{ gap: 48 }}>
                {is7 && (
                  <section>
                    <StepHeading lead="Pick a hole." rest="Spindle or jukebox." />
                    <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                      7&quot; records press with a small spindle hole or the classic large 45 hole.
                    </p>
                    <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
                      {HOLE_OPTIONS.map((h) => {
                        const active = picked('hole') && h.id === holeId;
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => { setHoleId(h.id); mark('hole'); touch(); }}
                            aria-pressed={active}
                            data-testid={`hole-${h.id}`}
                            className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
                            style={{ flex: 1, padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
                          >
                            <div className="text-[15px] font-semibold" style={{ color: active ? BLUE : INK }}>{h.label}</div>
                            <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.4 }}>{h.note}</div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}
                <Gate on={canDo('label')}>
                <section>
                  <StepHeading lead="Pick a type." rest="Which label style?" />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    Printed before pressing — the label becomes part of the record.
                  </p>
                  <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                    {LABEL_STYLES.map((s) => (
                      <LabelTile
                        key={s.id}
                        style={s}
                        active={picked('label') && s.id === labelId}
                        onSelect={() => { setLabelId(s.id); if (sizeId !== '7') advance('label', 'step-inserts'); mark('label'); touch(); }}
                        discSize={tileDiscSize}
                        labelRatio={labelRatio}
                        holeRatio={labelHoleRatio}
                        offsetLogo={offsetLogo}
                      />
                    ))}
                  </div>
                </section>
                </Gate>
              </div>
            }
          />
          </Gate>
        </section>

        {/* ═══ 5 · INSERTS (Choose your inserts) ═══ */}
        <section id="step-inserts" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={canDo('insert')}>
          <SplitSection
            left={
              <>
                <InsertStage insert={insertType} variantId={insertVariantId} />
                {insertType.id !== 'none' && (
                  <>
                    <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: INK }}>
                      {sizeLabel} {insertType.name}
                      {selectedInsertVariant && (
                        <span style={{ color: '#a1a1a6' }}> · {selectedInsertVariant.label}</span>
                      )}
                    </div>
                    <p className="text-[12px] text-center" style={{ marginTop: 6, color: '#a1a1a6', maxWidth: 280 }}>
                      {insertType.note}
                    </p>
                  </>
                )}
              </>
            }
            right={
              <>
                <StepHeading lead="Add an insert." rest="Optional — or skip it." />
                <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                  {insertsAvailable
                    ? `${visibleInserts.length - 1} insert styles available from ${PARTNER_NAME} — or skip it.`
                    : 'No insert styles press for 7" — this record ships without one.'}
                </p>
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {visibleInserts.map((s) => (
                    <InsertTile
                      key={s.id}
                      insert={s}
                      active={picked('insert') && s.id === insertId}
                      variantId={s.id === insertId ? insertVariantId : (s.variants[0]?.id ?? '')}
                      onSelect={() => selectInsert(s.id)}
                      onVariantSelect={(id) => { setInsertVariantId(id); mark('insert'); touch(); }}
                    />
                  ))}
                </div>
              </>
            }
          />
          </Gate>
        </section>

        {/* ═══ 6 · STICKERS ═══ */}
        <section id="step-stickers" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
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
                      <span style={{ color: '#d0d0d5' }}>·</span>
                      <span>{stickerShape.name}</span>
                    </>
                  )}
                </div>
                <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 320, color: '#a1a1a6' }}>
                  {stickerShape ? stickerShape.note : 'No sticker on the shrink-wrap.'}
                </p>
              </>
            }
            right={
              <div className="flex flex-col" style={{ gap: 48 }}>
                <section>
                  <StepHeading lead="Add a sticker." rest="Die-cut to fit — or none." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    Stickers apply to the shrink-wrap, not the jacket itself.
                  </p>
                  <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <NoneShapeTile active={picked('sticker') && stickerShapeId === 'none'} onSelect={() => chooseStickerShape('none')} />
                    {STICKER_SHAPES.map((s) => (
                      <ShapeTile
                        key={s.id}
                        shape={s}
                        active={picked('sticker') && s.id === stickerShapeId}
                        onSelect={() => chooseStickerShape(s.id)}
                      />
                    ))}
                  </div>
                </section>

                {stickerShape && (
                  <section>
                    <StepHeading lead="Pick a size." rest={`For ${stickerShape.name.toLowerCase()}s.`} />
                    <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                      {stickerShape.id === 'upc'
                        ? 'UPC stickers come in one standard retail size.'
                        : 'Every size prints on the same white die-cut stock.'}
                    </p>
                    <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                      {stickerShape.sizes.map((s) => (
                        <SizeCard
                          key={s.id}
                          size={s}
                          round={stickerShape.round}
                          active={s.id === stickerSizeId}
                          onSelect={() => { setStickerSizeId(s.id); mark('sticker'); touch(); }}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            }
          />
          </Gate>
        </section>

        {/* ═══ 7 · EARNINGS WORKSHEET (artist-only) ═══
            The choices are locked in above — this is the what-if sheet.
            The BIG number is always what the artist earns, never a cost. */}
        <section id="step-earnings" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={allDone}>
            <SectionHeading
              lead="What you could earn."
              rest="Your worksheet."
              sub="Try a price. Try a bigger run. The big number is yours — after pressing, publishing, and processing. Playing here never changes your draft."
            />

            <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: `repeat(${Math.min(scenarios.length + (scenarios.length < 3 ? 1 : 0), 3)}, minmax(0, 1fr))`, gap: 20, alignItems: 'stretch' }}>
              {scenarios.map((sc, i) => {
                const mfg = manufacturingUnit(sc.qty);
                const proc = processingUnit(sc.retail);
                const costUnit = mfg + PUBLISHING_UNIT + proc + GOODTUNES_UNIT;
                const profitUnit = sc.retail - costUnit;
                const gross = profitUnit * sc.qty;
                const open = mathOpen.has(i);
                return (
                  <div
                    key={i}
                    className="rounded-3xl bg-white relative flex flex-col"
                    style={{ border: i === 0 ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, padding: 28 }}
                    data-testid={`earn-card-${i}`}
                  >
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => removeScenario(i)}
                        aria-label="Remove this run"
                        data-testid={`button-remove-earn-${i}`}
                        className="absolute rounded-full transition-colors hover:bg-black/5 flex items-center justify-center"
                        style={{ top: 14, right: 14, width: 28, height: 28, color: '#a1a1a6' }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: i === 0 ? BLUE : '#a1a1a6' }}>
                      {i === 0 ? 'Your run' : `What if · ${i + 1}`}
                    </div>

                    {/* The big number — always earnings, never cost */}
                    <div style={{ marginTop: 18 }}>
                      <div className="tracking-tight" style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid={`earn-gross-${i}`}>
                        {usd(Math.max(gross, 0), false)}
                      </div>
                      <div className="text-[13px]" style={{ marginTop: 8, color: SUBINK }}>
                        Potential gross profit — <span className="font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{usd(Math.max(profitUnit, 0))}</span> yours on every record sold.
                      </div>
                    </div>

                    {/* The two dials */}
                    <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <label className="block">
                        <span className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6', marginBottom: 6 }}>Your price</span>
                        <span className="flex items-center rounded-xl" style={{ border: `1px solid ${HAIRLINE}`, height: 42, paddingLeft: 12 }}>
                          <span className="text-[14px]" style={{ color: '#a1a1a6' }}>$</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={sc.retail}
                            onChange={(e) => patchScenario(i, { retail: Number(e.target.value) || 0 })}
                            data-testid={`input-earn-retail-${i}`}
                            className="w-full h-full bg-transparent focus:outline-none text-[15px] font-semibold"
                            style={{ color: INK, paddingLeft: 6, fontVariantNumeric: 'tabular-nums' }}
                          />
                        </span>
                      </label>
                      <label className="block">
                        <span className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6', marginBottom: 6 }}>Run size</span>
                        <span className="relative block">
                          <select
                            value={sc.qty}
                            onChange={(e) => patchScenario(i, { qty: Number(e.target.value) })}
                            data-testid={`select-earn-qty-${i}`}
                            className="w-full appearance-none rounded-xl bg-transparent focus:outline-none text-[15px] font-semibold"
                            style={{ border: `1px solid ${HAIRLINE}`, height: 42, padding: '0 32px 0 12px', color: INK, fontVariantNumeric: 'tabular-nums' }}
                          >
                            {QUANTITIES.map((q) => (
                              <option key={q} value={q}>{q.toLocaleString()} records</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#a1a1a6' }} />
                        </span>
                      </label>
                    </div>

                    {/* The quiet math — per record, so a run never reads like a $22k bill */}
                    <div style={{ marginTop: 18 }}>
                      <button
                        type="button"
                        onClick={() => toggleMath(i)}
                        data-testid={`button-earn-math-${i}`}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium transition-opacity hover:opacity-80"
                        style={{ color: BLUE }}
                        aria-expanded={open}
                      >
                        See the math
                        <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
                      </button>
                      {open && (
                        <div className="text-[13px]" style={{ marginTop: 12, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 12, color: SUBINK }} data-testid={`earn-math-${i}`}>
                          {[
                            ['You sell each record for', usd(sc.retail), true],
                            ['Pressing & packaging', `− ${usd(mfg)}`, false],
                            ['Publishing (12 tracks, vinyl + digital)', `− ${usd(PUBLISHING_UNIT)}`, false],
                            ['Payment processing', `− ${usd(proc)}`, false],
                            ['GoodTunes®', `− ${usd(GOODTUNES_UNIT)}`, false],
                          ].map(([label, val, strong]) => (
                            <div key={label as string} className="flex items-baseline justify-between" style={{ padding: '3px 0' }}>
                              <span style={{ color: strong ? INK : SUBINK, fontWeight: strong ? 600 : 400 }}>{label}</span>
                              <span style={{ color: strong ? INK : SUBINK, fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 600 : 400 }}>{val}</span>
                            </div>
                          ))}
                          <div className="flex items-baseline justify-between" style={{ padding: '8px 0 0', marginTop: 6, borderTop: `1px solid ${HAIRLINE}` }}>
                            <span className="font-semibold" style={{ color: INK }}>Yours, every record sold</span>
                            <span className="font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{usd(Math.max(profitUnit, 0))}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {scenarios.length < 3 && (
                <button
                  type="button"
                  onClick={addScenario}
                  data-testid="button-add-earn-scenario"
                  className="rounded-3xl flex flex-col items-center justify-center gap-2 transition-colors hover:bg-black/[0.02]"
                  style={{ border: `1.5px dashed #d0d0d5`, minHeight: 220, color: SUBINK }}
                >
                  <span className="flex items-center justify-center rounded-full" style={{ width: 36, height: 36, border: `1px solid ${HAIRLINE}`, backgroundColor: '#fff' }}>
                    <Plus className="w-4 h-4" style={{ color: BLUE }} />
                  </span>
                  <span className="text-[13.5px] font-medium" style={{ color: INK }}>Try another run</span>
                  <span className="text-[12px]" style={{ color: '#a1a1a6' }}>Bigger runs earn more per record.</span>
                </button>
              )}
            </div>

            <p className="text-[12px]" style={{ marginTop: 16, color: '#a1a1a6', maxWidth: 640, lineHeight: 1.6 }}>
              Pressing costs use your press's estimate and firm up when Memphis Record Pressing confirms pricing.
              Gross profit assumes the full run sells at your price.
            </p>
          </Gate>
        </section>

        {/* ═══ 8 · SAVE ═══ */}
        <section id="step-save" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={allDone}>
          <div className="rounded-3xl bg-white" style={{ marginTop: 28, padding: 32, border: `1px solid ${HAIRLINE}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 32, alignItems: 'center' }}>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6', marginBottom: 10 }}>Your draft</div>
                <div className="text-[15px] font-semibold" style={{ color: INK }}>CALIFORNIALAND — Vinyl</div>

                <div className="text-[12.5px]" style={{ marginTop: 18, color: SUBINK, lineHeight: 1.6 }}>
                  {sizeLabel} · {qty.toLocaleString()} units · {weightId}g · {color.name} · {labelStyle.name} label · {jacketType.name} · {sleeveType.name} sleeve
                  {insertType.id === 'none' ? '' : ` · ${insertType.name}`}
                  {stickerShape ? ` · ${stickerShape.name} sticker` : ''}
                </div>
                <div className="text-[13px]" style={{ marginTop: 8, color: INK }}>
                  <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(perUnit)}</span>
                  <span style={{ color: SUBINK }}> per unit · </span>
                  <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
                  <span style={{ color: SUBINK }}> total</span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-3 flex-shrink-0">
                {/* Auto-save — no Save button anywhere. The one filled blue
                    pill on this screen moves the artist to templates. */}
                <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: '#34a853' }} data-testid="draft-saved-note">
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', background: '#34a85315',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                  Saved to your GoodTunes® draft
                </div>
                <Button
                  className="rounded-full px-7"
                  style={{ background: BLUE, color: '#fff', height: 44, fontSize: 14.5 }}
                  data-testid="button-continue-templates"
                >
                  Continue to templates
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <p className="text-[11.5px] text-right" style={{ color: '#a1a1a6', maxWidth: 260 }}>
                  Just the templates this draft needs — download, create your art, upload.
                </p>
              </div>
            </div>
          </div>
          </Gate>
        </section>
      </div>
    </PressShell>
  );
}

export default ArtistReleaseDraftBuilder;
