// PressQuoteBuilder — ONE continuous, Apple-buy-flow-style page (like
// apple.com/shop/buy-ipad) where a press builds a quote for a client.
//
// Every section is the EXACT screen already built for the catalog, stacked
// into a single scroll and wired to shared state:
//   1. Add your vinyl        — PressVinylColorSetup (disc kit, spin, swatches)
//   2. Choose your jacket    — ArtistChooseJacket (JacketStage + JacketTile)
//   3. Choose your inner sleeve — ArtistChooseInnerSleeve (SleeveStage + tiles)
//   4. Center labels         — PressCatalogVinylLabels (LabelDisc + LabelTile)
//   5. Choose your inserts   — ArtistChooseInserts (InsertStage + tiles, + None)
//   6. Stickers              — PressCatalogStickers (Sticker + ShapeTile, + None)
//   7. Save to Catalog › Vinyl › Quotes
//
// The record size is chosen ONCE in section 1 and flows through everything.
// A frosted running-total bar stays pinned at the top.
// Components below are copied verbatim from their donor files.

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import {
  RotateCcw,
  Eye,
  EyeOff,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAdminDark } from '@/lib/adminAppearance';
import { PRESS_MARK_ON_DARK, PRESS_MARK_ON_LIGHT } from '@/lib/pressMark';
import type { PressComponentsPayload } from '@shared/pressComponents';
import { makeQuotePricer, pricedSum, pendingLines, type QuoteLine } from './quotePricing';
import { PressLogoImg, usePressBrand, usePressCatalogSwatches } from './PressPackageBuilder';
import californialandCover from './assets/californialand-cover.jpg';
import californialandInnerSleeve from './assets/californialand-inner-sleeve.png';
import rubyVinylPhoto from './assets/mrp-ruby-translucent.png';
import niinaLabelArt from './assets/niina-label-1.png';

// ── Per-press label branding ─────────────────────────────────────────
const PRESS_LABEL_BG = '#0a0a0a';


// ─── Brand tokens (Apple calm visual language) ──────────────────────
const BLUE = '#319ED8';
// Per-press white-label accent (founder, Aug 16 2026): each press's spec strip
// carries its own brand complement — MRP's is the gold of their site's CTA.
const PRESS_ACCENT = '#D6A63F';
// Press name shown in body copy ("N weights available from …") — verbatim
// from the handoff. Lived on the deleted shell; kept here as the body still
// references it. (Per-press white-label; MRP's name for now.)
// PARTNER_NAME removed (gogoods, Aug 19 2026) — prose uses the brand context now.
// Theme-aware via CSS variables (Bill, Aug 16 2026: canon press shell, dark
// default). Values are set in Q_THEME_CSS below; product visuals (jackets,
// sleeves, discs) keep their real hex colors — vinyl is vinyl in any theme.
const INK = 'var(--q-ink)';
const SUBINK = 'var(--q-subink)';
const HAIRLINE = 'var(--q-hairline)';
const CANVAS = 'var(--q-canvas)';
const PILL_SHADOW = 'var(--q-pill-shadow)';

// Vars scope to the builder root (.q-create-root) so the surrounding portal
// chrome is untouched. Dark mode rides the portal's body.gt-admin-dark class
// (useAdminDark) — NOT the mock's html[data-gt-dark]. The <style> tag mounts
// only while the builder is mounted; tailwind-class remaps stay scoped.
const Q_THEME_CSS = String.raw`
.q-create-root { --q-ink:#1d1d1f; --q-subink:#6e6e73; --q-hairline:#e6e6ea; --q-canvas:#f5f5f7; --q-rail:#f5f5f7; --q-card:#ffffff; --q-track:#f2f2f5; --q-frost:rgba(255,255,255,0.78); --q-pill-shadow:0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04); --q-accent-ink:#9a7422; }
body.gt-admin-dark .q-create-root { --q-ink:#f5f5f7; --q-subink:#98989d; --q-hairline:rgba(255,255,255,0.12); --q-canvas:#161617; --q-rail:#1c1c1e; --q-card:#2a2a2d; --q-track:rgba(255,255,255,0.08); --q-frost:rgba(22,22,23,0.72); --q-pill-shadow:0 1px 3px rgba(0,0,0,0.5); --q-accent-ink:#e2bf6a; }
body.gt-admin-dark .q-create-root .bg-white { background-color: var(--q-card) !important; }
body.gt-admin-dark .q-create-root .hover\:bg-slate-50:hover, body.gt-admin-dark .q-create-root .hover\:bg-slate-100:hover, body.gt-admin-dark .q-create-root .hover\:bg-slate-200:hover, body.gt-admin-dark .q-create-root .hover\:bg-black\/5:hover { background-color: rgba(255,255,255,0.07) !important; }
body.gt-admin-dark .q-create-root .ring-slate-200 { --tw-ring-color: rgba(255,255,255,0.15); }
body.gt-admin-dark .q-create-root .placeholder\:text-slate-400::placeholder { color: rgba(255,255,255,0.30); }
body.gt-admin-dark .q-create-root .hover\:text-slate-600:hover { color: #d0d0d5 !important; }
`;

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Vinyl layer kit (from SplatterVinylPreview) ─────────────────────
const LAYERS = {
  opaque: '/vinyl-layers/opaque-vinyl.png',
  translucent: '/vinyl-layers/translucent-vinyl.png',
  splatter1: '/vinyl-layers/splatter-one.png',
  splatter2: '/vinyl-layers/splatter-two.png',
  splatter3: '/vinyl-layers/splatter-three.png',
  highlights: '/vinyl-layers/vinyl-highlights.png',
  inner: '/vinyl-layers/inner-circle.png',
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
  const bodyRef = useRef<HTMLDivElement>(null);
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
        background: 'var(--q-card)',
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
type SwatchKind = 'black' | 'opaque' | 'translucent' | 'splatter' | (string & {});
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
  /** Real press photo of this color — used instead of the layered render. */
  photo?: string;
};

// The white MRP logo mark + quiet arc text — printed on the black label.
function DiscLabelArt({ size }: { size: number }) {
  const { shortName } = usePressBrand();
  const showArcText = size >= 70;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      <PressLogoImg
        
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
          filter: PRESS_MARK_ON_DARK,
        }}
      />
      {showArcText && (
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <path id="quote-disc-arc-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill="rgba(245,245,247,0.5)" style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#quote-disc-arc-bottom" startOffset="50%" textAnchor="middle">
              {`${shortName}-001 · 33 ⅓ RPM`}
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
  labelOverlay,
}: {
  size: number;
  swatch: Swatch;
  labelRatio?: number;
  bodyRef?: React.RefObject<HTMLDivElement>;
  /** Custom center-label content rendered inside the spinning body. */
  labelOverlay?: React.ReactNode;
}) {
  const LABEL_RATIO = labelRatio ?? 368 / 1104;
  const INNER_RATIO = 129 / 1104;
  const holeRatio = 0.018;
  const translucent = swatch.kind === 'translucent';
  const isSplatter = swatch.kind === 'splatter';

  // Real press photo (Bill, Aug 16 2026): show it verbatim — the label and
  // sheen are baked into the shot. Circle-crop with a slight zoom to trim
  // the black frame around the record.
  if (swatch.photo) {
    return (
      <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
        <div ref={bodyRef} style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', willChange: bodyRef ? 'transform' : undefined }}>
          <img
            src={swatch.photo}
            alt=""
            aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.13)' }}
          />
          {/* Press center label — same treatment as the catalog color-setup
              page (PressVinylColors), which always stamps the press's label
              over swatch photos. Skipped only when the caller provides its
              own custom label content. */}
          {!labelOverlay && (
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
              <DiscLabelArt size={size * LABEL_RATIO} />
            </div>
          )}
          {labelOverlay}
        </div>
        {/* Fixed sheen — same non-rotating highlight pass as the layered render */}
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
      </div>
    );
  }

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
          {/* Logo at every size (catalog color-setup parity) — arc text
              inside DiscLabelArt still gates itself to large discs. */}
          <DiscLabelArt size={size * LABEL_RATIO} />
        </div>
        {labelOverlay}

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
// Largest-first, no marketing words — size-pill canon (Aug 2026).
const VINYL_SIZES = [
  { id: '12' as SizeId, label: '12"', note: '' },
  { id: '10' as SizeId, label: '10"', note: '' },
  { id: '7' as SizeId,  label: '7"',  note: '' },
];

