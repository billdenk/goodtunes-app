// PressCatalogVinylLabels — a PRESS-facing "Center labels" catalog page where a
// record pressing plant defines the center-label STYLES they offer.
//
// A center label is the round printed disc glued in the middle of the record.
// This page is about labels ONLY — not vinyl colors, not jackets.
//
//   • LEFT — a large, calm record DISC that live-previews the selected label
//     style (label prominent), rendered with the same PNG-mask kit + fixed-shine
//     spin physics used everywhere else.
//   • RIGHT — one step: pick from THREE label styles (Blank / Black & White /
//     Full Color), each a mini disc render focused on the label.
//
// Apple canon: two-tone headings, frosted/blurred chrome, hairline borders,
// generous whitespace, no emojis, real ® character. Self-contained handoff copy:
// compiles alone with only react + lucide-react + local image assets.

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
  Bell,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  RotateCcw,
  ChevronRight,
  Layers,
  Moon,
  Sun,
} from 'lucide-react';
import { Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate } from 'lucide-react';
import goodtunesLogo from './assets/goodtunes-logo.png';
import mrpLogo from './assets/mrp-logo.png';
// MRP's real logo mark (black, single-color vector) for the record label.
import mrpLabelLogo from './assets/mrp-logo.svg';
import brandonPhoto from './assets/brandon-seavers.png';

// ─── Per-press identity ──────────────────────────────────────────────
// Per-press: every press sees their own name/logo here (e.g. Hellbender), never Memphis's.
const MOCK_PRESS = {
  name: 'Memphis Record Pressing',
  logo: mrpLogo,
  // MRP's brand: a BLACK center label with their WHITE logo. The supplied
  // asset is black, so invert it to white for the label print.
  labelLogo: mrpLabelLogo,
  labelLogoFilter: 'invert(1) brightness(1.7)',
};

// ─── Themes — light = apple-canon (default, unchanged); dark = charcoal ──
// The shell chrome, cards, and page surfaces read from THEMES[mode]. Light is
// the default so the canon rendering stays pixel-identical. Dark = charcoal
// admin canon (NEVER navy). The vinyl disc render, album art, splatter masks,
// and product imagery are NOT themed — they look the same in both modes.
type Theme = {
  blue: string;      // single accent
  ink: string;       // headline ink
  subink: string;    // calm secondary gray
  faint: string;     // faintest tertiary gray (was #a1a1a6)
  hairline: string;  // whisper-quiet border
  chevron: string;   // breadcrumb chevron (was #d0d0d5)
  canvas: string;    // page canvas (also the spindle-hole "see-through" fill)
  rail: string;      // left-rail surface
  card: string;      // raised card / active nav pill surface
  pillShadow: string;
  headerBg: string;  // sticky translucent header
  searchPlaceholder: string; // input placeholder class
  searchBg: string;  // search input surface
  avatarRing: string;   // logo/avatar carrier ring
  hoverWash: string;    // rail/nav hover class
  menuWash: string;     // popover/list-item hover class
  crumbHover: string;   // breadcrumb link hover class
  logoFilter?: string;  // CSS invert for the dark-only wordmark asset
  popBorder: string;    // popover border color
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
};

const MOCK_LABEL_STYLES: LabelStyle[] = [
  {
    id: 'blank',
    name: 'Blank',
    note: 'Unprinted white label. No artwork required.',
  },
  {
    id: 'bw',
    name: 'Black & White',
    note: 'White label with a single-color black logo print.',
  },
  {
    id: 'color',
    name: 'Full Color',
    note: 'Vibrant full-color label — artists supply the design.',
  },
];

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

// ─── The white press logo mark + quiet catalog arc text ──────────────
// Printed on the label, so it rotates with the record body. The arc text is
// mush when small, so it only shows on large labels.
function LabelLogo({ size, whiteFilter = true, offsetRight = false }: { size: number; whiteFilter?: boolean; offsetRight?: boolean }) {
  // offsetRight: 7" labels put the logo beside the hole (the large jukebox
  // hole would punch through a centered logo), so shift it to the right side.
  const showArcText = size >= 70 && !offsetRight;
  const arcTextFill = whiteFilter ? 'rgba(245,245,247,0.55)' : 'rgba(0,0,0,0.38)';
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      <img
        src={MOCK_PRESS.labelLogo}
        alt=""
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          // The 7" big-hole label leaves only a ~0.9" ring of paper between the
          // 1.5" hole and the 3.3" label edge, so the logo sits small, centered
          // in that ring on the right side (band center ≈ 73% of label radius).
          left: offsetRight ? '13.5%' : '50%',
          transform: 'translate(-50%, -50%)',
          width: size * (offsetRight ? 0.18 : 0.9),
          height: size * (offsetRight ? 0.18 : 0.9),
          objectFit: 'contain',
          filter: whiteFilter ? MOCK_PRESS.labelLogoFilter : undefined,
        }}
      />
      {showArcText && (
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <path id="lbl-arc-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill={arcTextFill} style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#lbl-arc-bottom" startOffset="50%" textAnchor="middle">
              MRP-001 · 33 ⅓ RPM
            </textPath>
          </text>
        </svg>
      )}
    </div>
  );
}

