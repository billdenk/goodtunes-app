// PressLabelsComponent — Center Labels surface for the press portal, ported
// verbatim from handoff/press-components/PressCatalogVinylLabels.tsx.
//
// A center label is the round printed disc glued in the middle of the record.
// This page is about labels ONLY — not vinyl colors, not jackets.
//
//   • LEFT — a large, calm record DISC that live-previews the selected label
//     style (label prominent), rendered with the same PNG-mask kit + fixed-shine
//     spin physics used everywhere else.
//   • RIGHT — pick from the label styles (Blank / Black & White / Full Color),
//     each a mini disc render focused on the label. Each card carries an
//     "Offered" toggle — that is the real surface the press configures.
//
// Chrome (PressShell / rail / header / breadcrumb / theme pill) is MOCK-ONLY and
// stripped — OperatorShell provides the portal chrome. Only the main-content
// body renders here. Theme comes from the app's real admin theme source.

import { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, Check, Minus, Loader2 } from 'lucide-react';
import { useAdminDark } from '@/lib/adminAppearance';
import { resolvePressMarkLogo, resolvePressMarkLogoOnLight, type PressComponentsPayload } from './usePressComponents';
import { WhiteMarkGlyph } from './PressMarkGlyph';
import type { LabelsComponentConfig } from '@shared/pressComponents';

// ─── Themes — light = apple-canon (default, unchanged); dark = charcoal ──
type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  chevron: string;
  canvas: string;
  rail: string;
  card: string;
  pillShadow: string;
  headerBg: string;
  searchPlaceholder: string;
  searchBg: string;
  avatarRing: string;
  hoverWash: string;
  menuWash: string;
  crumbHover: string;
  logoFilter?: string;
  popBorder: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    blue: '#319ED8',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    hairline: '#e6e6ea',
    chevron: '#d0d0d5',
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    pillShadow: '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.72)',
    searchPlaceholder: 'placeholder:text-slate-400',
    searchBg: '#ffffff',
    avatarRing: 'ring-slate-200',
    hoverWash: 'hover:bg-slate-200',
    menuWash: 'hover:bg-slate-50',
    crumbHover: 'hover:text-slate-600',
    logoFilter: undefined,
    popBorder: '#e6e6ea',
  },
  dark: {
    blue: '#319ED8',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    hairline: 'rgba(255,255,255,0.10)',
    chevron: '#48484c',
    canvas: '#161617',
    rail: '#1c1c1e',
    card: '#1e1e20',
    pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    searchBg: '#26262a',
    avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5',
    menuWash: 'hover:bg-white/5',
    crumbHover: 'hover:text-white',
    logoFilter: 'invert(1) brightness(1.8)',
    popBorder: 'rgba(255,255,255,0.10)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Vinyl layer kit (from SplatterVinylPreview) ─────────────────────
import layerOpaque from './assets/vinyl-layers/opaque-vinyl.png';
import layerHighlights from './assets/vinyl-layers/vinyl-highlights.png';
import layerInner from './assets/vinyl-layers/inner-circle.png';

const LAYERS = {
  opaque: layerOpaque,
  highlights: layerHighlights,
  inner: layerInner,
};

// ─── The three center-label styles a press can offer ─────────────────
type LabelKind = 'blank' | 'bw' | 'color';

type LabelStyle = {
  id: LabelKind;
  name: string;
  note: string;
  offered: boolean;
};

// Press identity — labelLogoUrl is the per-press white label mark.
type PressIdentity = PressComponentsPayload['press'];

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

// ─── The white press logo mark ───────────────────────────────────────
// Printed on the label, so it rotates with the record body. Decorative
// RPM/catalog arc text was removed (Task #3445) — the label is logo-only.
// labelLogoUrl is assumed already white-reading — no Memphis invert filter.
function LabelLogo({
  size,
  whiteFilter = true,
  offsetRight = false,
  press,
}: {
  size: number;
  whiteFilter?: boolean;
  offsetRight?: boolean;
  press: PressIdentity;
}) {
  // offsetRight: 7" labels put the logo beside the hole (the large jukebox
  // hole would punch through a centered logo), so shift it to the right side.
  // Resolve through the shared surface-aware chains: dark faces prefer the
  // label/dark mark (rendered white via mask); white stock prefers the
  // uploaded LIGHT-background artwork (Task #3446 — MRP's black mark, not
  // the white labelLogoUrl that vanished on white).
  const markUrl = whiteFilter ? resolvePressMarkLogo(press) : resolvePressMarkLogoOnLight(press);
  // When null render the label without a logo mark.
  if (!markUrl) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      {whiteFilter ? (
        // Dark label face — render the mark WHITE via mask so any uploaded
        // logo color reads correctly on dark stock.
        <WhiteMarkGlyph
          logoUrl={markUrl}
          size={size * (offsetRight ? 0.18 : 0.9)}
          opacity={1}
          style={{
            position: 'absolute',
            top: '50%',
            // The 7" big-hole label leaves only a ~0.9" ring of paper between
            // the 1.5" hole and the 3.3" label edge, so the logo sits small,
            // centered in that ring (band center ≈ 73% of label radius).
            left: offsetRight ? '13.5%' : '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ) : (
        // Light label stock — logo as uploaded.
        <img
          src={markUrl}
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
          }}
        />
      )}
    </div>
  );
}