// Press-run quantities + discount curve (from PressCatalogPricing).
const DISC_COUNTS = [
  { n: 1, label: '1 LP', note: 'Single disc' },
  { n: 2, label: '2 LP', note: 'Double' },
  { n: 3, label: '3 LP', note: 'Triple' },
  { n: 4, label: '4 LP', note: 'Box set' },
];

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
  qsw('T01', 'Ruby',   'translucent', 'Translucent', '#C81E38', 2.30, { photo: rubyVinylPhoto }),
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
        {/* Mini vinyl with the press's label — same "already done" treatment
            as the catalog color-setup page, instead of a flat color dot
            (which rendered as a plain dark ball for photo-only colors). */}
        <VinylDisc size={40} swatch={swatch} />
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
        <PressLogoImg  alt="" aria-hidden style={{ width: size * THUMB_LOGO, height: size * THUMB_LOGO, objectFit: 'contain', filter: PRESS_MARK_ON_DARK, opacity: 0.90 }} />
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
                <PressLogoImg  alt="" aria-hidden style={{ width: THUMB * THUMB_LOGO, height: THUMB * THUMB_LOGO, objectFit: 'contain', filter: PRESS_MARK_ON_DARK, opacity: 0.90 }} />
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
                <PressLogoImg  alt="" aria-hidden style={{ width: THUMB * THUMB_LOGO, height: THUMB * THUMB_LOGO, objectFit: 'contain', filter: PRESS_MARK_ON_DARK, opacity: 0.90 }} />
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
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: 'var(--q-track)', border: `1px solid ${HAIRLINE}` }}>
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
                      background: vActive ? 'var(--q-card)' : 'transparent',
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
          <PressLogoImg  alt="" aria-hidden style={{ width: JS * 0.52, height: JS * 0.52, objectFit: 'contain', filter: PRESS_MARK_ON_DARK, opacity: 0.92 }} />
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
                <PressLogoImg  alt="" aria-hidden style={{
                  width: HOLE_D * 0.56, height: HOLE_D * 0.56,
                  objectFit: 'contain',
                  filter: PRESS_MARK_ON_LIGHT,
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
            background: 'var(--q-card)',
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
        <PressLogoImg  alt="" aria-hidden style={{ width: logoSize, height: logoSize, objectFit: 'contain', filter: PRESS_MARK_ON_DARK, opacity: 0.92 }} />
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
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: 'var(--q-track)', border: `1px solid ${HAIRLINE}` }}>
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
                      background: vActive ? 'var(--q-card)' : 'transparent',
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
  const { shortName } = usePressBrand();
  const showArcText = size >= 70 && !offsetRight;
  const arcTextFill = whiteFilter ? 'rgba(245,245,247,0.55)' : 'rgba(0,0,0,0.38)';
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      <PressLogoImg
        
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
          filter: whiteFilter ? PRESS_MARK_ON_DARK : PRESS_MARK_ON_LIGHT,
        }}
      />
      {showArcText && (
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <path id="quote-lbl-arc-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill={arcTextFill} style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#quote-lbl-arc-bottom" startOffset="50%" textAnchor="middle">
              {`${shortName}-001 · 33 ⅓ RPM`}
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
  bodyRef?: React.RefObject<HTMLDivElement>;
  holeRatio?: number;
  labelRatio?: number;
  offsetLogo?: boolean;
  swatch?: Swatch;
}) {
  const LABEL_RATIO = labelRatio ?? (3.94 / 12);
  const INNER_RATIO = 129 / 1104;
  // Photo discs: the shot's baked-in label (plus its dark rim) reads slightly
  // larger than our drawn ratio — size the overlay up so it covers it fully.
  const labelSize = size * (swatch?.photo ? 0.40 : LABEL_RATIO);
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
        {swatch?.photo ? (
          /* Real press photo (Bill, Aug 16 2026) — spins with the body; the
             chosen label style overlays the photo's baked-in label below. */
          <img
            src={swatch.photo}
            alt=""
            aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.13)' }}
          />
        ) : swatch ? (
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

const insertsAvailableForSize = (sizeId: SizeId): boolean =>
  INSERT_OPTIONS.filter((o) => !o.sizes || o.sizes.includes(sizeId)).length > 1;
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
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: 'var(--q-track)', border: `1px solid ${HAIRLINE}` }}>
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
                      background: vActive ? 'var(--q-card)' : 'transparent',
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
          <PressLogoImg
            
            alt=""
            aria-hidden
            style={{ width: minDim * 0.52, height: minDim * 0.52, objectFit: 'contain', filter: PRESS_MARK_ON_LIGHT }}
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
type StepKey = 'size' | 'discs' | 'qty' | 'weight' | 'ctype' | 'color' | 'jacket' | 'sleeve' | 'hole' | 'label' | 'insert' | 'sticker';
const STEP_ORDER: StepKey[] = ['size', 'discs', 'weight', 'ctype', 'color', 'jacket', 'sleeve', 'hole', 'label', 'insert', 'sticker', 'qty'];

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