// ─── The center label — renders per style over the black disc ────────
function CenterLabel({ kind, size, offsetLogo = false }: { kind: LabelKind; size: number; offsetLogo?: boolean }) {
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
        {showLogo && <LabelLogo size={size} whiteFilter={false} offsetRight={offsetLogo} />}
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
      {showLogo && <LabelLogo size={size} offsetRight={offsetLogo} />}
    </div>
  );
}

// ─── JS-driven hover-spin physics (self-contained; duplicated per file) ──
// Hover → the body spins at 360°/8s via rAF. Pointer leaves → freeze at the
// current angle (like stopping a record by hand). If left off-upright, a quiet
// rewind affordance appears; clicking it eases the disc back to 0° along the
// shortest accumulated path. Honors prefers-reduced-motion (no spin/rewind).
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
}: {
  size: number;
  kind: LabelKind;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  /** Center hole diameter as a fraction of the disc. Standard spindle ≈ 0.025 (0.3"/12"). */
  holeRatio?: number;
  /** Center label diameter as a fraction of the disc. Defaults to 12" spec (3.94/12). */
  labelRatio?: number;
  /** 7" labels: park the logo to the right of the hole. */
  offsetLogo?: boolean;
  /** The spindle hole is a "see-through" cut — fill it with the surface behind the disc so it reads as a hole in both themes. */
  holeFill: string;
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
        <CenterLabel kind={kind} size={labelSize} offsetLogo={offsetLogo} />

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
function LabelStage({ kind, holeRatio, discSize = 300, labelRatio, offsetLogo = false, t }: { kind: LabelKind; holeRatio?: number; discSize?: number; labelRatio?: number; offsetLogo?: boolean; t: Theme }) {
  const DISC_SIZE = discSize;
  const { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind } = useVinylSpin();
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      {/* Fixed-height stage so the layout doesn't jump between sizes; the
          disc rests on the stage floor so the contact shadow stays under it. */}
      <div style={{ position: 'relative', height: 300, display: 'flex', alignItems: 'flex-end' }}>
        <div onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} style={{ transition: 'all 0.4s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <LabelDisc size={DISC_SIZE} kind={kind} bodyRef={bodyRef} holeRatio={holeRatio} labelRatio={labelRatio} offsetLogo={offsetLogo} holeFill={t.canvas} />
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

// ─── Label style option tile (Apple-canon card, mini disc) ───────────
function LabelTile({
  style,
  active,
  onSelect,
  discSize = 96,
  labelRatio,
  holeRatio,
  offsetLogo = false,
  t,
}: {
  style: LabelStyle;
  active: boolean;
  onSelect: () => void;
  /** Mini disc size — scales with the selected record size. */
  discSize?: number;
  labelRatio?: number;
  holeRatio?: number;
  offsetLogo?: boolean;
  t: Theme;
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
            <LabelDisc size={discSize} kind={style.id} labelRatio={labelRatio} holeRatio={holeRatio} offsetLogo={offsetLogo} holeFill={t.card} />
          </div>
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
        {style.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: t.faint, lineHeight: 1.35 }}>
        {style.note}
      </div>
    </div>
  );
}

// ─── Shell primitives (Press persona, mirrors PressDashboard) ────────
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

function NavRow({ label, icon: Icon, active, t }: PressNavItem & { t: Theme }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
        !active && t.hoverWash,
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? t.ink : t.subink,
        backgroundColor: active ? t.card : undefined,
        boxShadow: active ? t.pillShadow : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.ink : t.faint }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

// ─── Catalog + Components pull-downs ──────────────────────────────────
const COMPONENTS_CHILDREN: { label: string; mock: string }[] = [
  { label: 'Vinyl', mock: 'PressVinylColorSetup' },
  { label: 'Jackets', mock: 'ArtistChooseJacket' },
  { label: 'Inner Sleeves', mock: 'ArtistChooseInnerSleeve' },
  { label: 'Center Labels', mock: 'PressCatalogVinylLabels' },
  { label: 'Inserts', mock: 'ArtistChooseInserts' },
  { label: 'Stickers', mock: 'PressCatalogStickers' },
  { label: 'Pricing', mock: 'PressCatalogPricing' },
];
const COMPONENTS_ACTIVE = 'Center Labels';


type CatalogChild = { label: string; icon: typeof LayoutDashboard; soon?: boolean; active?: boolean };
const CATALOG_CHILDREN: CatalogChild[] = [
  { label: 'GoodTunes Packages', icon: NavPackage },
  { label: 'White Label', icon: NavLayers, soon: true },
  { label: 'GoodDeed Certificates', icon: NavAward },
  { label: 'Specs', icon: NavWave, soon: true },
  { label: 'Templates', icon: NavTemplate, soon: true },
];

function CatalogRail({ item, t }: { item: PressNavItem; t: Theme }) {
  const [catalogOpen, setCatalogOpen] = useState(true);
  const [componentsOpen, setComponentsOpen] = useState(true);
  const CatalogIcon = item.icon;
  return (
    <>
      <button
        type="button"
        aria-expanded={catalogOpen}
        onClick={() => setCatalogOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
          !item.active && t.hoverWash,
        )}
        style={{
          fontWeight: item.active ? 600 : 500,
          color: item.active ? t.ink : t.subink,
          backgroundColor: item.active ? t.card : undefined,
          boxShadow: item.active ? t.pillShadow : undefined,
        }}
      >
        <CatalogIcon className="w-4 h-4 flex-shrink-0" style={{ color: item.active ? t.ink : t.faint }} />
        <span className="truncate flex-1 text-left">{item.label}</span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint, transform: catalogOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      <div className="space-y-0.5">
        {CATALOG_CHILDREN.map(({ label, icon: Icon, soon, active }) => (
          <a
            key={label}
            href="#"
            onClick={(e) => e.preventDefault()}
            className={cn('flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors', !active && t.hoverWash)}
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? t.ink : t.subink,
              backgroundColor: active ? t.card : undefined,
              boxShadow: active ? t.pillShadow : undefined,
            }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.ink : t.faint }} />
            <span className="truncate flex-1">{label}</span>
            {soon && (
              <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.hairline, color: t.subink }}>
                Request
              </span>
            )}
          </a>
        ))}
      </div>


      <button
        type="button"
        aria-expanded={componentsOpen}
        onClick={() => setComponentsOpen((v) => !v)}
        className={cn('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', t.hoverWash)}
        style={{ fontWeight: 500, color: t.subink }}
      >
        <Layers className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
        <span className="truncate flex-1 text-left">Components</span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint, transform: componentsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {componentsOpen && (
        <div className="space-y-0.5" style={{ marginLeft: 18, paddingLeft: 12, borderLeft: `1px solid ${t.hairline}` }}>
          {COMPONENTS_CHILDREN.map((c) => {
            const active = c.label === COMPONENTS_ACTIVE;
            return (
              <a
                key={c.label}
                href={`#/${c.mock}`}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] transition-colors',
                  !active && t.hoverWash,
                )}
                style={{
                  fontWeight: active ? 600 : 500,
                  color: active ? t.ink : t.subink,
                  backgroundColor: active ? t.card : undefined,
                  boxShadow: active ? t.pillShadow : undefined,
                }}
              >
                <span className="truncate flex-1">{c.label}</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

const USER_FIRST_NAME = 'Brandon';
const USER_EMAIL = 'brandon@memphisrecordpressing.com';
const USER_INITIALS = 'BS';

const USER_MENU: Array<{ label: string; icon: typeof UserPen }> = [
  { label: 'Edit profile', icon: UserPen },
  { label: 'Invite teammate', icon: UserPlus },
  { label: 'Security', icon: ShieldCheck },
];

function UserMenu({ t }: { t: Theme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn('w-8 h-8 rounded-full overflow-hidden ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-shadow', t.avatarRing)}
        aria-label="Account menu"
        aria-expanded={open}
        data-testid="button-user-menu"
      >
        <img src={brandonPhoto} alt={USER_INITIALS} className="w-full h-full object-cover" />
      </button>
      {open && (
        <div
          className="w-64 p-0 rounded-2xl"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 40,
            border: `1px solid ${t.popBorder}`,
            backgroundColor: t.card,
            color: t.ink,
            boxShadow: '0 10px 40px rgba(0,0,0,0.18)',
          }}
          data-testid="menu-user"
        >
          <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${t.hairline}` }}>
            <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{USER_FIRST_NAME}</div>
            <div className="text-[11.5px] truncate" style={{ color: t.subink }}>{USER_EMAIL}</div>
          </div>
          <div className="py-1.5">
            {USER_MENU.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.label}
                  type="button"
                  className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.menuWash)}
                  style={{ color: t.ink }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
          <div className="py-1.5" style={{ borderTop: `1px solid ${t.hairline}` }}>
            <button
              type="button"
              className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.menuWash)}
              style={{ color: t.ink }}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PressShell({ children, t }: { children: ReactNode; t: Theme }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{
          backgroundColor: t.headerBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${t.hairline}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* White logo carrier chip stays white in BOTH themes — it's the light surface. */}
          <span className={cn('h-9 w-9 rounded-full bg-white ring-1 flex items-center justify-center flex-shrink-0 p-1', t.avatarRing)}>
            <img src={MOCK_PRESS.logo} alt={MOCK_PRESS.name} className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>
            {MOCK_PRESS.name}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            className={cn('h-8 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors', t.hoverWash)}
            style={{ color: t.subink, paddingLeft: 12, paddingRight: 12 }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <button
            type="button"
            className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu t={t} />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside
          className="w-60 flex-shrink-0 flex flex-col"
          style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}
        >
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
              <input
                className={cn('w-full h-9 pl-8 pr-2 rounded-full text-[12.5px] focus:outline-none', t.searchPlaceholder)}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.searchBg }}
                placeholder="Search…  ⌘K"
                readOnly
              />
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {PRESS_NAV.map((item) =>
              item.label === 'Catalog'
                ? <CatalogRail key={item.label} item={item} t={t} />
                : <NavRow key={item.label} {...item} t={t} />
            )}
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: t.logoFilter }} />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
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

// ─── Page ────────────────────────────────────────────────────────────
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

export function PressCatalogVinylLabels() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const t = THEMES[mode];
  const [selectedId, setSelectedId] = useState<LabelKind>('bw');
  const [selectedSizeId, setSelectedSizeId] = useState<string>('12');
  const [selectedHoleId, setSelectedHoleId] = useState<string>('small');
  const selected = MOCK_LABEL_STYLES.find((s) => s.id === selectedId) ?? MOCK_LABEL_STYLES[0];

  const is7 = selectedSizeId === '7';
  const hole = is7
    ? HOLE_OPTIONS.find((h) => h.id === selectedHoleId) ?? HOLE_OPTIONS[0]
    : HOLE_OPTIONS[0];

  // Proportional geometry from the selected size's real-world specs.
  const sizeSpec = VINYL_SIZES.find((s) => s.id === selectedSizeId) ?? VINYL_SIZES[2];
  const discSize = Math.round(sizeSpec.inches * DISC_PX_PER_INCH);
  const labelRatio = sizeSpec.labelInches / sizeSpec.inches;
  const holeRatio = hole.holeInches / sizeSpec.inches;
  // Only the 7" big-hole pressing needs the small side logo — the hole would
  // punch through a centered one. 7" small hole keeps the large center logo.
  const offsetLogo = is7 && hole.id === 'large';
  // Tile mini discs scale with the selected record size (96px = 12").
  const tileDiscSize = Math.round(96 * (sizeSpec.inches / 12));

  return (
    <PressShell t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>
        {/* Quiet opening header */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
            <a href="#" onClick={(e) => e.preventDefault()} className={cn('transition-colors', t.crumbHover)}>
              Catalog
            </a>
            <span style={{ color: t.chevron }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className={cn('transition-colors', t.crumbHover)}>
              Vinyl
            </a>
            <span style={{ color: t.chevron }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className={cn('transition-colors', t.crumbHover)}>
              Components
            </a>
            <span style={{ color: t.chevron }}>›</span>
            <span style={{ color: t.subink }}>Center Labels</span>
          </div>
          <PageHeading lead="Center labels." rest="Create your options." t={t} />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
            Pick the label styles you offer. Artists choose from these when they design a record with {MOCK_PRESS.name}.
          </p>
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
              <LabelStage kind={selectedId} holeRatio={holeRatio} discSize={discSize} labelRatio={labelRatio} offsetLogo={offsetLogo} t={t} />
              <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: t.subink }}>
                <span className="font-semibold" style={{ color: t.ink }}>
                  {VINYL_SIZES.find((s) => s.id === selectedSizeId)?.label} {selected.name}
                </span>
                {is7 && (
                  <>
                    <span style={{ color: t.chevron }}>·</span>
                    <span>{hole.label}</span>
                  </>
                )}
              </div>
              <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 320, color: t.faint }}>
                {selected.note}
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
              <StepHeading lead="Pick a type." rest="Which label styles?" t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                The center label is the round printed disc glued in the middle of the record.
              </p>
              <div
                style={{
                  marginTop: 18,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                {MOCK_LABEL_STYLES.map((s) => (
                  <LabelTile
                    key={s.id}
                    style={s}
                    active={s.id === selectedId}
                    onSelect={() => setSelectedId(s.id)}
                    discSize={tileDiscSize}
                    labelRatio={labelRatio}
                    holeRatio={holeRatio}
                    offsetLogo={offsetLogo}
                    t={t}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* MOCK-ONLY chrome — remove when wiring real theming. */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-30 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </PressShell>
  );
}

export default PressCatalogVinylLabels;