// ─── The center label — renders per style over the black disc ────────
function CenterLabel({
  kind,
  size,
  offsetLogo = false,
  press,
}: {
  kind: LabelKind;
  size: number;
  offsetLogo?: boolean;
  press: PressIdentity;
}) {
  // Common label disc frame.
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
    // White paper label — unprinted. Light radial keeps it from reading flat.
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
    // White label with the black logo — clean single-color print on white stock.
    return (
      <div style={{ ...base, background: 'radial-gradient(circle at 42% 36%, #ffffff 0%, #f4f4f4 60%, #ebebeb 100%)', boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.07)' }}>
        {showLogo && <LabelLogo size={size} whiteFilter={false} offsetRight={offsetLogo} press={press} />}
      </div>
    );
  }

  // Full color — an iridescent CD-light sunburst: conic hue wheel softened by
  // a warm radial and a cool radial, with the white logo overlaid on top.
  return (
    <div style={{ ...base }}>
      {/* Conic hue sweep — the sunburst */}
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
      {/* Warm radial glow (bottom-right) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(60% 60% at 70% 74%, rgba(255,210,74,0.55), rgba(255,210,74,0) 62%)',
          mixBlendMode: 'screen',
        }}
      />
      {/* Cool iridescent radial (top-left) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(55% 55% at 30% 26%, rgba(120,150,255,0.55), rgba(120,150,255,0) 60%)',
          mixBlendMode: 'screen',
        }}
      />
      {/* Soft vignette so the logo reads clearly — tracks the logo position */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: offsetLogo
            ? 'radial-gradient(20% 20% at 13.5% 50%, rgba(0,0,0,0.52), rgba(0,0,0,0) 74%)'
            : 'radial-gradient(46% 46% at 50% 50%, rgba(0,0,0,0.52), rgba(0,0,0,0) 74%)',
        }}
      />
      {showLogo && <LabelLogo size={size} offsetRight={offsetLogo} press={press} />}
    </div>
  );
}

// ─── JS-driven hover-spin physics (self-contained; duplicated per file) ──
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

const SPIN_DPS = 360 / 8000; // degrees per millisecond (one rev / 8s)
const REWIND_MS = 700;
const REWIND_EASE = (t: number) => 1 - Math.pow(1 - t, 3); // ease-out cubic

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
    const target = start - (((start % 360) + 360) % 360); // nearest upright below
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

