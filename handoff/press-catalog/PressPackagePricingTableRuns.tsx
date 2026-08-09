// PressPackagePricingTable — variation of the split layout where the left
// preview is the album jacket with the vinyl peeking out to the right;
// hovering slides the record further out of the sleeve.
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
  X,
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
const PRESS_LABEL_LOGO = mrpLabelLogo;
const PRESS_LABEL_BG = '#0a0a0a';
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';

// ─── Brand tokens (Apple calm visual language) ──────────────────────
const BLUE = '#319ED8';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = '#e6e6ea';
const CANVAS = '#f5f5f7';
const RAIL = '#f5f5f7';
const READY = '#1c8a5b';
const WARN = '#c98a00';
const CRITICAL = '#e0245e';
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

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

const STAGE_PX_PER_INCH = 420 / 12;

function DiscStage({ swatch, product }: { swatch: Swatch; product: ProductType }) {
  const { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind } = useVinylSpin();
  const discPx = Math.round(product.inches * STAGE_PX_PER_INCH);
  const labelRatio = product.labelInches / product.inches;
  const holeRatio = 0.3 / product.inches;
  const isDouble = product.discs > 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', height: 440, display: 'flex', alignItems: 'flex-end' }}>
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

// ─── Jacket stage — album cover with the record peeking out to the right.
// Hovering slides the vinyl further out of the sleeve.
function JacketStage({ swatch, product }: { swatch: Swatch; product: ProductType }) {
  const [hover, setHover] = useState(false);
  // Rotate only the disc body (grooves + label) so the specular highlight —
  // which lives outside the body in VinylDisc — stays fixed like a real light source.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.transition = 'transform 0.55s cubic-bezier(0.32, 0.72, 0.28, 1)';
    el.style.transform = hover ? 'rotate(32deg)' : 'rotate(0deg)';
  }, [hover]);
  // Second record (Double LP) spins too — a little slower and not as far.
  const bodyRef2 = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = bodyRef2.current;
    if (!el) return;
    el.style.transition = 'transform 0.75s cubic-bezier(0.32, 0.72, 0.28, 1) 0.1s';
    el.style.transform = hover ? 'rotate(18deg)' : 'rotate(0deg)';
  }, [hover]);
  // Jacket scales with the product — a 7" single gets a small sleeve, not a 12" cover.
  const jacketPx = Math.round(300 * (product.inches / 12));
  const discPx = Math.round(jacketPx * 0.96);
  const labelRatio = product.labelInches / product.inches;
  const holeRatio = 0.3 / product.inches;

  return (
    <div
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{ position: 'relative', width: jacketPx + jacketPx * 0.5, height: jacketPx + 24, cursor: 'pointer' }}
      aria-label={`${swatch.name} record inside its printed jacket`}
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

      {/* record — behind the jacket, slides right on hover (transform only, no layout repaints) */}
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

      {/* jacket — in front, artist-supplied artwork placeholder */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: jacketPx,
          height: jacketPx,
          borderRadius: 3,
          backgroundColor: '#141416',
          backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 45%)',
          boxShadow: '0 18px 40px rgba(0,0,0,0.25), inset -1px 0 0 rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        <img src={PRESS_LABEL_LOGO} alt="" style={{ width: jacketPx * 0.42, height: jacketPx * 0.42, filter: 'invert(1)', opacity: 0.92 }} />
        {/* spine hint */}
        <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 7, background: 'linear-gradient(90deg, rgba(0,0,0,0.5), transparent)' }} />
      </div>

      {/* floor shadow — fixed size, stretched with a transform so it never repaints mid-hover */}
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

// ─── Color groups (each carries its own package price ladder) ────────
type ColorGroup = {
  id: string;
  name: string;
  blurb: string;
  swatch: Swatch;
  /** Every color the press offers in this group — they ALL share the group's package prices. */
  colors: Swatch[];
  /** Sizes this type is pressed in — gates the whole type, every color in it. */
  sizes: string[];
};