// ─── Honest per-press pricing (Task #3243) ────────────────────────────
// Blind-quote flow (Bill, Aug 16 2026): staff builds without a client, then
// searches the real client roster at save time (see the useQuery in the page).
//
// The hard-coded demo defaults (calibrated to the frozen MRP 071526-02
// estimate) are GONE. Every line now resolves ONLY from the press's Pricing
// component rows via makeQuotePricer (quotePricing.ts): a component with no
// real price is an explicit "Pricing pending / custom quote" line — excluded
// from the total, and it blocks the send-to-artist path (drafts still save).
//
// Press minimum (Bill, Aug 16 2026): the press won't run splatter under 300
// units — those quantity cards gray out as "Unavailable", no price shown.
const DEFAULT_KIND_MIN_QTY: Record<string, number> = { splatter: 300 };

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
export function PressQuoteBuilder({ pressId, estimateId, canEdit, onExit }: { pressId: string; estimateId: string | null; canEdit: boolean; onExit: (dest?: "estimates" | "packages") => void }) {
  const { shortName: pressBrandShort, name: pressBrandName } = usePressBrand();
  // Dark mode rides the portal's body.gt-admin-dark (useAdminDark) — the mock's
  // per-mount html[data-gt-dark] chrome is gone. Subscribing keeps token-driven
  // inline values (frosted shadows, disc rims) in step with the operator toggle.
  useAdminDark();

  // ── Real client roster (replaces MOCK_CLIENTS) ──
  // Same endpoint the portal's People tab reads; we map to the string[] of
  // names the builder's Add-a-person search expects. Empty roster → [].
  const { data: rosterPeople } = useQuery<Array<{ name?: string | null }>>({
    queryKey: [`/api/press/${pressId}/people`],
  });
  const clientRoster = useMemo(
    () =>
      (rosterPeople ?? [])
        .map((p) => (typeof p?.name === 'string' ? p.name.trim() : ''))
        .filter((n) => n.length > 0),
    [rosterPeople],
  );

  // ── Per-press component prices (overlay demo defaults) ──
  const { data: components } = useQuery<PressComponentsPayload>({
    queryKey: [`/api/press/${pressId}/components`],
  });
  const pricer = useMemo(() => makeQuotePricer(components?.pricing?.rows), [components]);

  // ── Shared state — the record size flows through every section ──
  const [sizeId, setSizeId] = useState<SizeId>('12');
  const [discs, setDiscs] = useState<number>(1);
  const [pkgNaming, setPkgNaming] = useState(false);
  const [pkgName, setPkgName] = useState('');
  const [pkgSaved, setPkgSaved] = useState(false);
  const [qty, setQty] = useState<number>(500);
  const [weightId, setWeightId] = useState<string>('140');
  const [colorId, setColorId] = useState<string>('BK1');
  const [colorKind, setColorKind] = useState<SwatchKind>('black');

  const [jacketId, setJacketId] = useState<string>('single');
  const [jacketVariantId, setJacketVariantId] = useState<string>('standard');

  const [sleeveId, setSleeveId] = useState<string>('printed');
  const [sleeveVariantId, setSleeveVariantId] = useState<string>('board');
  // Qty-stage artwork: MRP house art by default; the button swaps in the
  // artist's temp artwork (Bill, Aug 16 2026).
  const [useArtistArt, setUseArtistArt] = useState(false);
  // Qty-stage record spins on hover, same feel as the hero discs.
  const qtySpin = useVinylSpin();

  const [labelId, setLabelId] = useState<LabelKind>('bw');
  const [holeId, setHoleId] = useState<string>('small');

  const [insertId, setInsertId] = useState<string>('none');
  const [insertVariantId, setInsertVariantId] = useState<string>('');

  const [stickerShapeId, setStickerShapeId] = useState<StickerShapeId | 'none'>('none');
  const [stickerSizeId, setStickerSizeId] = useState<string>('3x3');

  const [clientName, setClientName] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const [mgrName, setMgrName] = useState('');
  const [mgrEmail, setMgrEmail] = useState('');
  const [sentNames, setSentNames] = useState<string[]>([]);
  const [picking, setPicking] = useState(false); // modal open
  const [pickStep, setPickStep] = useState<'search' | 'confirm'>('search');
  const [pendingClient, setPendingClient] = useState<{ name: string; viaSpotify: boolean } | null>(null);
  const clientFirst = clientName ? clientName.split(' ')[0] : 'the client';
  // Send loop (Ruby handoff, Aug 19 2026): Send earns its blue only when an
  // artist is associated AND at least one recipient email is valid.
  const emailOk = (s: string) => /.+@.+\..+/.test(s.trim());
  const sendRecipients = [
    ...(emailOk(sendEmail) && pendingClient ? [{ name: pendingClient.name, email: sendEmail.trim() }] : []),
    ...(emailOk(mgrEmail) ? [{ name: mgrName.trim(), email: mgrEmail.trim() }] : []),
  ];
  const sendEarnedBase = !!pendingClient && sendRecipients.length >= 1;
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [qbDetailsOpen, setQbDetailsOpen] = useState(false);
  const [qbSetupOpen, setQbSetupOpen] = useState(false);
  // Real persistence: the row id once this estimate exists in press_estimates.
  // Null until the first save (POST); set after, so later saves PUT.
  const [rowId, setRowId] = useState<string | null>(estimateId);
  const [hydrated, setHydrated] = useState(false);
  // Serialize persistence: rowIdRef mirrors rowId synchronously so a second
  // persist that chains onto the first sees the just-minted id (state hasn't
  // flushed yet). persistChainRef holds the in-flight persist promise so we
  // chain rather than fire a parallel POST that would mint a duplicate row.
  const rowIdRef = useRef<string | null>(estimateId);
  const persistChainRef = useRef<Promise<{ id?: string } | null>>(Promise.resolve(null));

  // Collapse: the type grid folds to a summary row once a color is picked.
  const [typeOpen, setTypeOpen] = useState(true);

  // ── Apple-style progressive steps — each unlocks after the one before ──
  const [done, setDone] = useState<Set<StepKey>>(() => new Set());
  const mark = (k: StepKey) => setDone((p) => (p.has(k) ? p : new Set(p).add(k)));
  const picked = (k: StepKey) => done.has(k);
  const skipStep = (k: StepKey) =>
    (k === 'hole' && sizeId !== '7') ||
    (k === 'insert' && !insertsAvailableForSize(sizeId));
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
  const { colors: pressColors, types: pressColorTypes, fromCatalog, resolved: catalogResolved } = usePressCatalogSwatches();
  const colors = pressColors.filter((c) => c.sizes.includes(sizeId));

  // Snap a stale/foreign selection onto this press's catalog — only after
  // BOTH the saved estimate has hydrated and the catalog fetch has settled,
  // or a slow fetch would clobber a valid saved color with the demo fallback.
  useEffect(() => {
    if (!catalogResolved || (estimateId != null && !hydrated)) return;
    if (pressColors.length === 0) return;
    const current = pressColors.find((c) => c.id === colorId);
    if (!current) {
      const fb = pressColors.find((c) => c.sizes.includes(sizeId)) ?? pressColors[0];
      setColorId(fb.id);
      setColorKind(fb.kind);
    } else if (current.kind !== colorKind) {
      setColorKind(current.kind);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogResolved, hydrated, pressColors, colorId, colorKind, sizeId]);
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
    advance('size', 'step-discs');
    mark('size');
    touch();
    // colors: fall back to Classic Black when the color doesn't press this size
    if (!pressColors.find((c) => c.id === colorId)?.sizes.includes(id)) {
      const fb = pressColors.find((c) => c.sizes.includes(id)) ?? pressColors[0];
      if (fb) { setColorId(fb.id); setColorKind(fb.kind); }
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
    // sizes with no real insert styles skip the step entirely — auto-resolve
    // to None and un-mark it so the step comes back fresh on a size with options
    if (!insertsAvailableForSize(id)) {
      setInsertId('none');
      setInsertVariantId('');
      setDone((p) => {
        if (!p.has('insert')) return p;
        const n = new Set(p);
        n.delete('insert');
        return n;
      });
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
  const vinylDone = picked('size') && picked('weight') && picked('color');
  // Every line scales with the run (like the client estimate), anchored so
  // the 1,000-unit tier shows the exact MRP numbers.
  const minRun = vinylDone ? (DEFAULT_KIND_MIN_QTY[color.kind] ?? 0) : 0;
  const tierFactor = (q: number) => qtyScale(q) / 0.70;
  const unitFactor = tierFactor(picked('qty') ? qty : 1000);
  // Per-unit line prices — real Pricing-component rows ONLY. null = pending
  // (never a demo default): the line renders "Pricing pending", stays out of
  // the total, and blocks send-to-artist (Task #3243).
  const quoteLines: QuoteLine[] = [
    vinylDone ? (() => { const p = pricer.vinyl(color.name, color.kindNote, sizeId, weightId); return { id: 'vinyl', name: `${VINYL_SIZES.find((s) => s.id === sizeId)?.label ?? ''} · ${weightId}g ${color.name}`, note: discs > 1 ? `${discs} LP per record` : 'Vinyl', v: p == null ? null : p * discs }; })() : null,
    picked('label') ? (() => { const p = pricer.flat(`labels:${labelId}`); return { id: 'label', name: `${labelStyle.name} label`, note: discs > 1 ? 'Both discs' : undefined, v: p == null ? null : p * discs }; })() : null,
    picked('jacket') ? { id: 'jacket', name: `${jacketType.name} jacket`, v: pricer.flat(`jackets:${jacketType.id}`) } : null,
    picked('sleeve') ? { id: 'sleeve', name: `${sleeveType.name} sleeve`, v: pricer.flat(`sleeves:${sleeveType.id}`) } : null,
    picked('insert') && insertType.id !== 'none' ? { id: 'insert', name: insertType.name, v: pricer.flat(`inserts:${insertType.id}`) } : null,
    picked('sticker') && stickerShapeId !== 'none' ? { id: 'sticker', name: `${stickerShape?.name ?? 'Sticker'} sticker`, v: pricer.flat(`stickers:${stickerShapeId}`) } : null,
    vinylDone ? { id: 'assembly', name: 'Assembly', note: 'Insert placed on top before shrink', v: pricer.flat('service:assembly') } : null,
    vinylDone ? { id: 'shrink', name: 'Shrinkwrap', note: 'Retail-ready seal', v: pricer.flat('service:shrink') } : null,
  ].filter((x): x is QuoteLine => x !== null);
  const baseUnit = pricedSum(quoteLines);
  const perUnit = baseUnit * unitFactor;
  // One-time setup costs — also real-price-only now: each line resolves from
  // a `service:<id>` pricing row (0 renders "Included"); missing = pending.
  const QB_SETUP_LINES = [
    { id: 'cutting', name: 'Lacquer cutting', amount: pricer.flat('service:cutting') },
    { id: 'plating', name: 'Lacquer plating', amount: pricer.flat('service:plating') },
    { id: 'test', name: 'Test pressing', amount: pricer.flat('service:test'), note: 'Includes 2-day domestic shipping' },
    { id: 'stampers', name: 'Stampers', amount: pricer.flat('service:stampers') },
    { id: 'colorfee', name: 'Color setup fee', amount: pricer.flat('service:colorfee') },
  ];
  const QB_SETUP_TOTAL = QB_SETUP_LINES.reduce((acc, l) => acc + (l.amount ?? 0), 0);
  const total = picked('qty') ? perUnit * qty + QB_SETUP_TOTAL : 0;
  // Any picked line (or setup line) without a real price ⇒ the quote is
  // incomplete: total is flagged, and the firm send path is blocked.
  const pendingQuoteLines = pendingLines(quoteLines);
  const setupPending = QB_SETUP_LINES.some((l) => l.amount == null);
  const pricingPending = pendingQuoteLines.length > 0 || setupPending;
  const pendingCount = pendingQuoteLines.length + QB_SETUP_LINES.filter((l) => l.amount == null).length;
  // Send earns its blue only with an artist + valid recipient AND a fully
  // priced build — unpriced components downgrade to draft-only (Task #3243).
  const sendEarned = sendEarnedBase && !pricingPending;

  const perUnitAt = (q: number) => baseUnit * tierFactor(q);

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const sizeLabel = VINYL_SIZES.find((s) => s.id === sizeId)?.label ?? '';

  // ── Persistence (real save/send) ─────────────────────────────────────
  // payload.builderState is OURS to define: a flat snapshot of every builder
  // control + the completed-steps set (serialized to an array). Hydrating it
  // on mount restores the exact configuration the operator was building.
  const builderState = {
    sizeId, discs, qty, weightId, colorId, colorKind,
    // Catalog color + tier NAMES ride along so the server /send gate can
    // re-resolve the vinyl price row by name exactly like the pricer does.
    colorName: vinylDone ? color.name : null,
    colorTierName: vinylDone ? color.kindNote : null,
    jacketId, jacketVariantId, sleeveId, sleeveVariantId, useArtistArt,
    labelId, holeId, insertId, insertVariantId,
    stickerShapeId, stickerSizeId,
    clientName,
    done: Array.from(done),
  };
  // One-line build summary the summary bar / list rows show
  // (e.g. `12" · 500 · Ruby · Single Jacket`).
  const build = [
    sizeLabel,
    picked('qty') ? String(qty) : null,
    picked('color') ? color?.name : null,
    picked('jacket') ? jacketType?.name : null,
  ].filter(Boolean).join(' · ');
  const totalCents = Math.round(total * 100);

  // Hydrate from an existing estimate row on mount (estimateId != null).
  const { data: estimatesList } = useQuery<{ rows: Array<{ id: string; title: string; status: string; payload: any }> }>({
    queryKey: [`/api/press/${pressId}/estimates?kind=estimate`],
    enabled: estimateId != null,
  });
  useEffect(() => {
    if (hydrated || estimateId == null) return;
    const rows = estimatesList?.rows;
    if (!Array.isArray(rows)) return; // still loading — wait
    const row = rows.find((r) => r.id === estimateId);
    const bs = row?.payload?.builderState;
    if (bs && typeof bs === 'object') {
      if (typeof bs.sizeId === 'string') setSizeId(bs.sizeId);
      if (typeof bs.discs === 'number') setDiscs(bs.discs);
      if (typeof bs.qty === 'number') setQty(bs.qty);
      if (typeof bs.weightId === 'string') setWeightId(bs.weightId);
      if (typeof bs.colorId === 'string') setColorId(bs.colorId);
      if (typeof bs.colorKind === 'string') setColorKind(bs.colorKind);
      if (typeof bs.jacketId === 'string') setJacketId(bs.jacketId);
      if (typeof bs.jacketVariantId === 'string') setJacketVariantId(bs.jacketVariantId);
      if (typeof bs.sleeveId === 'string') setSleeveId(bs.sleeveId);
      if (typeof bs.sleeveVariantId === 'string') setSleeveVariantId(bs.sleeveVariantId);
      if (typeof bs.useArtistArt === 'boolean') setUseArtistArt(bs.useArtistArt);
      if (typeof bs.labelId === 'string') setLabelId(bs.labelId);
      if (typeof bs.holeId === 'string') setHoleId(bs.holeId);
      if (typeof bs.insertId === 'string') setInsertId(bs.insertId);
      if (typeof bs.insertVariantId === 'string') setInsertVariantId(bs.insertVariantId);
      if (typeof bs.stickerShapeId === 'string') setStickerShapeId(bs.stickerShapeId);
      if (typeof bs.stickerSizeId === 'string') setStickerSizeId(bs.stickerSizeId);
      if (typeof bs.clientName === 'string') setClientName(bs.clientName);
      if (Array.isArray(bs.done)) setDone(new Set(bs.done as StepKey[]));
    }
    // Row not found / no builderState → start fresh (leave defaults).
    setRowId(row?.id ?? null);
    rowIdRef.current = row?.id ?? null;
    setHydrated(true);
  }, [hydrated, estimateId, estimatesList]);

  // Persist a draft or a sent estimate. POST when fresh, PUT when a row
  // already exists; keep the returned id so the next save updates in place.
  // Read-only viewers can't write; every call is serialized onto the last one
  // (persistChainRef) so a Draft-then-Sent sequence PUTs the freshly-minted
  // row instead of POSTing a duplicate. Resolves to the saved row on success,
  // and throws on failure so callers only show success after an OK response.
  const persistEstimate = useCallback((status: 'Draft' | 'Sent', nameOverride?: string) => {
    if (!canEdit) return Promise.resolve(null);
    const name = nameOverride ?? clientName;
    const title = name || 'Untitled estimate';
    const payload = {
      builderState: { ...builderState, clientName: name ?? null },
      build,
      size: sizeId,
      direction: 'Outbound',
      source: 'Builder',
      totalCents,
      // Honest-quote flag (Task #3243): true when any picked component line
      // has no real price. The server refuses to send while it's set.
      pricingPending,
    };
    const run = async (): Promise<{ id?: string } | null> => {
      setSaving(true);
      setSaveError(null);
      try {
        let row: { id?: string };
        const existingId = rowIdRef.current;
        if (existingId) {
          const res = await apiRequest('PUT', `/api/press/${pressId}/estimates/${existingId}`, { title, status, payload });
          row = await res.json();
        } else {
          const res = await apiRequest('POST', `/api/press/${pressId}/estimates`, { kind: 'estimate', title, status, payload });
          row = await res.json();
        }
        if (row?.id) { rowIdRef.current = row.id; setRowId(row.id); }
        queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/estimates?kind=estimate`] });
        return row;
      } catch {
        setSaveError('Couldn’t save — check your connection and try again.');
        throw new Error('persist-failed');
      } finally {
        setSaving(false);
      }
    };
    // Chain onto the in-flight persist (if any) so writes never race. A failed
    // link resets the chain so the next attempt starts clean and can retry.
    const next = persistChainRef.current.catch(() => null).then(run);
    persistChainRef.current = next.catch(() => null);
    return next;
  }, [canEdit, builderState, build, sizeId, totalCents, pricingPending, clientName, pressId]);

  return (
    <div className="q-create-root font-sans" style={{ color: INK }}>
      <style>{Q_THEME_CSS}</style>
      {/* Frosted running summary — pinned under the top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-4"
        style={{
          height: 48, paddingLeft: 40, paddingRight: 40,
          background: 'var(--q-frost)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${PRESS_ACCENT}59`,
        }}>
        <div className="flex items-center gap-2 text-[12.5px] min-w-0" style={{ color: SUBINK }}>
          {picked('size') ? (
            <>
              <span className="font-semibold" style={{ color: INK }}>{sizeLabel}</span>
              {picked('discs') && discs > 1 && (<><span style={{ color: '#d0d0d5' }}>·</span><span>{discs} LP</span></>)}
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
          <span className="text-[12.5px]" style={{ color: SUBINK }}>
            Est. <span className="font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmt(perUnit)}</span> / unit
          </span>
          {picked('size') && pricingPending && (
            <span className="text-[11.5px] font-semibold rounded-full" style={{ padding: '3px 10px', background: '#b25e0918', color: '#b25e09' }} data-testid="strip-pricing-pending">
              Pricing pending
            </span>
          )}
          <span className="text-[13px] font-semibold rounded-full" style={{ padding: '4px 14px', background: `${PRESS_ACCENT}1f`, color: 'var(--q-accent-ink)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(total)}
          </span>
        </div>
      </div>

      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 36, paddingBottom: 96 }}>

        {/* Breadcrumb + page heading */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); onExit("estimates"); }} className="hover:text-slate-600 transition-colors">Estimates</a>
            <span style={{ color: '#d0d0d5' }}>›</span>
            <span style={{ color: SUBINK }}>Build an estimate</span>
          </div>
          <PageHeading lead="Build an estimate." rest="From scratch." />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: SUBINK }}>
            Pick the size once — every later choice is already sized to match.
            When you&rsquo;re done, the estimate saves to your catalog.
          </p>
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
                      // A real catalog with zero colors for this size = the press
                      // doesn't offer it — word + disabled state, never color alone.
                      const unavailable = fromCatalog && !pressColors.some((c) => c.sizes.includes(s.id));
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={unavailable ? undefined : () => selectSize(s.id)}
                          disabled={unavailable}
                          aria-pressed={active}
                          data-testid={`size-${s.id}`}
                          className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
                          style={{ flex: 1, padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: unavailable ? 'not-allowed' : 'pointer', opacity: unavailable ? 0.45 : 1 }}
                        >
                          <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{s.label}</div>
                          <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6' }}>{unavailable ? 'Not offered' : s.note}</div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Discs — 1LP..4LP (Bill, Aug 16 2026: "we forgot 1LP, 2LP, 3LP, 4LP") */}
                <Gate on={canDo('discs')}>
                <section id="step-discs" style={{ scrollMarginTop: 120 }}>
                  <StepHeading lead="How many discs." rest="Singles to box sets." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    Each disc adds a pressed record and its label. The jacket holds them all.
                  </p>
                  <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
                    {DISC_COUNTS.map((d) => {
                      const active = picked('discs') && d.n === discs;
                      return (
                        <button
                          key={d.n}
                          type="button"
                          onClick={() => { setDiscs(d.n); advance('discs', 'step-weight'); mark('discs'); touch(); }}
                          aria-pressed={active}
                          data-testid={`discs-${d.n}`}
                          className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
                          style={{ flex: 1, padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
                        >
                          <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{d.label}</div>
                          <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6' }}>{d.note}</div>
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
                    {VINYL_WEIGHTS.length} weights available from {pressBrandName}.
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
                            {pressColorTypes.find((t) => t.id === colorKind)?.name}
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
                        {pressColorTypes.map((t) => {
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
                      ? `${pressColorTypes.find((t) => t.id === colorKind)?.name} · ${colors.filter((c) => c.kind === colorKind).length} colors`
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
                  {jacketOptions.length} styles available from {pressBrandName} for {sizeLabel} records.
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
                    {picked('sleeve') ? sleeveType.note : 'Select a finish to add it to your estimate.'}
                  </p>
                </div>
              </>
            }
            right={
              <>
                <StepHeading lead="Pick an inner sleeve." rest="Printed, unprinted, or polylined." />
                <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                  {SLEEVE_OPTIONS.length} inner sleeve styles available from {pressBrandName}.
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
                        onSelect={() => { setLabelId(s.id); advance('label', insertsAvailable ? 'step-inserts' : 'step-stickers'); mark('label'); touch(); }}
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

        {/* ═══ 5 · INSERTS (Choose your inserts) — hidden entirely when the
            size has no real insert styles (skipStep auto-resolves to None) ═══ */}
        {insertsAvailable && (
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
                    ? `${visibleInserts.length - 1} insert styles available from ${pressBrandName} — or skip it.`
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
        )}

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

        {/* ═══ 7 · QUANTITY — moved to the end (Bill, Aug 16 2026): build the
            record first, then watch the run size drop the per-record price.
            Album on the left (jacket closed, inner sleeve peeking), the
            original quantity cards on the right (Bill feedback, Aug 16). */}
        <section id="step-qty" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={canDo('qty')}>
          <SplitSection
            left={
              <>
                {/* Artist-page treatment (Bill, Aug 16 2026): full-color cover
                    up front, inner sleeve a sliver + record peeking like the
                    Niina/Californialand card. Hover slides the sleeve out to a
                    full peek and the record further; off-hover they tuck back. */}
                <div className="relative group" style={{ width: JS_BASE + 140, maxWidth: '100%', height: JS_BASE + 12, overflow: 'clip' }} data-testid="qty-album-stage">
                  {/* record — the real VinylDisc render of the chosen color
                      (splatter layers and all), peeking right of the jacket */}
                  <div
                    className="qty-slide-part absolute transition-transform duration-500 ease-out group-hover:translate-x-11"
                    style={{ left: 140, top: 14, width: JS_BASE - 16, height: JS_BASE - 16, zIndex: 1, borderRadius: '50%', boxShadow: '0 2px 14px rgba(0,0,0,0.35)' }}
                    aria-hidden
                  >
                    <div onPointerEnter={qtySpin.onPointerEnter} onPointerLeave={qtySpin.onPointerLeave}>
                    <VinylDisc size={JS_BASE - 16} swatch={color} bodyRef={qtySpin.bodyRef} labelOverlay={
                    <div className="absolute rounded-full overflow-hidden" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: color.photo ? '40%' : '33.4%', height: color.photo ? '40%' : '33.4%', zIndex: 2 }}>
                      {labelStyle.id === 'color' && (useArtistArt ? (
                        <img src={niinaLabelArt} alt="" aria-hidden className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{
                          background:
                            'conic-gradient(from 210deg,' +
                            '#e91e8c 0deg, #8e2de2 55deg, #2a52d8 110deg,' +
                            '#0fa596 165deg, #2e9e3f 210deg, #d99a00 265deg,' +
                            '#e05a1a 305deg, #e91e8c 360deg)',
                        }}>
                          <PressLogoImg  alt="" aria-hidden style={{ width: '72%', height: '72%', objectFit: 'contain', filter: PRESS_MARK_ON_DARK, opacity: 0.95 }} />
                        </div>
                      ))}
                      {labelStyle.id === 'bw' && (
                        <div className="w-full h-full" style={{ background: '#ffffff' }}>
                          <PressLogoImg  alt="" aria-hidden className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '56%', height: '56%', objectFit: 'contain', filter: PRESS_MARK_ON_LIGHT, opacity: 0.78 }} />
                        </div>
                      )}
                      {labelStyle.id === 'blank' && <div className="w-full h-full" style={{ background: '#ffffff' }} />}
                      <div className="absolute rounded-full" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 9, height: 9, background: '#161617', zIndex: 3 }} />
                    </div>
                    } />
                    </div>
                    <div className="absolute" style={{ bottom: 4, right: -8, zIndex: 5 }}>
                      <RewindButton show={qtySpin.showRewind} onClick={qtySpin.rewind} size={28} />
                    </div>
                  </div>
                  {/* inner sleeve — a sliver at rest, expands out on hover */}
                  <div
                    className="qty-slide-part absolute rounded-sm transition-transform duration-500 ease-out group-hover:translate-x-6"
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
                    {look.printed && (useArtistArt ? (
                      <img src={californialandInnerSleeve} alt="" aria-hidden className="w-full h-full object-cover" />
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
                  {/* jacket — MRP house jacket by default; artist cover on swap.
                      PMP-style house jacket (Bill, Aug 16 2026): dark board, white
                      press mark, nothing else. Memphis will supply the real image;
                      white via the polarity-safe pressMark filter (any source polarity). */}
                  <div className="absolute overflow-hidden rounded-sm" style={{ left: 0, top: 0, width: JS_BASE, height: JS_BASE, zIndex: 3, boxShadow: '0 4px 22px rgba(0,0,0,0.35)' }}>
                    {useArtistArt ? (
                      <img src={californialandCover} alt="Artist cover" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: '#111112' }}>
                        <PressLogoImg  alt={pressBrandName} style={{ width: '52%', height: 'auto', filter: PRESS_MARK_ON_DARK, opacity: 0.92 }} />
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 360, color: '#a1a1a6' }}>
                  {useArtistArt ? 'Artist temp artwork for this estimate' : `${pressBrandName} house artwork by default`}
                  <span className="qty-hover-instruction"> — hover to slide the sleeve and record out.</span>
                </p>
                {/* Swap-in point (Bill, Aug 16 2026): a press can drop in the
                    artist's temp artwork, sleeve, and label for the quote;
                    otherwise the press default shows. Mock-only affordance. */}
                <button
                  type="button"
                  onClick={() => setUseArtistArt((v) => !v)}
                  aria-pressed={useArtistArt}
                  className="rounded-full text-[12px] font-medium transition-colors hover:bg-black/5"
                  style={{ marginTop: 10, padding: '6px 14px', border: `1px solid ${HAIRLINE}`, color: SUBINK, background: 'transparent', cursor: 'pointer' }}
                  data-testid="qty-swap-artwork"
                >
                  {useArtistArt ? `Back to ${pressBrandName} house artwork` : 'Use the artist\u2019s artwork instead\u2026'}
                </button>
              </>
            }
            right={
              <div className="flex flex-col" style={{ gap: 48 }}>
                <section>
                  <StepHeading lead="Pick a quantity." rest="Watch the price drop." />
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
                          onClick={() => { if (below) return; setQty(q); advance('qty', 'step-save'); mark('qty'); touch(); }}
                          aria-pressed={active}
                          data-testid={`qty-${q}`}
                          className={below ? 'rounded-2xl bg-white focus:outline-none' : 'rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none'}
                          style={{ padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: below ? 'default' : 'pointer', opacity: below ? 0.45 : 1 }}
                        >
                          <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK, fontVariantNumeric: 'tabular-nums' }}>{q.toLocaleString()}</div>
                          <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6' }}>units</div>
                          {below ? (
                            <div className="text-[12px] font-medium" style={{ marginTop: 6, color: '#a1a1a6' }}>Unavailable</div>
                          ) : (
                            <div className="text-[12px] font-medium" style={{ marginTop: 6, color: active ? BLUE : SUBINK, fontVariantNumeric: 'tabular-nums' }}>{fmt(perUnitAt(q))}<span style={{ color: '#a1a1a6', fontWeight: 400 }}> /unit</span></div>
                          )}
                        </button>
                      );
                    })}
                    {minRun > 0 && (
                      <div className="text-[11.5px]" style={{ gridColumn: '1 / -1', color: '#a1a1a6' }} data-testid="qty-min-note">
                        {color.name} is a splatter press — the press won't run it under {minRun.toLocaleString()} units.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            }
          />
          </Gate>
        </section>

        {/* ═══ 7 · SAVE ═══ */}
        <section id="step-save" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={allDone}>
          <div className="rounded-3xl bg-white" style={{ marginTop: 28, padding: 32, border: `1px solid ${HAIRLINE}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 32, alignItems: 'start' }}>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6', marginBottom: 10, paddingLeft: 20 }}>Prepared for</div>
                {clientName ? (
                  <div className="flex items-center gap-3" style={{ paddingLeft: 20 }} data-testid="quote-client-chosen">
                    <span style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }}>
                      {clientName === 'Niina Soleil'
                        ? <img src={californialandCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f0f2', color: '#a1a1a6', fontSize: 15, fontWeight: 600 }}>{clientName[0]}</span>}
                    </span>
                    <div>
                      <div className="text-[15px] font-semibold" style={{ color: INK }}>{clientName}</div>
                      <div className="text-[11.5px]" style={{ color: '#a1a1a6' }}>From your client list · via Spotify</div>
                    </div>
                  </div>
                ) : null}

                <div className="text-[12.5px]" style={{ marginTop: 18, color: SUBINK, lineHeight: 1.6, paddingLeft: 20 }}>
                  {sizeLabel} · {qty.toLocaleString()} units · {weightId}g · {color.name} · {labelStyle.name} label · {jacketType.name} · {sleeveType.name} sleeve
                  {insertType.id === 'none' ? '' : ` · ${insertType.name}`}
                  {stickerShape ? ` · ${stickerShape.name} sticker` : ''}
                </div>
                {/* Honest math, big finish — now in lockstep with the client
                    estimate (Bill, Aug 16 2026): Per record expands to the full
                    component breakdown, setup costs are in the math, hairlines
                    inset, gradient on the total band. */}
                <div className="rounded-2xl" style={{ marginTop: 20, border: `1px solid ${HAIRLINE}`, overflow: 'hidden', maxWidth: 560 }}>
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
                        <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ color: '#a1a1a6', transform: qbDetailsOpen ? 'rotate(180deg)' : 'none' }} />
                      </div>
                      <div className="text-[11.5px]" style={{ marginTop: 1, color: '#a1a1a6' }}>This exact build, at this run</div>
                    </div>
                    <span className="text-[14px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="quote-per-record">{fmt(perUnit)}</span>
                  </button>
                  {qbDetailsOpen && (
                    <div style={{ background: 'var(--q-canvas, #fafafa)' }}>
                      {quoteLines.map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-4" style={{ padding: '9px 20px 9px 34px', borderTop: `1px solid ${HAIRLINE}` }}>
                          <div>
                            <div className="text-[12.5px] font-medium" style={{ color: INK }}>{l.name}</div>
                            {l.note && <div className="text-[11px]" style={{ color: '#a1a1a6', marginTop: 1 }}>{l.note}</div>}
                          </div>
                          {l.v == null ? (
                            <span className="text-[12px] font-medium" style={{ color: '#b25e09', whiteSpace: 'nowrap' }} data-testid={`quote-line-pending-${l.id}`}>Pricing pending · custom estimate</span>
                          ) : (
                            <span className="text-[12.5px]" style={{ color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(l.v * unitFactor)} <span style={{ color: '#a1a1a6', fontSize: 11 }}>/unit</span></span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: qbDetailsOpen ? 0 : '0 20px' }} />
                  <div className="flex items-center justify-between" style={{ padding: '14px 20px' }}>
                    <div>
                      <div className="text-[13.5px] font-medium" style={{ color: INK }}>Run</div>
                      <div className="text-[11.5px]" style={{ marginTop: 1, color: '#a1a1a6' }}>{discs > 1 ? `${discs} LP per record, pressed and packed` : 'Pressed and packed'}</div>
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
                        <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ color: '#a1a1a6', transform: qbSetupOpen ? 'rotate(180deg)' : 'none' }} />
                      </div>
                      <div className="text-[11.5px]" style={{ marginTop: 1, color: '#a1a1a6' }}>One-time · same at any run size</div>
                    </div>
                    <span className="text-[14px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="quote-setup">{fmt(QB_SETUP_TOTAL)}</span>
                  </button>
                  {qbSetupOpen && (
                    <div style={{ background: 'var(--q-canvas, #fafafa)' }}>
                      {QB_SETUP_LINES.map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-4" style={{ padding: '8px 20px 8px 34px', borderTop: `1px solid ${HAIRLINE}` }}>
                          <div>
                            <div className="text-[12px]" style={{ color: SUBINK }}>{l.name}</div>
                            {l.note && <div className="text-[11px]" style={{ color: '#a1a1a6', marginTop: 1, opacity: 0.8 }}>{l.note}</div>}
                          </div>
                          <span className="text-[12px]" style={{ color: l.amount == null ? '#b25e09' : l.amount === 0 ? '#a1a1a6' : SUBINK, fontVariantNumeric: 'tabular-nums' }}>{l.amount == null ? 'Pricing pending' : l.amount === 0 ? 'Included' : fmt(l.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end justify-between gap-4" style={{ padding: '16px 20px 18px', borderTop: `1px solid ${HAIRLINE}`, background: 'linear-gradient(180deg, rgba(49,158,216,0.10) 0%, rgba(49,158,216,0.02) 100%)' }}>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: BLUE }}>Estimate total{pricingPending ? ' · incomplete' : ''}</div>
                      <div className="text-[11.5px]" style={{ marginTop: 3, color: SUBINK }}>If {clientFirst} presses the full run</div>
                      {pricingPending && (
                        <div className="text-[11.5px] font-medium" style={{ marginTop: 4, color: '#b25e09', maxWidth: 320 }} data-testid="quote-total-pending-note">
                          Excludes {pendingCount} line{pendingCount === 1 ? '' : 's'} awaiting pricing — this build can be saved as a draft, but not sent as a firm estimate yet.
                        </div>
                      )}
                    </div>
                    <span className="font-semibold tracking-tight" style={{ fontSize: 34, lineHeight: 1, color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="quote-total-hero">{fmt(total)}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-3 flex-shrink-0">
                {picking && !saved && (
                  /* The real Otis "Add a person" flow, lifted verbatim in structure
                     (Bill, Aug 16 2026): overlay modal so staff never leave the
                     estimate. Adding the person sets up the artist — the estimate
                     lives on their profile, visible when they're invited. */
                  <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '9vh 20px 20px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} data-testid="quote-client-modal">
                    <div style={{ width: 560, maxWidth: '100%', borderRadius: 20, background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.10)', color: '#f5f5f7', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
                      {/* header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{pickStep === 'search' ? 'Add a person' : 'Confirm person'}</div>
                        <button type="button" aria-label="Close" onClick={() => { setPicking(false); setPickStep('search'); setPendingClient(null); }} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.10)', border: 'none', color: '#f5f5f7', cursor: 'pointer', fontSize: 15 }}>✕</button>
                      </div>
                      {pickStep === 'search' ? (
                        <div style={{ padding: '20px 24px 24px' }}>
                          {/* Catalog-first search (apple-canon dark input: inset
                              surface, white-alpha hairline, INK text). Spotify
                              only appears when the catalog comes up empty. */}
                          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: 'var(--apple-faint, #6e6e73)' }}>Name</div>
                          <input
                            autoFocus
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            placeholder="Search your catalog"
                            className="w-full focus:outline-none placeholder:text-white/30"
                            style={{ marginTop: 8, borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: '#26262a', color: '#f5f5f7', padding: '10px 14px', fontSize: 15 }}
                            data-testid="quote-client-search"
                          />
                          <div style={{ fontSize: 12.5, color: '#98989d', marginTop: 8 }}>
                            We search your own catalog first — pasting a Spotify or Apple Music link works too.
                          </div>
                          {clientSearch.trim() !== '' && clientRoster.filter((c) => c.toLowerCase().includes(clientSearch.toLowerCase())).length > 0 && (
                            <>
                              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: 'var(--apple-faint, #6e6e73)', marginTop: 20 }}>In your catalog</div>
                              <div style={{ marginTop: 8, borderRadius: 12, border: '1px solid rgba(255,255,255,0.10)', overflow: 'hidden' }}>
                                {clientRoster.filter((c) => c.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 4).map((c, i) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => { setPendingClient({ name: c, viaSpotify: false }); setPickStep('confirm'); }}
                                    className="w-full flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
                                    style={{ padding: '10px 16px', background: 'transparent', border: 'none', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.10)', color: '#f5f5f7', cursor: 'pointer', fontSize: 15 }}
                                  >
                                    <span style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(255,255,255,0.14)' }}>
                                      {c === 'Niina Soleil'
                                        ? <img src={californialandCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.10)', color: '#98989d', fontSize: 14, fontWeight: 600 }}>{c[0]}</span>}
                                    </span>
                                    {c}
                                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden style={{ marginLeft: 'auto' }}><path d="M6 3.5L10.5 8L6 12.5" fill="none" stroke="#6e6e73" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                          {clientSearch.trim() !== '' && clientRoster.filter((c) => c.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                            /* Empty state: catalog exhausted — only now does Spotify appear. */
                            <div style={{ marginTop: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.10)', padding: '22px 20px', textAlign: 'center' }} data-testid="quote-client-no-match">
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#f5f5f7' }}>No match in your catalog</div>
                              <div style={{ fontSize: 12.5, color: '#98989d', marginTop: 4 }}>They may be new to you — try Spotify, or enter them manually.</div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
                                <button type="button" className="hover:bg-white/5 transition-colors" style={{ background: 'none', border: 'none', borderRadius: 999, color: '#98989d', fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: '10px 14px' }}>Enter manually</button>
                                <button
                                  type="button"
                                  onClick={() => { setPendingClient({ name: clientSearch.trim(), viaSpotify: true }); setPickStep('confirm'); }}
                                  className="transition-opacity hover:opacity-90"
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 999, background: '#1DB954', border: 'none', color: '#0b0b0c', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                                  data-testid="quote-spotify-search"
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.5a.7.7 0 0 1-1 .2c-2.6-1.6-5.9-2-9.8-1.1a.7.7 0 0 1-.3-1.4c4.2-1 7.9-.5 10.8 1.3.3.2.4.7.3 1zm1.2-2.9a.9.9 0 0 1-1.2.3c-3-1.8-7.5-2.4-11-1.3a.9.9 0 0 1-.5-1.7c4-1.2 9-.6 12.4 1.5.4.2.5.8.3 1.2zm.1-3a1 1 0 0 1-1.4.4C13 9 7.9 8.8 4.6 9.8a1 1 0 1 1-.6-2c3.8-1.1 9.5-.9 13.5 1.5.5.3.7.9.4 1.3z" /></svg>
                                  Search "{clientSearch.trim()}" on Spotify
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : pendingClient && (
                        <div style={{ padding: '20px 24px 24px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)' }}>
                            <span style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(255,255,255,0.14)' }}>
                              {pendingClient.name === 'Niina Soleil'
                                ? <img src={californialandCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.10)', color: '#a1a1a6', fontSize: 24, fontWeight: 600 }}>{pendingClient.name[0]}</span>}
                            </span>
                            <div>
                              <div style={{ fontSize: 18, fontWeight: 700 }}>{pendingClient.name}</div>
                              <div style={{ fontSize: 13, color: '#a1a1a6', marginTop: 3 }}>{pendingClient.viaSpotify ? 'Spotify · profile and catalog will be pulled in the background' : 'In your catalog'}</div>
                              {pendingClient.name === 'Niina Soleil' && <div style={{ fontSize: 13, color: '#a1a1a6', marginTop: 2 }}>Latest release: "Californialand"</div>}
                            </div>
                          </div>
                          <div style={{ fontSize: 12.5, color: '#a1a1a6', marginTop: 14, lineHeight: 1.6 }}>
                            This estimate will live on their profile — they'll see it there when you invite them.
                          </div>
                          {pricingPending && (
                            <div role="note" style={{ fontSize: 12.5, color: '#f2a35c', marginTop: 12, lineHeight: 1.6 }} data-testid="quote-send-pending-block">
                              This build includes {pendingCount} component{pendingCount === 1 ? '' : 's'} awaiting pricing — it's saved as a draft, but it can't be sent as a firm estimate until every line has a real price.
                            </div>
                          )}
                          <input
                            value={sendEmail}
                            onChange={(e) => setSendEmail(e.target.value)}
                            placeholder={`${pendingClient.name.split(' ')[0]}'s email`}
                            className="w-full focus:outline-none"
                            style={{ marginTop: 14, borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#f5f5f7', padding: '10px 14px', fontSize: 14 }}
                            data-testid="quote-send-email"
                          />
                          {/* Optional manager pair — a second private-link recipient. */}
                          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                            <input
                              value={mgrName}
                              onChange={(e) => setMgrName(e.target.value)}
                              placeholder="Manager name (optional)"
                              className="focus:outline-none"
                              style={{ flex: 1, borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#f5f5f7', padding: '10px 14px', fontSize: 14 }}
                              data-testid="quote-send-mgr-name"
                            />
                            <input
                              value={mgrEmail}
                              onChange={(e) => setMgrEmail(e.target.value)}
                              placeholder="Manager email"
                              className="focus:outline-none"
                              style={{ flex: 1, borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#f5f5f7', padding: '10px 14px', fontSize: 14 }}
                              data-testid="quote-send-mgr-email"
                            />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
                            <button type="button" onClick={() => { setPickStep('search'); setPendingClient(null); }} style={{ padding: '11px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.10)', border: 'none', color: '#f5f5f7', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Back</button>
                            {/* Send earns its blue only once the artist is associated
                                AND at least one recipient email is valid (canon). */}
                            <button
                              type="button"
                              disabled={saving || !sendEarned}
                              onClick={async () => {
                                if (!sendEarned) return;
                                const chosen = pendingClient.name;
                                try {
                                  // Save the configuration WITHOUT flipping status — /send is the
                                  // single authoritative Draft→Sent transition (it mints the share
                                  // token server-side). Persisting 'Sent' first left a Sent row with
                                  // no link/mail if the send call never reached the server.
                                  const row = await persistEstimate('Draft', chosen);
                                  const estId = row?.id ?? rowIdRef.current;
                                  if (!estId) {
                                    setSaveError('Couldn’t send — check your connection and try again.');
                                    return;
                                  }
                                  const res = await apiRequest('POST', `/api/press/${pressId}/estimates/${estId}/send`, {
                                    artistName: chosen,
                                    recipients: sendRecipients.map((r) => ({ name: r.name, email: r.email })),
                                  });
                                  const sent = await res.json() as { sentCount?: number; attempted?: number };
                                  queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/estimates?kind=estimate`] });
                                  if ((sent.sentCount ?? 0) === 0) {
                                    // Row is Sent + private link minted, but no email was delivered —
                                    // say so instead of quietly claiming success.
                                    setSaveError('Estimate saved and its private link created, but the email couldn’t be delivered — check the address and send again.');
                                    return; // stay in the modal; saveError shows below
                                  }
                                } catch {
                                  setSaveError('Couldn’t send — check your connection and try again.');
                                  return; // stay in the modal; saveError shows below
                                }
                                setSentNames(sendRecipients.map((r) => r.name || r.email));
                                setClientName(chosen); setSaved(true); setPicking(false); setPickStep('search');
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 7, padding: '11px 20px', borderRadius: 10,
                                background: sendEarned ? BLUE : 'transparent',
                                border: sendEarned ? '1px solid transparent' : '1px solid rgba(255,255,255,0.14)',
                                color: sendEarned ? '#fff' : '#a1a1a6',
                                fontSize: 14, fontWeight: 700,
                                cursor: saving || !sendEarned ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
                              }}
                              data-testid="quote-save-confirm"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              {saving ? 'Sending…' : 'Send estimate'}
                            </button>
                          </div>
                          {saveError && (
                            <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: '#ff6b6b', textAlign: 'right' }} data-testid="quote-save-error">{saveError}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {saved ? (
                  <div className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: '#34a853' }} data-testid="quote-saved-note">
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', background: '#34a85315',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </span>
                    {sentNames.length > 0
                      ? <>Sent — {sentNames.join(' and ')} got a private link</>
                      : <>Saved to Estimates — sent to {clientFirst}</>}
                  </div>
                ) : (picking || !canEdit) ? null : (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPkgNaming(true)}
                      className="rounded-full text-[14px] font-semibold transition-colors hover:opacity-80"
                      style={{ height: 44, padding: '0 22px', border: `1px solid ${HAIRLINE}`, background: 'var(--q-card)', color: INK, cursor: 'pointer' }}
                      data-testid="button-save-as-package"
                    >
                      Create package
                    </button>
                    <Button
                      className="rounded-full px-7"
                      style={{ background: BLUE, color: '#fff', height: 44, fontSize: 14.5 }}
                      onClick={() => { setPicking(true); void persistEstimate('Draft'); }}
                      data-testid="quote-save"
                    >
                      Send estimate
                    </Button>
                  </div>
                )}
                {canEdit && !saved && !picking && (
                  <p className="text-[11.5px] text-right" style={{ color: '#a1a1a6', whiteSpace: 'nowrap' }}>
                    Packages skip quantity and price — artists pick their quantity later.
                  </p>
                )}

                {/* Save as Package (Bill, Aug 16 2026): the same config, kept as
                    a reusable named package — auto-priced from the component
                    prices, offered to artists as a quick pick. */}
                {pkgSaved ? (
                  <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: '#34a853' }} data-testid="package-saved-note">
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#34a85315', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </span>
                    "{pkgName || 'Untitled package'}" saved to Product Specs › {`${pressBrandShort} Packages`}
                  </div>
                ) : pkgNaming ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={pkgName}
                      onChange={(e) => setPkgName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && pkgName.trim()) setPkgSaved(true); if (e.key === 'Escape') setPkgNaming(false); }}
                      placeholder="Name this package"
                      className="rounded-full text-[13px] focus:outline-none"
                      style={{ height: 36, padding: '0 14px', border: `1px solid ${HAIRLINE}`, background: 'var(--q-card)', color: INK, width: 200 }}
                      data-testid="input-package-name"
                    />
                    <button
                      type="button"
                      onClick={() => { setPkgNaming(false); setPkgName(''); }}
                      className="text-[13.5px] font-medium transition-opacity hover:opacity-70"
                      style={{ background: 'none', border: 'none', color: SUBINK, cursor: 'pointer', padding: '0 6px' }}
                      data-testid="button-package-name-cancel"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => pkgName.trim() && setPkgSaved(true)}
                      className="rounded-full text-[13.5px] font-semibold transition-all"
                      style={{ height: 36, padding: '0 18px', border: 'none', background: pkgName.trim() ? BLUE : 'rgba(128,128,136,0.25)', color: pkgName.trim() ? '#fff' : '#a1a1a6', cursor: pkgName.trim() ? 'pointer' : 'default' }}
                      data-testid="button-package-name-save"
                    >
                      Save
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          </Gate>
        </section>
      </div>
    </div>
  );
}

export default PressQuoteBuilder;