// ─── Quiet Apple-canon rewind affordance ─────────────────────────────
function RewindButton({ show, onClick, size = 28, t }: { show: boolean; onClick: () => void; size?: number; t: Theme }) {
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
        background: t.headerBg,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${t.hairline}`,
        boxShadow: t.pillShadow,
        color: t.subink,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = t.ink; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = t.subink; }}
    >
      <RotateCcw style={{ width: size * 0.5, height: size * 0.5 }} />
    </button>
  );
}

// ─── The record disc render — a label kind drives the center label ───
function LabelDisc({
  size,
  kind,
  bodyRef,
  holeRatio = 0.025,
  labelRatio,
  offsetLogo = false,
  holeFill,
  press,
}: {
  size: number;
  kind: LabelKind;
  bodyRef?: React.RefObject<HTMLDivElement>;
  holeRatio?: number;
  labelRatio?: number;
  offsetLogo?: boolean;
  holeFill: string;
  press: PressIdentity;
}) {
  const LABEL_RATIO = labelRatio ?? (3.94 / 12);
  const INNER_RATIO = 129 / 1104;
  const labelSize = size * LABEL_RATIO;
  const spin = !!bodyRef;

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
      {/* ── Rotating record body: grooves, label, inner detail ── */}
      <div
        ref={bodyRef}
        style={{ position: 'absolute', inset: 0, borderRadius: '50%', willChange: spin ? 'transform' : undefined }}
      >
        <MaskLayer color="#0b0b0d" mask={LAYERS.opaque} />

        {/* Groove texture — faint angular conic irregularity so spin reads. */}
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

        {/* Center label — part of the record, rotates with the body. */}
        <CenterLabel kind={kind} size={labelSize} offsetLogo={offsetLogo} press={press} />

        {/* Inner circle detail — also on the disc */}
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

      {/* ── Fixed sheen — never rotates (fixed light on a spinning record). ── */}
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

      {/* Spindle hole — a HOLE punched through: fill with the stage canvas so
          you see "through" it, with an inset ring reading as a cut edge. */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * holeRatio,
          height: size * holeRatio,
          borderRadius: '50%',
          backgroundColor: holeFill,
          boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ─── Left preview stage — one large label disc ───────────────────────
function LabelStage({ kind, holeRatio, discSize = 300, labelRatio, offsetLogo = false, t, press }: { kind: LabelKind; holeRatio?: number; discSize?: number; labelRatio?: number; offsetLogo?: boolean; t: Theme; press: PressIdentity }) {
  const DISC_SIZE = discSize;
  const { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind } = useVinylSpin();
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      {/* Fixed-height stage so the layout doesn't jump between sizes; the
          disc rests on the stage floor so the contact shadow stays under it. */}
      <div style={{ position: 'relative', height: 300, display: 'flex', alignItems: 'flex-end' }}>
        <div onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} style={{ transition: 'all 0.4s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <LabelDisc size={DISC_SIZE} kind={kind} bodyRef={bodyRef} holeRatio={holeRatio} labelRatio={labelRatio} offsetLogo={offsetLogo} holeFill={t.canvas} press={press} />
        </div>
        {/* Disc contact shadow */}
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
        {/* Rewind affordance — bottom-right of the disc */}
        <div style={{ position: 'absolute', bottom: 4, right: -8, zIndex: 5 }}>
          <RewindButton show={showRewind} onClick={rewind} size={28} t={t} />
        </div>
      </div>
    </div>
  );
}

// ─── Offered pill — word + shape (colorblind rule) ───────────────────
function OfferedPill({ offered, t }: { offered: boolean; t: Theme }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full text-[11px] font-semibold"
      style={{
        padding: '3px 9px',
        backgroundColor: offered ? 'rgba(49,158,216,0.14)' : t.hairline,
        color: offered ? t.blue : t.subink,
        border: `1px solid ${offered ? 'rgba(49,158,216,0.35)' : t.hairline}`,
      }}
    >
      {offered ? <Check className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {offered ? 'Offered' : 'Not offered'}
    </span>
  );
}

// ─── Label style option tile (Apple-canon card, mini disc) ───────────
function LabelTile({
  style,
  active,
  onSelect,
  onToggleOffered,
  canEdit,
  discSize = 96,
  labelRatio,
  holeRatio,
  offsetLogo = false,
  t,
  press,
}: {
  style: LabelStyle;
  active: boolean;
  onSelect: () => void;
  onToggleOffered: () => void;
  canEdit: boolean;
  discSize?: number;
  labelRatio?: number;
  holeRatio?: number;
  offsetLogo?: boolean;
  t: Theme;
  press: PressIdentity;
}) {
  return (
    // Static mini disc — spin & rewind live on the large preview only.
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      aria-pressed={active}
      data-testid={`label-${style.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 16, backgroundColor: t.card, border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}` }}
    >
      {/* Thumbnail area — fixed 96px box so cards stay aligned; the disc
          inside scales to match the selected record size. */}
      <div className="flex justify-center" style={{ marginBottom: 12 }}>
        <div style={{ width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ transition: 'all 0.35s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
            <LabelDisc size={discSize} kind={style.id} labelRatio={labelRatio} holeRatio={holeRatio} offsetLogo={offsetLogo} holeFill={t.card} press={press} />
          </div>
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
        {style.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: t.faint, lineHeight: 1.35 }}>
        {style.note}
      </div>

      {/* Offered control — word + shape. This is the real surface the press
          configures. Read-only for staff. */}
      <div style={{ marginTop: 12 }}>
        {canEdit ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleOffered(); }}
            aria-pressed={style.offered}
            data-testid={`toggle-offered-${style.id}`}
            className="focus:outline-none"
            style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
          >
            <OfferedPill offered={style.offered} t={t} />
          </button>
        ) : (
          <span data-testid={`offered-state-${style.id}`}>
            <OfferedPill offered={style.offered} t={t} />
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Two-tone headings ───────────────────────────────────────────────
function PageHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.faint, fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

function StepHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 600 }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.faint }}>{rest}</span>
    </h2>
  );
}

// ─── Record sizes ─────────────────────────────────────────────────────
// Discs render proportionally to the 12" (300px): 10" → 250px, 7" → 175px.
// Label diameters per spec: 12" & 10" carry a 3.94" label; 7" carries 3.3".
const VINYL_SIZES = [
  { id: '7',  label: '7"',  note: 'Single',        inches: 7,  labelInches: 3.3 },
  { id: '10', label: '10"', note: 'EP',            inches: 10, labelInches: 3.94 },
  { id: '12', label: '12"', note: 'LP · Standard', inches: 12, labelInches: 3.94 },
];
const DISC_PX_PER_INCH = 300 / 12;

// 7" records press with either the 0.3" spindle hole or the 1.5" jukebox hole.
const HOLE_OPTIONS = [
  { id: 'small', label: 'Small Hole', note: 'Standard 0.3" spindle — plays anywhere.', holeInches: 0.3 },
  { id: 'large', label: 'Large Hole', note: 'Classic 1.5" jukebox 45 — needs an adapter on home turntables.', holeInches: 1.5 },
];

// ─── Component ────────────────────────────────────────────────────────
export function PressLabelsComponent({ payload, canEdit, save, saving }: {
  payload: PressComponentsPayload;
  canEdit: boolean;
  save: (config: LabelsComponentConfig) => void;
  saving: boolean;
}) {
  const t = THEMES[useAdminDark() ? 'dark' : 'light'];
  const press = payload.press;

  // Local editing state seeded from the payload slice. Re-seed ONLY when the
  // press identity changes AND the user has no unsaved edits.
  const [styles, setStyles] = useState<LabelStyle[]>(payload.labels.styles);
  const dirtyRef = useRef(false);
  const pressIdRef = useRef(press.id);
  useEffect(() => {
    if (pressIdRef.current !== press.id) {
      pressIdRef.current = press.id;
      if (!dirtyRef.current) {
        setStyles(payload.labels.styles);
      }
    }
  }, [press.id, payload.labels.styles]);

  const [selectedId, setSelectedId] = useState<LabelKind>('bw');
  const [selectedSizeId, setSelectedSizeId] = useState<string>('12');
  const [selectedHoleId, setSelectedHoleId] = useState<string>('small');
  const selected = styles.find((s) => s.id === selectedId) ?? styles[0];

  const is7 = selectedSizeId === '7';
  const hole = is7
    ? HOLE_OPTIONS.find((h) => h.id === selectedHoleId) ?? HOLE_OPTIONS[0]
    : HOLE_OPTIONS[0];

  // Proportional geometry from the selected size's real-world specs.
  const sizeSpec = VINYL_SIZES.find((s) => s.id === selectedSizeId) ?? VINYL_SIZES[2];
  const discSize = Math.round(sizeSpec.inches * DISC_PX_PER_INCH);
  const labelRatio = sizeSpec.labelInches / sizeSpec.inches;
  const holeRatio = hole.holeInches / sizeSpec.inches;
  const offsetLogo = is7 && hole.id === 'large';
  const tileDiscSize = Math.round(96 * (sizeSpec.inches / 12));

  const toggleOffered = (id: LabelKind) => {
    if (!canEdit) return;
    const next = styles.map((s) => (s.id === id ? { ...s, offered: !s.offered } : s));
    setStyles(next);
    dirtyRef.current = true;
    save({ styles: next });
  };

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96, backgroundColor: t.canvas, color: t.ink }}>
      {/* Quiet opening header */}
      <div className="min-w-0">
        <div className="flex items-center gap-2" style={{ minHeight: 20 }}>
          <PageHeading lead="Center labels." rest="Create your options." t={t} />
        </div>
        <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
          Pick the label types you offer. Artists choose from these when they design a record with {press.name}.
        </p>
        {saving && (
          <div className="flex items-center gap-1.5 text-[12px]" style={{ marginTop: 10, color: t.subink }} data-testid="labels-saving">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
          </div>
        )}
      </div>

      {/* Split: sticky disc stage · label picker */}
      <div
        style={{
          marginTop: 40,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 520px',
          gap: 56,
          alignItems: 'start',
        }}
      >
        {/* LEFT — the calm label-disc stage (sticky) */}
        <div className="sticky" style={{ top: 88 }}>
          <div className="flex flex-col items-center">
            <LabelStage kind={selectedId} holeRatio={holeRatio} discSize={discSize} labelRatio={labelRatio} offsetLogo={offsetLogo} t={t} press={press} />
            <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: t.subink }}>
              <span className="font-semibold" style={{ color: t.ink }}>
                {VINYL_SIZES.find((s) => s.id === selectedSizeId)?.label} {selected?.name}
              </span>
              {is7 && (
                <>
                  <span style={{ color: t.chevron }}>·</span>
                  <span>{hole.label}</span>
                </>
              )}
            </div>
            <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 320, color: t.faint }}>
              {selected?.note}
            </p>
          </div>
        </div>

        {/* RIGHT — pick a size → (7" hole) → pick a label style */}
        <div className="min-w-0 flex flex-col" style={{ gap: 48 }}>
          {/* Size */}
          <section>
            <StepHeading lead="Pick a size." rest="The record sets the fit." t={t} />
            <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
              The record size determines which center labels fit.
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
              {VINYL_SIZES.map((s) => {
                const active = s.id === selectedSizeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSizeId(s.id)}
                    aria-pressed={active}
                    data-testid={`size-${s.id}`}
                    className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
                    style={{ flex: 1, padding: '16px 12px', backgroundColor: t.card, border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`, textAlign: 'center', cursor: 'pointer' }}
                  >
                    <div className="text-[17px] font-semibold" style={{ color: active ? t.blue : t.ink }}>{s.label}</div>
                    <div className="text-[11px]" style={{ marginTop: 3, color: t.faint }}>{s.note}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 7" hole — only 7" records offer the jukebox large hole */}
          {is7 && (
            <section>
              <StepHeading lead="Pick a hole." rest="Spindle or jukebox." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                7&quot; records press with a small spindle hole or the classic large 45 hole.
              </p>
              <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
                {HOLE_OPTIONS.map((h) => {
                  const active = h.id === selectedHoleId;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setSelectedHoleId(h.id)}
                      aria-pressed={active}
                      data-testid={`hole-${h.id}`}
                      className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
                      style={{ flex: 1, padding: '16px 12px', backgroundColor: t.card, border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`, textAlign: 'center', cursor: 'pointer' }}
                    >
                      <div className="text-[15px] font-semibold" style={{ color: active ? t.blue : t.ink }}>{h.label}</div>
                      <div className="text-[11px]" style={{ marginTop: 3, color: t.faint, lineHeight: 1.4 }}>{h.note}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <StepHeading lead="Pick a type." rest="Which label types?" t={t} />
            <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
              The center label is the round printed disc glued in the middle of the record.
              {canEdit ? ' Toggle Offered on each type you want artists to choose from.' : ''}
            </p>
            <div
              style={{
                marginTop: 18,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              {styles.map((s) => (
                <LabelTile
                  key={s.id}
                  style={s}
                  active={s.id === selectedId}
                  onSelect={() => setSelectedId(s.id)}
                  onToggleOffered={() => toggleOffered(s.id)}
                  canEdit={canEdit}
                  discSize={tileDiscSize}
                  labelRatio={labelRatio}
                  holeRatio={holeRatio}
                  offsetLogo={offsetLogo}
                  t={t}
                  press={press}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default PressLabelsComponent;