const COLOR_GROUPS: ColorGroup[] = [
  {
    id: 'black',
    name: 'Black',
    blurb: 'Standard weight',
    sizes: ['7"', '10"', '12"'],
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
    sizes: ['7"', '10"', '12"'],
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
    sizes: ['7"', '10"', '12"'],
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
    sizes: ['7"', '10"', '12"'],
    swatch: { id: 'g-splat', name: 'Cosmic', kind: 'splatter', base: '#1B3A6B', s1: '#F5F5DC', s2: '#E8C84A', s3: '#E0E0E0' },
    colors: [
      { id: 'sp-1', name: 'Cosmic', kind: 'splatter', base: '#1B3A6B', s1: '#F5F5DC', s2: '#E8C84A', s3: '#E0E0E0' },
      { id: 'sp-2', name: 'Firecracker', kind: 'splatter', base: '#B3262E', s1: '#F2E7C9', s2: '#E8A13C', s3: '#1d1d1f' },
      { id: 'sp-3', name: 'Sea Glass', kind: 'splatter', base: '#CFE8DF', s1: '#2E8B5F', s2: '#2563EB', s3: '#F5F5DC' },
      { id: 'sp-4', name: 'Grape Soda', kind: 'splatter', base: '#5A3D8A', s1: '#E5B8D0', s2: '#EDEDF0', s3: '#2A1E45' },
      { id: 'sp-5', name: 'Sunburst', kind: 'splatter', base: '#E8C84A', s1: '#D97038', s2: '#B3262E', s3: '#F5F5DC' },
    ],
  },
  {
    id: 'mixswirl',
    name: 'Mix/Swirl',
    blurb: 'Two colors, hand-poured',
    sizes: ['7"', '10"', '12"'],
    swatch: { id: 'g-mix', name: 'Storm Swirl', kind: 'splatter', base: '#3B4A66', s1: '#EDEDF0', s2: '#9A9AA0', s3: '#EDEDF0' },
    colors: [
      { id: 'mx-1', name: 'Storm Swirl', kind: 'splatter', base: '#3B4A66', s1: '#EDEDF0', s2: '#9A9AA0', s3: '#EDEDF0' },
      { id: 'mx-2', name: 'Creamsicle', kind: 'splatter', base: '#D97038', s1: '#F2E7C9', s2: '#EFEBE2', s3: '#F2E7C9' },
      { id: 'mx-3', name: 'Lagoon', kind: 'splatter', base: '#1E3E9E', s1: '#9CC5B0', s2: '#CFE8DF', s3: '#9CC5B0' },
    ],
  },
  {
    id: 'splatter2',
    name: 'Splatter — 2 Colors',
    blurb: 'Two-color spray',
    sizes: ['7"', '10"', '12"'],
    swatch: { id: 'g-sp2', name: 'Cherry Bomb', kind: 'splatter', base: '#EDEDF0', s1: '#B3262E', s2: '#1d1d1f', s3: '#B3262E' },
    colors: [
      { id: 's2-1', name: 'Cherry Bomb', kind: 'splatter', base: '#EDEDF0', s1: '#B3262E', s2: '#1d1d1f', s3: '#B3262E' },
      { id: 's2-2', name: 'Blueberry Milk', kind: 'splatter', base: '#EFEBE2', s1: '#2563EB', s2: '#8FB8DF', s3: '#2563EB' },
      { id: 's2-3', name: 'Wasabi', kind: 'splatter', base: '#C6CE4A', s1: '#2E8B5F', s2: '#4A5D4E', s3: '#2E8B5F' },
      { id: 's2-4', name: 'Bruise', kind: 'splatter', base: '#6B4FA1', s1: '#E5B8D0', s2: '#2A1E45', s3: '#E5B8D0' },
    ],
  },
  {
    id: 'blacksplatter2',
    name: 'Black Splatter — 2 Colors',
    blurb: 'Black base, two-color spray',
    sizes: ['7"', '10"', '12"'],
    swatch: { id: 'g-bsp2', name: 'Ember', kind: 'splatter', base: '#111114', s1: '#B3262E', s2: '#E8A13C', s3: '#B3262E' },
    colors: [
      { id: 'bs-1', name: 'Ember', kind: 'splatter', base: '#111114', s1: '#B3262E', s2: '#E8A13C', s3: '#B3262E' },
      { id: 'bs-2', name: 'Glacier', kind: 'splatter', base: '#111114', s1: '#8FB8DF', s2: '#EDEDF0', s3: '#8FB8DF' },
      { id: 'bs-3', name: 'Toxic', kind: 'splatter', base: '#111114', s1: '#C6CE4A', s2: '#2E8B5F', s3: '#C6CE4A' },
      { id: 'bs-4', name: 'Confetti', kind: 'splatter', base: '#111114', s1: '#E5B8D0', s2: '#E8C84A', s3: '#E5B8D0' },
    ],
  },
];

// ─── Run quantities + the price book model ───────────────────────────
const RUN_QTYS = [100, 300, 500, 1000, 2000, 3000, 5000, 10000] as const;
type RunQty = (typeof RUN_QTYS)[number];

type PriceMode = 'priced' | 'quote' | 'off';
type RunCell = { mode: PriceMode; price: string };

// The full price book: colorGroupId -> runQty -> cell. Seeded with realistic
// package prices that step down with volume; colored vinyl carries a premium.
type PriceBook = Record<string, Record<number, RunCell>>;

function seedBook(): PriceBook {
  const rows: Record<string, number[]> = {
    // per-unit finished-package cost at each run qty
    black: [16.0, 12.5, 10.0, 8.25, 7.25, 6.5, 5.95, 5.4],
    opaque: [19.0, 14.5, 11.75, 9.75, 8.5, 7.75, 7.1, 6.5],
    translucent: [20.0, 15.25, 12.5, 10.25, 9.0, 8.25, 7.6, 6.95],
    splatter: [24.0, 18.5, 15.0, 12.75, 11.25, 10.5, 9.75, 9.0],
    mixswirl: [26.0, 20.0, 16.25, 13.75, 12.0, 11.25, 10.5, 9.75],
    splatter2: [25.0, 19.25, 15.5, 13.25, 11.75, 11.0, 10.25, 9.5],
    blacksplatter2: [23.0, 17.75, 14.5, 12.25, 10.75, 10.0, 9.4, 8.75],
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
  { label: 'Catalog', icon: Library, active: true },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

function NavRow({ label, icon: Icon, active }: PressNavItem) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn('flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !active && 'hover:bg-slate-200')}
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
          <button type="button" className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-slate-50 transition-colors" style={{ color: INK }}>
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
          <button type="button" className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-slate-100" style={{ color: SUBINK }} aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: RAIL, borderRight: `1px solid ${HAIRLINE}` }}>
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>
      {children}
    </div>
  );
}

// ─── Product-type segmented control (disc icon per option) ───────────
function ProductTypeControl({ value, onChange }: { value: ProductTypeId; onChange: (v: ProductTypeId) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full p-1" style={{ backgroundColor: '#f0f0f2' }} data-testid="control-product-type">
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
              backgroundColor: active ? '#ffffff' : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
            }}
          >
            {pt.discs > 1 ? <Layers className="w-4 h-4" style={{ color: active ? INK : '#a1a1a6' }} /> : <Disc className="w-4 h-4" style={{ color: active ? INK : '#a1a1a6' }} />}
            {pt.name}
          </button>
        );
      })}
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
    <div className="flex items-center justify-between" data-testid="turnaround-row">
      <div>
        <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
          <span style={{ color: INK }}>Turnaround. </span>
          <span style={{ color: '#a1a1a6' }}>Order to ship.</span>
        </h2>
        <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
          Weeks from confirmed order to finished records on the truck.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={min}
          onChange={(e) => onMin(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          data-testid="input-turnaround-min"
          className="text-[14px] text-center tabular-nums focus:outline-none focus:border-slate-400 transition-colors"
          style={{ width: 56, height: 40, border: `1px solid ${HAIRLINE}`, borderRadius: 10, color: INK, background: '#fff', fontWeight: 600 }}
        />
        <span className="text-[13px]" style={{ color: '#a1a1a6' }}>
          –
        </span>
        <input
          value={max}
          onChange={(e) => onMax(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          data-testid="input-turnaround-max"
          className="text-[14px] text-center tabular-nums focus:outline-none focus:border-slate-400 transition-colors"
          style={{ width: 56, height: 40, border: `1px solid ${HAIRLINE}`, borderRadius: 10, color: INK, background: '#fff', fontWeight: 600 }}
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
  onRename: (name: string, sizes: string[]) => void;
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
      className="group relative rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 14, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
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
      <div className="text-[11.5px]" style={{ marginTop: 2, color: '#a1a1a6' }}>
        {group.colors.length} {group.colors.length === 1 ? 'color' : 'colors'}
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
  background: '#fff',
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

/** Edit a color type (group): rename + which sizes it's pressed in. Archive retires it. */
function GroupEditorPopover({
  group,
  canRemove,
  onSave,
  onRemove,
  trigger,
}: {
  group: ColorGroup;
  canRemove: boolean;
  onSave: (name: string, sizes: string[]) => void;
  onRemove: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const [sizes, setSizes] = useState<string[]>(group.sizes);
  useEffect(() => {
    if (open) {
      setName(group.name);
      setSizes(group.sizes);
    }
  }, [open, group.name, group.sizes]);
  const canSave = name.trim().length > 0 && sizes.length > 0;
  const toggleSize = (s: string) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-80 p-0 rounded-2xl overflow-hidden" style={FROSTED_PANEL} data-testid={`popover-edit-group-${group.id}`}>
        <div style={{ padding: 18 }}>
          <div className="text-[15px] font-semibold tracking-tight" style={{ color: INK }}>
            Edit type. <span style={{ color: '#a1a1a6', fontWeight: 600 }}>{group.name}.</span>
          </div>
          <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 2, lineHeight: 1.4 }}>
            Sizes here gate the whole type &mdash; every color in it.
          </p>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <FieldLabel>Pressed in these sizes</FieldLabel>
              <div className="flex items-center gap-2">
                {SIZES.map((s) => (
                  <SizeChip key={s} size={s} active={sizes.includes(s)} onToggle={() => toggleSize(s)} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3" style={{ padding: '12px 18px', borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100"
            style={{ color: SUBINK }}
            data-testid={`button-cancel-group-${group.id}`}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              onSave(name.trim(), sizes);
              setOpen(false);
            }}
            className="text-[13px] font-semibold rounded-full px-4 py-1.5 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: BLUE }}
            data-testid={`button-save-group-${group.id}`}
          >
            Save
          </button>
        </div>
        {/* Archive — Apple convention: destructive-adjacent action gets its own
            hairline-separated full-width row at the very bottom. Archive (not
            delete): pressed records keep their history; the type just retires. */}
        <button
          type="button"
          disabled={!canRemove}
          onClick={() => {
            onRemove();
            setOpen(false);
          }}
          className="w-full text-[13px] font-semibold transition-colors disabled:opacity-40"
          style={{ padding: '12px 18px', borderTop: `1px solid ${HAIRLINE}`, color: CRITICAL, textAlign: 'center', background: 'transparent' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fdeef2')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          data-testid={`button-archive-group-${group.id}`}
        >
          Archive type
        </button>
      </PopoverContent>
    </Popover>
  );
}

// ─── Reorder mode controls — explicit enter/commit/cancel, Apple-quiet ─
// Reordering is opt-in so a stray drag can never shuffle the catalog.
function ReorderControls({
  on,
  onBegin,
  onCommit,
  onCancel,
  testId,
}: {
  on: boolean;
  onBegin: () => void;
  onCommit: () => void;
  onCancel: () => void;
  testId: string;
}) {
  if (!on) {
    return (
      <button
        type="button"
        onClick={onBegin}
        data-testid={`button-reorder-${testId}`}
        className="text-[12px] font-semibold rounded-full transition-colors hover:bg-slate-100 focus:outline-none"
        style={{ padding: '5px 12px', color: SUBINK, border: `1px solid ${HAIRLINE}`, background: '#fff' }}
      >
        Reorder
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onCancel}
        data-testid={`button-reorder-cancel-${testId}`}
        className="flex items-center gap-1 text-[12px] font-semibold rounded-full transition-colors hover:bg-slate-100 focus:outline-none"
        style={{ padding: '5px 12px', color: SUBINK, border: `1px solid ${HAIRLINE}`, background: '#fff' }}
      >
        <RotateCcw className="w-3 h-3" />
        Cancel
      </button>
      <button
        type="button"
        onClick={onCommit}
        data-testid={`button-reorder-done-${testId}`}
        className="text-[12px] font-semibold rounded-full text-white transition-opacity hover:opacity-90 focus:outline-none"
        style={{ padding: '5px 14px', backgroundColor: BLUE }}
      >
        Done
      </button>
    </div>
  );
}

// ─── Catalog search — magnifier reveals a frosted find-a-color popover ─
type CatalogEntry = { swatch: Swatch; groupId: string; groupName: string };

function CatalogSearchPopover({
  entries,
  selectedId,
  onPick,
}: {
  entries: CatalogEntry[];
  selectedId: string;
  onPick: (groupId: string, colorId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      ({ swatch, groupName }) =>
        swatch.name.toLowerCase().includes(q) || groupName.toLowerCase().includes(q),
    );
  }, [entries, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Search catalog colors"
          data-testid="button-catalog-search"
          className="inline-flex items-center justify-center rounded-full flex-shrink-0 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          style={{ width: 34, height: 34, color: SUBINK, border: `1px solid ${HAIRLINE}`, background: '#fff' }}
        >
          <Search className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        avoidCollisions
        collisionPadding={16}
        className="w-[480px] max-w-[calc(100vw-32px)] p-0 rounded-2xl overflow-hidden flex flex-col"
        style={{
          ...FROSTED_PANEL,
          // Never escape the viewport: bound by both an absolute cap and the
          // space Radix measures between the trigger and the collision edge.
          maxHeight: 'min(560px, calc(100vh - 32px), var(--radix-popover-content-available-height))',
        }}
        data-testid="popover-catalog-search"
      >
        {/* Pinned header — small-caps title + count, then the search pill */}
        <div className="flex-shrink-0" style={{ padding: '14px 18px', borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
              Colors in your catalog
            </span>
            <span className="text-[12px] tabular-nums" style={{ color: '#a1a1a6' }}>
              {entries.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: '#a1a1a6' }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-8 rounded-full text-[12.5px] placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
              style={{ border: `1px solid ${HAIRLINE}`, color: INK, background: '#fff' }}
              placeholder="Find a color…"
              data-testid="input-catalog-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                data-testid="button-catalog-clear"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full transition-colors hover:bg-slate-100"
                style={{ width: 18, height: 18, color: SUBINK }}
              >
                <X className="w-3 h-3" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable divided list — mini disc render + name + type */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {filtered.length === 0 ? (
            <div style={{ padding: '18px' }}>
              <p className="text-[12.5px]" style={{ color: '#a1a1a6' }}>
                No colors match.
              </p>
            </div>
          ) : (
            <ul>
              {filtered.map(({ swatch, groupId, groupName }) => {
                const on = swatch.id === selectedId;
                return (
                  <li key={`${groupId}-${swatch.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(groupId, swatch.id);
                        setQuery('');
                        setOpen(false);
                      }}
                      data-testid={`catalog-item-${swatch.id}`}
                      className="w-full flex items-center gap-3 text-left transition-colors hover:bg-slate-50 focus:outline-none"
                      style={{ padding: '11px 18px', borderBottom: `1px solid ${HAIRLINE}`, backgroundColor: on ? '#f0f7fc' : undefined }}
                    >
                      <VinylDisc size={40} swatch={swatch} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate" style={{ color: on ? BLUE : INK }}>
                          {swatch.name}
                        </div>
                        <div className="text-[11.5px]" style={{ color: SUBINK }}>
                          {groupName}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
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
          style={{ width: 100, height: 38, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: '0 12px', color: INK, background: '#fff' }}
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
        color: active ? '#ffffff' : INK,
        backgroundColor: active ? BLUE : '#fff',
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
                  Edit color. <span style={{ color: '#a1a1a6', fontWeight: 600 }}>{edit.name}.</span>
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
              <div className="rounded-xl bg-white" style={{ border: `1px solid ${HAIRLINE}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              className="w-full rounded-xl flex flex-col items-center justify-center text-center transition-colors hover:bg-slate-50 focus:outline-none"
              style={{ padding: '16px 12px', border: `1px dashed ${uploaded ? BLUE : '#d0d0d5'}`, background: uploaded ? '#f0f7fc' : '#fff' }}
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
                  <UploadCloud className="w-4 h-4" style={{ color: '#a1a1a6' }} />
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
            className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100"
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
          <button type="button" onClick={() => setOpen(false)} className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100" style={{ color: SUBINK }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!name.trim()} className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100 disabled:opacity-40" style={{ color: BLUE }} data-testid="button-add-group-confirm">
            Add type
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── The mode picker for a single run cell (three-way, no eye-guessing) ─
const MODE_META: Record<PriceMode, { label: string; hint: string; icon: typeof DollarSign; color: string }> = {
  priced: { label: 'Priced', hint: 'Show artists this package price', icon: DollarSign, color: READY },
  quote: { label: 'Quote on request', hint: 'Artist asks; you reply with a number', icon: HelpCircle, color: WARN },
  off: { label: 'Not offered', hint: 'This run size is hidden from artists', icon: MinusCircle, color: '#a1a1a6' },
};

function RunModePicker({ mode, onChange }: { mode: PriceMode; onChange: (m: PriceMode) => void }) {
  const [open, setOpen] = useState(false);
  const meta = MODE_META[mode];
  const MetaIcon = meta.icon;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-run-mode"
          className="flex items-center gap-1.5 rounded-full px-2.5 h-7 text-[11.5px] font-semibold transition-colors hover:bg-slate-50"
          style={{ border: `1px solid ${HAIRLINE}`, color: meta.color, backgroundColor: '#fff' }}
        >
          <MetaIcon className="w-3.5 h-3.5" />
          <span>{meta.label}</span>
          <ChevronDown className="w-3 h-3" style={{ color: '#a1a1a6' }} />
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
              className="w-full flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
              data-testid={`run-mode-${m}`}
            >
              <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: on ? '#f0f7fc' : CANVAS }}>
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

/** Compact three-way state control for one strip column — same menu as the
 *  big cards, but the trigger is a small icon + short label so six fit in a row. */
const MODE_SHORT: Record<PriceMode, string> = { priced: 'Priced', quote: 'Quote', off: 'Off' };

function CompactModePicker({ mode, onChange }: { mode: PriceMode; onChange: (m: PriceMode) => void }) {
  const [open, setOpen] = useState(false);
  const meta = MODE_META[mode];
  const MetaIcon = meta.icon;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-strip-mode"
          className="inline-flex items-center gap-1 rounded-full px-2 h-6 text-[11px] font-semibold transition-colors hover:bg-slate-50"
          style={{ color: meta.color }}
        >
          <MetaIcon className="w-3 h-3" />
          <span>{MODE_SHORT[mode]}</span>
          <ChevronDown className="w-2.5 h-2.5" style={{ color: '#a1a1a6' }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={6} className="w-64 p-1.5 rounded-2xl" style={{ border: `1px solid ${HAIRLINE}` }} data-testid="menu-strip-mode">
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
              className="w-full flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
              data-testid={`strip-mode-${m}`}
            >
              <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: on ? '#f0f7fc' : CANVAS }}>
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

/** The price book as ONE calm strip — six run sizes side by side, each with a
 *  real dollar input. Reads like the classic pricing table but stays editable. */
function PriceStrip({
  row,
  onMode,
  onPrice,
}: {
  row: Record<number, RunCell>;
  onMode: (qty: RunQty, m: PriceMode) => void;
  onPrice: (qty: RunQty, v: string) => void;
}) {
  return (
    <div style={{ marginTop: 18 }} data-testid="price-strip">
      {/* quiet add affordance — top right, outside the box */}
      <div className="flex justify-end" style={{ marginBottom: 8 }}>
        <button
          type="button"
          data-testid="button-add-run-size"
          className="flex items-center gap-1.5 rounded-full px-2.5 h-7 text-[12px] font-semibold transition-colors hover:bg-slate-100"
          style={{ color: SUBINK }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add run size
        </button>
      </div>
      {/* When the runs outgrow a row, Apple goes vertical — one run per line,
          like iCloud storage plans. Quantity left, price right. */}
      <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${HAIRLINE}` }}>
        {RUN_QTYS.map((q, i) => {
          const cell = row[q] ?? { mode: 'off', price: '' };
          const isPriced = cell.mode === 'priced';
          const isOff = cell.mode === 'off';
          return (
            <div
              key={q}
              className="group flex items-center justify-between"
              style={{
                padding: '12px 18px',
                borderTop: i > 0 ? `1px solid ${HAIRLINE}` : undefined,
                backgroundColor: isOff ? CANVAS : '#fff',
                opacity: isOff ? 0.75 : 1,
                transition: 'background-color 0.2s ease, opacity 0.2s ease',
              }}
              data-testid={`strip-row-${q}`}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-[15px] font-bold tabular-nums tracking-tight" style={{ color: INK }}>
                  {formatQty(q)}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>
                  units
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Priced is the normal state — control stays quiet until hover.
                    Quote / Off are the exceptions, so those stay visible. */}
                <div className={isPriced ? 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity' : undefined}>
                  <CompactModePicker mode={cell.mode} onChange={(m) => onMode(q, m)} />
                </div>
                {isPriced ? (
                  <label
                    className="flex items-center justify-center h-9 rounded-lg transition-shadow focus-within:ring-1 focus-within:ring-slate-300"
                    style={{ border: `1px solid ${HAIRLINE}`, background: '#fff', cursor: 'text', padding: '0 12px', minWidth: 92 }}
                    data-testid={`price-field-${q}`}
                  >
                    <span className="text-[13px] font-semibold" style={{ color: '#a1a1a6', marginRight: 1 }}>
                      $
                    </span>
                    <input
                      value={cell.price}
                      onChange={(e) => onPrice(q, e.target.value.replace(/[^0-9.]/g, ''))}
                      inputMode="decimal"
                      placeholder="0.00"
                      size={Math.max(cell.price.length, 4)}
                      data-testid={`input-price-${q}`}
                      className="text-[14px] font-semibold tabular-nums focus:outline-none"
                      style={{ color: INK, background: 'transparent', border: 'none', width: `${Math.max(cell.price.length, 4)}ch`, padding: 0 }}
                    />
                  </label>
                ) : (
                  <div
                    className="h-9 rounded-lg flex items-center justify-center text-[12px]"
                    style={{ border: `1px dashed ${HAIRLINE}`, color: '#a1a1a6', backgroundColor: isOff ? '#fff' : CANVAS, padding: '0 12px', minWidth: 92 }}
                  >
                    {cell.mode === 'quote' ? 'On request' : '—'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* caption floats under the box — no rule, just quiet text */}
      <div className="flex items-center justify-center" style={{ marginTop: 10 }}>
        <span className="text-[11.5px]" style={{ color: '#a1a1a6' }}>
          Prices are per unit, per finished package.
        </span>
      </div>
    </div>
  );
}

// ─── Print template file row ─────────────────────────────────────────
type TemplateFile = { key: string; label: string; sub: string; file?: string };

// Middle-truncate so the meaningful end of a filename ("…-template.pdf") survives.
function middleTruncate(s: string, max = 26): string {
  if (s.length <= max) return s;
  const keep = Math.floor((max - 1) / 2);
  return `${s.slice(0, max - 1 - keep)}…${s.slice(-keep)}`;
}

// Blueprint icons — line drawings of the actual piece, drawn like a die-line.
// Solid strokes are edges; dashed strokes are folds, holes, and hidden parts.
// (Same canon as the artist package builder — one icon language on both sides.)
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
    case 'jacket': // square jacket, record peeking out the right
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

function TemplateRow({ tf, onAttach, onRemove }: { tf: TemplateFile; onAttach: () => void; onRemove: () => void }) {
  const has = !!tf.file;

  // Empty slot — the visible invitation. Dashed, one clear action.
  if (!has) {
    return (
      <button
        type="button"
        onClick={onAttach}
        data-testid={`template-upload-${tf.key}`}
        className="flex flex-col items-center justify-center rounded-xl transition-colors hover:bg-white focus:outline-none"
        style={{ border: '1.5px dashed #d1d1d6', padding: '18px 12px', cursor: 'pointer', background: 'transparent' }}
      >
        <span style={{ opacity: 0.55 }}>
          <BlueprintIcon kind={tf.key} />
        </span>
        <div className="text-[13px] font-semibold" style={{ color: INK, marginTop: 8 }}>
          {tf.label}
        </div>
        <div className="text-[11.5px] font-semibold" style={{ color: BLUE, marginTop: 3 }}>
          Upload or paste a link
        </div>
      </button>
    );
  }

  // Filled slot — calm and complete. Replace appears only on hover.
  return (
    <div
      className="group relative flex flex-col items-center justify-center rounded-xl bg-white text-center"
      style={{ border: `1px solid ${HAIRLINE}`, padding: '18px 12px' }}
      data-testid={`template-${tf.key}`}
    >
      <BlueprintIcon kind={tf.key} />
      <div className="text-[13px] font-semibold" style={{ color: INK, marginTop: 8 }}>
        {tf.label}
      </div>
      <div className="text-[11.5px] tabular-nums" style={{ color: SUBINK, marginTop: 3 }} title={tf.file}>
        {middleTruncate(tf.file!)}
      </div>
      <button
        type="button"
        onClick={onRemove}
        data-testid={`template-remove-${tf.key}`}
        className="absolute top-2 right-2 text-[11.5px] font-semibold rounded-full px-2.5 h-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-100"
        style={{ color: SUBINK }}
      >
        Replace
      </button>
    </div>
  );
}

// ─── Audio spec — the plant's cutting requirements ───────────────────
function AudioField({
  value,
  onChange,
  placeholder,
  suffix,
  wch = 4,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix: string;
  wch?: number;
  testId: string;
}) {
  return (
    <label
      className="flex items-center justify-center h-9 rounded-lg transition-shadow focus-within:ring-1 focus-within:ring-slate-300"
      style={{ border: `1px solid ${HAIRLINE}`, background: '#fff', cursor: 'text', padding: '0 10px' }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        inputMode="decimal"
        placeholder={placeholder}
        data-testid={testId}
        className="text-[14px] font-semibold tabular-nums text-center focus:outline-none"
        style={{ color: INK, background: 'transparent', border: 'none', width: `${wch}ch`, padding: 0 }}
      />
      <span className="text-[11px] font-semibold" style={{ color: '#a1a1a6', marginLeft: 5 }}>
        {suffix}
      </span>
    </label>
  );
}

function AudioSpecCard({ onEdit }: { onEdit: () => void }) {
  const [bit, setBit] = useState('24');
  const [rate, setRate] = useState('44.1');
  const [s7a, setS7a] = useState('');
  const [s7b, setS7b] = useState('');
  const [s10a, setS10a] = useState('');
  const [s10b, setS10b] = useState('');
  const [s12a, setS12a] = useState('22');
  const [s12b, setS12b] = useState('');
  const [notes, setNotes] = useState('');
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    onEdit();
  };
  const rows: { label: string; sub?: string; controls: React.ReactNode }[] = [
    {
      label: 'Minimum bit depth',
      sub: 'Default: 24-bit',
      controls: <AudioField value={bit} onChange={edit(setBit)} placeholder="24" suffix="bit" testId="input-audio-bit" />,
    },
    {
      label: 'Minimum sample rate',
      sub: 'Default: no minimum',
      controls: <AudioField value={rate} onChange={edit(setRate)} placeholder="—" suffix="kHz" wch={5} testId="input-audio-rate" />,
    },
    {
      label: 'Longest side — 7"',
      controls: (
        <div className="flex items-center gap-2">
          <AudioField value={s7a} onChange={edit(setS7a)} placeholder="8" suffix="min at 33⅓" wch={3} testId="input-audio-7-33" />
          <AudioField value={s7b} onChange={edit(setS7b)} placeholder="6" suffix="min at 45" wch={3} testId="input-audio-7-45" />
        </div>
      ),
    },
    {
      label: 'Longest side — 10"',
      controls: (
        <div className="flex items-center gap-2">
          <AudioField value={s10a} onChange={edit(setS10a)} placeholder="15" suffix="min at 33⅓" wch={3} testId="input-audio-10-33" />
          <AudioField value={s10b} onChange={edit(setS10b)} placeholder="12" suffix="min at 45" wch={3} testId="input-audio-10-45" />
        </div>
      ),
    },
    {
      label: 'Longest side — 12"',
      controls: (
        <div className="flex items-center gap-2">
          <AudioField value={s12a} onChange={edit(setS12a)} placeholder="22" suffix="min at 33⅓" wch={3} testId="input-audio-12-33" />
          <AudioField value={s12b} onChange={edit(setS12b)} placeholder="16" suffix="min at 45" wch={3} testId="input-audio-12-45" />
        </div>
      ),
    },
  ];
  return (
    <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${HAIRLINE}`, marginTop: 12 }} data-testid="audio-spec-card">
      {rows.map((r, i) => (
        <div
          key={r.label}
          className="flex items-center justify-between"
          style={{ padding: '12px 18px', borderTop: i > 0 ? `1px solid ${HAIRLINE}` : undefined }}
        >
          <div>
            <div className="text-[13.5px] font-semibold" style={{ color: INK }}>
              {r.label}
            </div>
            {r.sub && (
              <div className="text-[11.5px]" style={{ color: '#a1a1a6', marginTop: 2 }}>
                {r.sub}
              </div>
            )}
          </div>
          {r.controls}
        </div>
      ))}
      {/* Notes — quiet context for operators */}
      <div style={{ padding: '12px 18px', borderTop: `1px solid ${HAIRLINE}` }}>
        <div className="text-[13.5px] font-semibold" style={{ color: INK }}>Notes</div>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); onEdit(); }}
          placeholder="Optional context for operators — e.g. where these numbers come from."
          data-testid="input-audio-notes"
          rows={2}
          className="w-full text-[13px] focus:outline-none resize-none"
          style={{ color: INK, background: 'transparent', border: 'none', marginTop: 4, padding: 0, lineHeight: 1.45 }}
        />
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────
export function PressPackagePricingTableRuns() {
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
    { key: 'booklet', label: 'Booklet', sub: 'Lyric & photo booklet template' },
  ]);

  const product = useMemo(() => PRODUCT_TYPES.find((p) => p.id === productTypeId) ?? PRODUCT_TYPES[1], [productTypeId]);
  const [groups, setGroups] = useState<ColorGroup[]>(COLOR_GROUPS);
  const activeGroup = useMemo(() => groups.find((g) => g.id === activeGroupId) ?? groups[0], [groups, activeGroupId]);
  // Remember the picked color per group so flipping between types keeps each pick.
  const [colorSel, setColorSel] = useState<Record<string, string>>({});
  const selectedColor = activeGroup.colors.find((c) => c.id === colorSel[activeGroup.id]) ?? activeGroup.colors[0];
  const previewSwatch = selectedColor ?? activeGroup.swatch;

  const renameGroup = (id: string, name: string, sizes: string[]) => {
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, name, sizes } : g)));
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
    setGroups((gs) => [...gs, { id, name, blurb: '', swatch, colors: [], sizes: ['7"', '10"', '12"'] }]);
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
  };
  // Reordering is an explicit MODE — tiles are never draggable at rest, so a
  // stray cursor can't shuffle the catalog. Enter the mode, drag, then Done
  // commits or Cancel restores the order you started with.
  const [dragColorId, setDragColorId] = useState<string | null>(null);
  const [reorderColorsOn, setReorderColorsOn] = useState(false);
  const [reorderTypesOn, setReorderTypesOn] = useState(false);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  // Snapshot taken when a reorder mode is entered; Cancel restores it.
  const orderSnapshot = useRef<ColorGroup[] | null>(null);
  const beginReorder = (which: 'colors' | 'types') => {
    orderSnapshot.current = groups;
    if (which === 'colors') setReorderColorsOn(true);
    else setReorderTypesOn(true);
  };
  const endReorder = (which: 'colors' | 'types', commit: boolean) => {
    if (!commit && orderSnapshot.current) setGroups(orderSnapshot.current);
    orderSnapshot.current = null;
    setDragColorId(null);
    setDragGroupId(null);
    if (which === 'colors') setReorderColorsOn(false);
    else setReorderTypesOn(false);
    if (commit) setDirty(true);
  };
  const reorderColor = (groupId: string, fromId: string, toId: string) => {
    if (fromId === toId) return;
    setGroups((gs) =>
      gs.map((g) => {
        if (g.id !== groupId) return g;
        const arr = [...g.colors];
        const f = arr.findIndex((c) => c.id === fromId);
        const t = arr.findIndex((c) => c.id === toId);
        if (f < 0 || t < 0) return g;
        const [moved] = arr.splice(f, 1);
        arr.splice(t, 0, moved);
        return { ...g, colors: arr };
      }),
    );
  };
  const reorderGroup = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setGroups((gs) => {
      const arr = [...gs];
      const f = arr.findIndex((g) => g.id === fromId);
      const t = arr.findIndex((g) => g.id === toId);
      if (f < 0 || t < 0) return gs;
      const [moved] = arr.splice(f, 1);
      arr.splice(t, 0, moved);
      return arr;
    });
  };
  // Flat list of every color across all types — feeds the find-a-color search.
  const catalogList = useMemo(
    () => groups.flatMap((g) => g.colors.map((c) => ({ swatch: c, groupId: g.id, groupName: g.name }))),
    [groups],
  );
  const selectFromCatalog = (groupId: string, colorId: string) => {
    setActiveGroupId(groupId);
    setColorSel((prev) => ({ ...prev, [groupId]: colorId }));
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
    <PressShell>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        {/* Page header + save */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="tracking-tight" style={{ color: INK, fontSize: 32, lineHeight: 1.1, fontWeight: 700 }}>
              Catalog
            </h1>
            {/* Format switcher — vinyl live, CD & cassette coming. Apple: present the future, quietly. */}
            <div
              className="inline-flex items-center rounded-full"
              style={{ marginTop: 16, padding: 3, backgroundColor: '#ececf0' }}
              role="tablist"
              aria-label="Catalog format"
            >
              {[
                { label: 'Vinyl', enabled: true },
                { label: 'CD', enabled: false },
                { label: 'Cassette', enabled: false },
              ].map((f) => (
                <button
                  key={f.label}
                  type="button"
                  role="tab"
                  aria-selected={f.enabled}
                  aria-disabled={!f.enabled}
                  title={f.enabled ? undefined : 'Coming'}
                  data-testid={`format-${f.label.toLowerCase()}`}
                  className="rounded-full transition-colors"
                  style={{
                    padding: '6px 18px',
                    fontSize: 13.5,
                    fontWeight: f.enabled ? 600 : 500,
                    color: f.enabled ? INK : '#b6b6bb',
                    backgroundColor: f.enabled ? '#ffffff' : 'transparent',
                    boxShadow: f.enabled ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                    cursor: f.enabled ? 'pointer' : 'default',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 24 }}>
              <SectionLabel>Vinyl · Package pricing</SectionLabel>
              <PageHeading lead="Build your vinyl catalog." rest="From scratch." />
            </div>
            <p className="text-[15px]" style={{ color: SUBINK, marginTop: 12, maxWidth: 560, lineHeight: 1.5 }}>
              Quote the way you already do — a single cost per finished package, per run size. Record, jacket,
              inner sleeve, and labels are all in it. No per-piece math.
            </p>
          </div>
        </div>

        {/* Save bar — appears only when there's something to save. Apple shows the action
            when it matters, not a parked button in the header. */}
        {dirty && (
          <div
            className="fixed left-1/2 flex items-center gap-4 rounded-full"
            style={{
              bottom: 28,
              transform: 'translateX(-50%)',
              zIndex: 40,
              padding: '10px 12px 10px 22px',
              backgroundColor: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${HAIRLINE}`,
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            }}
            data-testid="save-bar"
          >
            <span className="text-[13px]" style={{ color: SUBINK }}>
              Edited
            </span>
            <Button
              onClick={handleSave}
              className="text-white hover:opacity-90 rounded-full"
              style={{ backgroundColor: BLUE, borderColor: BLUE, paddingLeft: 22, paddingRight: 22 }}
              data-testid="button-save-catalog"
            >
              <Check className="w-4 h-4" />
              Save catalog
            </Button>
          </div>
        )}

        <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

        {/* Two-column body — big open-air disc left, thin working column right */}
        <div className="grid gap-16" style={{ gridTemplateColumns: 'minmax(0, 1fr) 620px' }}>
          {/* LEFT — the record itself, no card around it */}
          <div
            className="flex flex-col items-center justify-center"
            style={{ position: 'sticky', top: 24, alignSelf: 'start', minHeight: 560, paddingTop: 24 }}
          >
            <JacketStage swatch={previewSwatch} product={product} />
            {/* Captions — shifted left so they center under the jacket, not the whole stage */}
            <div className="flex flex-col items-center" style={{ transform: `translateX(-${Math.round(300 * (product.inches / 12) * 0.25)}px)` }}>
              <div className="flex items-center gap-2.5 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
                <ColorBall swatch={previewSwatch} size={18} />
                <span>{product.inches}"</span>
                <span style={{ color: '#d1d1d6' }}>·</span>
                <span>{activeGroup.name}</span>
                <span style={{ color: '#d1d1d6' }}>·</span>
                <span className="font-semibold" style={{ color: INK }}>
                  {selectedColor?.name ?? activeGroup.swatch.name}
                </span>
              </div>
              <div className="text-[12px] text-center" style={{ marginTop: 8, marginBottom: 16, color: '#a1a1a6', lineHeight: 1.4 }}>
                {product.inches < 12 ? (
                  <>Printed jacket included.</>
                ) : (
                  <>Printed jacket and inner sleeve included.</>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — color groups + price book + templates.
              Sits above the jacket stage so the sliding record never paints over it. */}
          <div className="min-w-0" style={{ position: 'relative', zIndex: 2, backgroundColor: CANVAS }}>
            {/* Pick a size — first step, same cards as the color setup screen */}
            <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
              <span style={{ color: INK }}>Pick a size. </span>
              <span style={{ color: '#a1a1a6' }}>Prices follow the record.</span>
            </h2>
            <div style={{ marginTop: 14, display: 'flex', gap: 12 }}>
              {PRODUCT_TYPES.map((p) => {
                const active = p.id === productTypeId;
                const [big, ...rest] = p.name.split(' ');
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProductTypeId(p.id)}
                    aria-pressed={active}
                    data-testid={`product-type-${p.id}`}
                    className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
                    style={{ flex: 1, padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
                  >
                    <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{big}</div>
                    <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6' }}>{rest.join(' ')}</div>
                  </button>
                );
              })}
            </div>

            <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

            {/* Pick a type */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
                <span style={{ color: INK }}>Pick a type. </span>
                <span style={{ color: '#a1a1a6' }}>Each keeps its own package prices.</span>
              </h2>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <span className="text-[12px] tabular-nums" style={{ color: '#a1a1a6' }}>
                  {catalogList.length} colors
                </span>
                <CatalogSearchPopover
                  entries={catalogList}
                  selectedId={selectedColor?.id ?? ''}
                  onPick={selectFromCatalog}
                />
                <ReorderControls
                  on={reorderTypesOn}
                  onBegin={() => beginReorder('types')}
                  onCommit={() => endReorder('types', true)}
                  onCancel={() => endReorder('types', false)}
                  testId="types"
                />
              </div>
            </div>
            {reorderTypesOn && (
              <p className="text-[12.5px]" style={{ marginTop: 6, color: BLUE }}>
                Drag a type onto another to move it — artists see this order. Done keeps it, Cancel puts everything back.
              </p>
            )}
            <div className="grid grid-cols-4 gap-3" style={{ marginTop: 12 }}>
              {groups.map((g) => (
                <div
                  key={g.id}
                  draggable={reorderTypesOn}
                  onDragStart={(e) => {
                    if (!reorderTypesOn) return;
                    setDragGroupId(g.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (!reorderTypesOn) return;
                    e.preventDefault();
                    if (dragGroupId && dragGroupId !== g.id) reorderGroup(dragGroupId, g.id);
                  }}
                  onDragEnd={() => setDragGroupId(null)}
                  style={{
                    opacity: dragGroupId === g.id ? 0.45 : 1,
                    cursor: reorderTypesOn ? (dragGroupId ? 'grabbing' : 'grab') : undefined,
                  }}
                >
                  <ColorGroupCard
                    group={g}
                    active={g.id === activeGroupId}
                    count={pricedCount(book, g.id)}
                    canRemove={groups.length > 1}
                    onSelect={() => setActiveGroupId(g.id)}
                    onRename={(name, sizes) => renameGroup(g.id, name, sizes)}
                    onRemove={() => removeGroup(g.id)}
                  />
                </div>
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
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f0f7fc')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Plus className="w-3.5 h-3.5" />
                  More types
                </button>
              }
            />

            <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

            {/* Pick a color */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
                <span style={{ color: INK }}>Pick a color. </span>
                <span style={{ color: '#a1a1a6' }}>Or add a new one.</span>
              </h2>
              <ReorderControls
                on={reorderColorsOn}
                onBegin={() => beginReorder('colors')}
                onCommit={() => endReorder('colors', true)}
                onCancel={() => endReorder('colors', false)}
                testId="colors"
              />
            </div>
            <p className="text-[12.5px]" style={{ marginTop: 6 }}>
              <span className="font-semibold" style={{ color: INK }}>{activeGroup.name}</span>
              <span style={{ color: reorderColorsOn ? BLUE : '#a1a1a6' }}>
                {' '}· {activeGroup.colors.length} colors ·{' '}
                {reorderColorsOn
                  ? 'drag a color onto another to move it — Done keeps it, Cancel puts everything back'
                  : 'artists see this order'}
              </span>
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
                    draggable={reorderColorsOn}
                    onDragStart={(e) => {
                      if (!reorderColorsOn) return;
                      setDragColorId(c.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (!reorderColorsOn) return;
                      e.preventDefault();
                      if (dragColorId && dragColorId !== c.id) reorderColor(activeGroup.id, dragColorId, c.id);
                    }}
                    onDragEnd={() => setDragColorId(null)}
                    className="group relative rounded-2xl bg-white text-center transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
                    style={{
                      padding: '16px 10px 12px',
                      border: on ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                      opacity: dragColorId === c.id ? 0.45 : 1,
                      cursor: reorderColorsOn ? (dragColorId ? 'grabbing' : 'grab') : undefined,
                    }}
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
                          style={{ width: 18, height: 18, backgroundColor: 'rgba(255,255,255,0.85)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
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
                    style={{ padding: '16px 10px 12px', border: `1.5px dashed #c7c7cc`, minHeight: 104 }}
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
              <span style={{ color: '#a1a1a6' }}>Per package, per run.</span>
            </h2>
            <p className="text-[12.5px]" style={{ marginTop: 6 }}>
              <span className="font-semibold" style={{ color: INK }}>{activeGroup.name}</span>
              <span style={{ color: '#a1a1a6' }}>
                {activeGroup.colors.length > 0
                  ? ` · one price covers all ${activeGroup.colors.length} colors`
                  : ' · add colors in the step above'}
              </span>
            </p>

            <PriceStrip row={row} onMode={handleMode} onPrice={handlePrice} />

            <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

            {/* Turnaround */}
            <div>
              <TurnaroundCard min={turnMin} max={turnMax} onMin={(v) => { setTurnMin(v); setDirty(true); }} onMax={(v) => { setTurnMax(v); setDirty(true); }} />
            </div>

            <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

            {/* Print templates (secondary) */}
            <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
              <span style={{ color: INK }}>Print templates. </span>
              <span style={{ color: '#a1a1a6' }}>Artwork specs for artists.</span>
            </h2>
            <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
              Attach a file or paste a link. Optional and quiet.
            </p>
            <div className="grid grid-cols-3 gap-3" style={{ marginTop: 12 }}>
              {templates.map((tf) => (
                <TemplateRow key={tf.key} tf={tf} onAttach={() => doAttach(tf.key)} onRemove={() => removeTemplate(tf.key)} />
              ))}
            </div>

            <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

            {/* Audio spec */}
            <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
              <span style={{ color: INK }}>Audio spec. </span>
              <span style={{ color: '#a1a1a6' }}>What the lathe can cut.</span>
            </h2>
            <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
              Leave a field blank to inherit the press default — the gray numbers. These drive each album's audio preflight.
            </p>
            <AudioSpecCard onEdit={() => setDirty(true)} />
          </div>
        </div>
      </div>
    </PressShell>
  );
}

export default PressPackagePricingTableRuns;
